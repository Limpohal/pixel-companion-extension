/*
 * stress-headless.js — long-run stability, leak and cost checks.
 *
 * Boots the real content scripts against a virtual clock and a counting canvas,
 * then runs the equivalent of ~17 minutes of 60fps use while watching for the
 * failures that only show up over time:
 *
 *   - listener / timer / interval / DOM growth (bubbles, squash, scroll debounce)
 *   - the rAF loop surviving enable/disable cycles without stacking
 *   - skin, size and speed changes under load
 *   - heap growth over a long session
 *
 * It also benchmarks the two per-frame costs (sprite draw + bot tick) so a
 * renderer regression shows up as a number, not a vibe.
 *
 * Run: node --expose-gc test/stress-headless.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const G = 64;
const FILES = ['content/art.js', 'content/character.js', 'content/synth.js',
               'content/speech.js', 'content/behaviors.js', 'content/content.js'];

let pass = 0, fail = 0;
const problems = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + label + (detail ? '  (' + detail + ')' : '')); }
  else {
    fail++;
    problems.push(label + (detail ? '  -> ' + detail : ''));
    console.log('  FAIL ' + label + (detail ? '  -> ' + detail : ''));
  }
}
const mb = n => Math.round(n / 1048576 * 10) / 10 + ' MB';
const gc = typeof global.gc === 'function' ? global.gc : function () {};

/* ---------------------------------------------------------------- *
 * virtual clock + DOM stub
 * ---------------------------------------------------------------- */
let now = 1000;
const listeners = { document: [], window: [] };
const timers = new Map();          // id -> {due, fn}
const intervals = new Map();       // id -> {next, period, fn}
let timerSeq = 0, intervalSeq = 0;
const rafQueue = new Map();        // id -> fn
let rafSeq = 0;
const rafStats = { scheduled: 0, cancelled: 0 };

function makeEl(className) {
  const el = {
    style: { cssText: '', setProperty() {} },
    children: [],
    parentNode: null,
    _cls: className || '',
    set className(v) { this._cls = v; },
    get className() { return this._cls; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter(k => k !== c); return c; },
    offsetWidth: 120,
    offsetHeight: 28,
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
    scrollHeight: 5000,
    scrollTop: 0
  };
  return el;
}

/* Counting canvas: no pixel buffer, so a 60k-frame run stays fast.  It counts
   the draw calls and alpha-mask readbacks instead. */
function makeCanvas() {
  const cv = {
    width: 0, height: 0, _fills: 0, _clears: 0, _reads: 0,
    style: {},
    addEventListener() {}, removeEventListener() {}
  };
  cv.getContext = function () {
    return {
      canvas: cv,
      imageSmoothingEnabled: false,
      fillStyle: '#000',
      fillRect() { cv._fills++; },
      clearRect() { cv._clears++; },
      getImageData(x, y, w, h) {
        cv._reads++;
        return { data: new Uint8ClampedArray(Math.max(0, w * h * 4)), width: w, height: h };
      }
    };
  };
  return cv;
}

function makeDom() {
  const body = makeEl('body');
  const documentEl = makeEl('html');
  const doc = {
    documentElement: documentEl,
    body: body,
    createElement(tag) {
      if (tag === 'canvas') return makeCanvas();
      return makeEl(tag);
    },
    addEventListener(type, fn, capture) {
      listeners.document.push({ type: type, fn: fn, capture: !!capture });
    },
    removeEventListener(type, fn) {
      listeners.document = listeners.document.filter(
        l => !(l.type === type && l.fn === fn));
    }
  };
  return { doc, body, documentEl };
}

/* chrome.storage stub with a live onChanged hook */
const storeState = { settings: null, sites: {} };
const hooks = { onChanged: null };

function runDueTimers() {
  for (let guard = 0; guard < 1000; guard++) {
    let ran = false;
    for (const [id, t] of Array.from(timers)) {
      if (t.due <= now) { timers.delete(id); t.fn(); ran = true; }
    }
    for (const [id, it] of Array.from(intervals)) {
      let n = 0;
      while (it.next <= now && n++ < 50) {
        it.next += it.period;
        if (intervals.get(id) === it) { it.fn(); ran = true; }
      }
    }
    if (!ran) break;
  }
}

function pump(frames, dt) {
  dt = dt || 1000 / 60;
  const errors = [];
  for (let i = 0; i < frames; i++) {
    now += dt;
    runDueTimers();
    const batch = Array.from(rafQueue.entries());
    rafQueue.clear();
    for (const [id, fn] of batch) {
      try { fn(now); } catch (e) { errors.push(e); break; }
    }
    if (errors.length) break;
    /* a stopped loop schedules nothing; keep advancing the clock so timers
       still fire the way they would in a hidden tab */
  }
  return errors;
}

/* ---------------------------------------------------------------- *
 * boot the real content scripts
 * ---------------------------------------------------------------- */
storeState.settings = {
  enabled: true, size: 4, speed: 1, sound: false, speech: false,
  character: 'bot', theme: 'system'
};
const { doc, body, documentEl } = makeDom();
const sandbox = {
  console,
  performance: { now: () => now },
  requestAnimationFrame(fn) { const id = ++rafSeq; rafQueue.set(id, fn); rafStats.scheduled++; return id; },
  cancelAnimationFrame(id) { if (rafQueue.delete(id)) rafStats.cancelled++; },
  setTimeout(fn, ms) { const id = ++timerSeq; timers.set(id, { due: now + (ms || 0), fn }); return id; },
  clearTimeout(id) { timers.delete(id); },
  setInterval(fn, ms) { const id = ++intervalSeq; const p = Math.max(1, ms || 1); intervals.set(id, { next: now + p, period: p, fn }); return id; },
  clearInterval(id) { intervals.delete(id); },
  innerWidth: 1200,
  innerHeight: 800,
  devicePixelRatio: 1,
  scrollY: 0,
  location: { origin: 'http://localhost:8765' },
  document: doc,
  addEventListener(type, fn, capture) { listeners.window.push({ type, fn, capture: !!capture }); },
  removeEventListener(type, fn) {
    listeners.window = listeners.window.filter(l => !(l.type === type && l.fn === fn));
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
/* the storage stub must schedule through the SANDBOX timer, not Node's, or the
   async read never resolves inside the virtual clock */
sandbox.chrome = {
  storage: {
    local: {
      get(keys, cb) {
        sandbox.setTimeout(function () {
          cb({ pbc_settings: storeState.settings, pbc_sites: storeState.sites });
        }, 0);
      },
      set() {}
    },
    onChanged: { addListener(fn) { hooks.onChanged = fn; } }
  }
};
vm.createContext(sandbox);
for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}

/* let the async storage read resolve and the first frames run, then let the
   first ambient bubble finish so listener counts are taken on a quiet page */
pump(5);
pump(400);
const botEl = () => body.children.filter(c => c._cls === 'pbc-bot')[0] || null;
const liveBubbles = () => body.children.filter(c => c._cls === 'pbc-bubble').length;
const winCount = t => listeners.window.filter(l => l.type === t).length;
const docCount = t => listeners.document.filter(l => l.type === t).length;
const loopArmed = () => rafQueue.size > 0;

/* ---------------------------------------------------------------- *
 * 1. baseline
 * ---------------------------------------------------------------- */
console.log('\nBOOT');
ok('one companion element mounted', !!botEl());
ok('animation loop armed', loopArmed());
ok('world listeners bound (mousemove, mouseleave, scroll, resize, blur)',
   winCount('mousemove') === 1 && winCount('mouseleave') === 1 &&
   winCount('scroll') === 1 && winCount('resize') === 1 && winCount('blur') === 1,
   'win=' + listeners.window.length);
ok('pointer listeners bound on document (6)',
   ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'touchstart']
     .every(t => docCount(t) === 1));

const base = {
  win: listeners.window.length,
  doc: listeners.document.length,
  bodyKids: body.children.length,
  intervals: intervals.size,
  heap: (gc(), process.memoryUsage().heapUsed)
};
console.log('  baseline: ' + base.win + ' window / ' + base.doc + ' doc listeners, ' +
            base.bodyKids + ' body children, ' + base.intervals + ' intervals, ' +
            mb(base.heap) + ' heap');

/* ---------------------------------------------------------------- *
 * 2. long run — 60k frames ≈ 16.7 minutes at 60fps
 * ---------------------------------------------------------------- */
console.log('\nLONG RUN (60,000 frames ≈ 16.7 min)');
const FRAMES = 60000;
const SAMPLES = 12;
let maxBubbles = 0, maxBodyKids = 0;
const t0 = process.hrtime.bigint();
let errors = [];
for (let s = 0; s < SAMPLES; s++) {
  errors = errors.concat(pump(FRAMES / SAMPLES));
  maxBubbles = Math.max(maxBubbles, liveBubbles());
  maxBodyKids = Math.max(maxBodyKids, body.children.length);
  if (errors.length) break;
}
const runMs = Number(process.hrtime.bigint() - t0) / 1e6;
ok('60k frames run without an exception', errors.length === 0,
   errors[0] && errors[0].stack && errors[0].stack.split('\n')[1]);
ok('at most one live speech bubble at any sample', maxBubbles <= 1, 'max ' + maxBubbles);
ok('body never accumulates elements', maxBodyKids <= 2, 'max ' + maxBodyKids);
console.log('  simulated ' + Math.round(FRAMES / 60) + 's of use in ' + Math.round(runMs) + 'ms (' +
            (runMs / FRAMES).toFixed(3) + ' ms/frame, counting canvas)');

/* The long run deliberately exercised speech bubbles.  For the exact counter
   checks below, stop ambient speaking and drain any bubble still on screen —
   otherwise a bubble that spawns mid-assertion legitimately changes the
   listener/child counts and makes the test flap. */
setSettings({ enabled: true, size: 4, speed: 1, sound: false, speech: false,
              character: 'bot', theme: 'system' });
for (let i = 0; i < 400 && liveBubbles() > 0; i++) pump(10);
pump(60);
gc();
const after = {
  win: listeners.window.length,
  doc: listeners.document.length,
  bodyKids: body.children.length,
  intervals: intervals.size,
  timers: timers.size,
  heap: process.memoryUsage().heapUsed
};
ok('window listeners returned to baseline', after.win === base.win,
   after.win + ' vs ' + base.win);
ok('document listeners returned to baseline', after.doc === base.doc,
   after.doc + ' vs ' + base.doc);
ok('no intervals left behind', after.intervals === 0, String(after.intervals));
ok('pending timers bounded', after.timers <= 2, String(after.timers));
ok('body children back to the companion only', after.bodyKids === 1, String(after.bodyKids));
ok('heap growth under 8 MB over the run', after.heap - base.heap < 8 * 1048576,
   mb(after.heap) + ' (grew ' + mb(after.heap - base.heap) + ')');

/* ---------------------------------------------------------------- *
 * 3. enable/disable toggles
 * ---------------------------------------------------------------- */
console.log('\nTOGGLE STRESS (300 cycles)');
function setSettings(patch) {
  storeState.settings = patch;
  if (hooks.onChanged) hooks.onChanged({ pbc_settings: { newValue: patch } }, 'local');
  pump(2);
}
let toggleErrors = [];
for (let i = 0; i < 300; i++) {
  setSettings({ enabled: false, size: 4, speed: 1, sound: false, speech: false,
                character: 'bot', theme: 'system' });
  setSettings({ enabled: true, size: 4, speed: 1, sound: false, speech: false,
                character: 'bot', theme: 'system' });
  if (!loopArmed()) toggleErrors.push('loop not re-armed at cycle ' + i);
  pump(1);
}
pump(5);
ok('300 on/off cycles re-arm exactly one loop', toggleErrors.length === 0 &&
   rafQueue.size === 1, toggleErrors[0]);
ok('no duplicate world listeners after toggling',
   winCount('mousemove') === 1 && winCount('scroll') === 1 && winCount('resize') === 1);

setSettings({ enabled: false, size: 4, speed: 1, sound: false, speech: false,
              character: 'bot', theme: 'system' });
ok('disabled: no loop armed', !loopArmed());
ok('disabled: behaviour world listeners unbound (only the bot blur remains)',
   winCount('mousemove') === 0 && winCount('mouseleave') === 0 &&
   winCount('scroll') === 0 && winCount('resize') === 0 && winCount('blur') === 1,
   listeners.window.length + ' listeners');
setSettings({ enabled: true, size: 4, speed: 1, sound: false, speech: false,
              character: 'bot', theme: 'system' });
/* a restart may spawn an ambient bubble; wait for it to finish before counting
   listeners, since every live bubble owns a transient resize listener */
for (let i = 0; i < 400 && liveBubbles() > 0; i++) pump(10);
pump(40);
/* a live bubble legitimately owns one extra resize listener, so the invariant
   is "every permanent listener exactly once", not a raw total */
ok('re-enabled: loop and permanent listeners restored',
   loopArmed() && winCount('mousemove') === 1 && winCount('mouseleave') === 1 &&
   winCount('scroll') === 1 && winCount('blur') === 1 &&
   winCount('resize') >= 1 && winCount('resize') <= 2,
   'win=' + listeners.window.length);

/* ---------------------------------------------------------------- *
 * 4. skin / size / speed churn
 * ---------------------------------------------------------------- */
console.log('\nSETTINGS CHURN (all skins, size 2-10, speed 0.4-3)');
const skinIds = sandbox.PBArt.skinIds.slice();
let churnErrors = [];
for (let i = 0; i < 40; i++) {
  const skin = skinIds[i % skinIds.length];
  const size = 2 + (i % 9);
  const speed = 0.4 + (i % 7) * 0.43;
  try {
    setSettings({ enabled: true, size: size, speed: speed, sound: false,
                  speech: false, character: skin, theme: i % 3 === 0 ? 'light' : 'system' });
    churnErrors = churnErrors.concat(pump(120));
  } catch (e) { churnErrors.push(e); }
}
ok('40 skin/size/speed changes render cleanly', churnErrors.length === 0,
   churnErrors[0] && churnErrors[0].message);
ok('still exactly one companion after churn', body.children.filter(c => c._cls === 'pbc-bot').length === 1);
ok('world listeners still single after churn',
   winCount('mousemove') === 1 && winCount('scroll') === 1);
const cv = botEl().children.filter(c => c.width !== undefined)[0];
ok('canvas resized to the last size setting', !!cv && cv.width === 64 * (2 + (39 % 9)),
   cv && cv.width + 'px');

/* ---------------------------------------------------------------- *
 * 5. scroll / resize storm
 * ---------------------------------------------------------------- */
console.log('\nEVENT STORMS');
function fireWindow(type) {
  for (const l of listeners.window.filter(l => l.type === type)) l.fn({});
}
for (let i = 0; i < 2000; i++) { fireWindow('scroll'); if (i % 10 === 0) pump(1); }
pump(120);
ok('2000 scroll events leave one debounce timer at most', timers.size <= 2,
   String(timers.size));
for (let i = 0; i < 500; i++) { fireWindow('resize'); pump(1); }
pump(10);
ok('500 resizes leave listeners and loop intact',
   winCount('resize') === 1 && loopArmed());

/* ---------------------------------------------------------------- *
 * 6. render / tick benchmarks
 * ---------------------------------------------------------------- */
console.log('\nCOST BENCHMARKS');
function pixelCtx() {
  const canvas = { width: G, height: G, _px: new Uint8ClampedArray(G * G * 4) };
  let fill = '#000';
  return {
    canvas, imageSmoothingEnabled: false,
    set fillStyle(v) { fill = v; },
    get fillStyle() { return fill; },
    fillRect(x, y, w, h) {
      x = Math.round(x); y = Math.round(y);
      w = Math.round(w); h = Math.round(h);
      for (let yy = y; yy < y + h; yy++) {
        if (yy < 0 || yy >= G) continue;
        for (let xx = x; xx < x + w; xx++) {
          if (xx < 0 || xx >= G) continue;
          const o = (yy * G + xx) * 4;
          canvas._px[o] = 200; canvas._px[o + 1] = 200;
          canvas._px[o + 2] = 200; canvas._px[o + 3] = 255;
        }
      }
    },
    clearRect() {}
  };
}
function bench(label, fn, iters) {
  for (let i = 0; i < 100; i++) fn(i);           // warm up
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) fn(i);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return ms / iters;
}

let drawTotal = 0, drawN = 0, drawWorst = 0;
for (const skin of skinIds) {
  for (const face of ['normal', 'happy']) {
    for (const arm of ['down', 'wave']) {
      const ctx = pixelCtx();
      const t = bench('draw', () => sandbox.PBArt.draw(ctx, {
        skin: skin, face: face, mouth: 'smile', arm: arm, phase: 0.3, facing: 1
      }), 400);
      drawTotal += t; drawN++;
      drawWorst = Math.max(drawWorst, t);
    }
  }
}
const drawAvg = drawTotal / drawN;
ok('average sprite draw under 0.5 ms', drawAvg < 0.5, drawAvg.toFixed(3) + ' ms');
console.log('  draw: avg ' + drawAvg.toFixed(3) + ' ms, worst ' + drawWorst.toFixed(3) +
            ' ms across ' + drawN + ' skin/face/arm combos');

for (const px of [2, 4, 10]) {
  const b = new sandbox.PixelBot({ px: px, skin: 'bot' });
  b.boot();
  b.setPos(100, b.groundY());
  const t = bench('tick', () => b.tick(16.7), 600);
  ok('bot tick at ' + px + 'px under 1 ms', t < 1, t.toFixed(3) + ' ms');
  console.log('  tick ' + px + 'px: ' + t.toFixed(3) + ' ms/frame');
}

/* behaviour + render, counting canvas, as one frame */
const frameMs = runMs / FRAMES;
ok('whole frame (behaviour + render stub) under 2 ms', frameMs < 2,
   frameMs.toFixed(3) + ' ms/frame');

/* real-browser budget note: 16.67 ms is one 60fps frame */
console.log('  estimated frame budget used: ' +
            (frameMs / (1000 / 60) * 100).toFixed(1) + '%');

/* ---------------------------------------------------------------- *
 * summary
 * ---------------------------------------------------------------- */
console.log('\n' + pass + ' checks passed, ' + fail + ' failed');
if (fail) {
  console.log('\nProblems:');
  for (const p of problems) console.log(' - ' + p);
}
process.exit(fail ? 1 : 0);
