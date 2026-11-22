/*
 * boot-headless.js — verify the content-script boot path without a browser.
 *
 * The complaint this guards against: switching the companion off — globally or
 * for one site — still armed the behaviour's requestAnimationFrame loop, which
 * then woke 60 times a second and drew nothing for as long as the tab stayed
 * open.  PBBehavior.stop() existed and did nothing (it cancelled one frame, and
 * the loop rescheduled itself), and nothing ever called it anyway.
 *
 * These tests boot content/content.js against a fake chrome.storage and assert
 * that a disabled companion arms no loop and binds no listeners, that an
 * enabled one arms exactly one of each and paints its canvas, that a per-site
 * opt-out is honoured, and that toggling live stops and restarts cleanly
 * without stacking a second copy of anything.
 *
 * Run: node test/boot-headless.js
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
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '  -> ' + detail : '')); }
}

/* ---------------------------------------------------------------- *
 * a small DOM + canvas + chrome.storage stub, in the spirit of
 * test/interaction-headless.js
 * ---------------------------------------------------------------- */
function makeEl() {
  const el = {
    style: { cssText: '', setProperty() {} },
    children: [],
    parentNode: null,
    _cls: '',
    set className(v) { this._cls = v; },
    get className() { return this._cls; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter(k => k !== c); return c; },
    offsetWidth: 120,
    offsetHeight: 28,
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }
  };
  return el;
}

function makeCtx(canvas) {
  let fill = '#000';
  return {
    canvas: canvas,
    imageSmoothingEnabled: false,
    set fillStyle(v) { fill = v; },
    get fillStyle() { return fill; },
    fillRect(x, y, w, h) {
      x = Math.round(x); y = Math.round(y);
      w = Math.round(w); h = Math.round(h);
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (xx < 0 || yy < 0 || xx >= canvas.width || yy >= canvas.height) continue;
          const o = (yy * canvas.width + xx) * 4;
          canvas._px[o] = 200; canvas._px[o + 1] = 200;
          canvas._px[o + 2] = 200; canvas._px[o + 3] = 255;
        }
      }
    },
    clearRect(x, y, w, h) {
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (xx < 0 || yy < 0 || xx >= canvas.width || yy >= canvas.height) continue;
          const o = (yy * canvas.width + xx) * 4;
          canvas._px[o] = canvas._px[o + 1] = canvas._px[o + 2] = canvas._px[o + 3] = 0;
        }
      }
    },
    getImageData(x, y, w, h) {
      return { data: canvas._px, width: w, height: h };
    }
  };
}

let now = 1000;

/* Boot one fresh content script.  `stored` is what chrome.storage holds. */
function boot(stored, origin) {
  const state = {
    settings: stored && stored.settings,
    sites: (stored && stored.sites) || {}
  };
  const bodyEl = makeEl();
  const documentEl = makeEl();
  const listeners = { document: [], window: [] };
  const hooks = {};
  const raf = { scheduled: 0, cancelled: 0, last: null };
  const timers = [];
  let intervalSeq = 0;
  const intervals = new Map();

  const sandbox = {
    console,
    performance: { now: () => now },
    requestAnimationFrame: (fn) => { raf.scheduled++; raf.last = fn; return raf.scheduled; },
    cancelAnimationFrame: () => { raf.cancelled++; },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    setInterval: (fn) => { const id = ++intervalSeq; intervals.set(id, fn); return id; },
    clearInterval: (id) => { intervals.delete(id); },
    innerWidth: 1200,
    innerHeight: 800,
    devicePixelRatio: 1,
    location: { origin: origin || 'http://localhost:8765' },
    document: {
      documentElement: documentEl,
      body: bodyEl,
      createElement(tag) {
        const el = makeEl();
        if (tag === 'canvas') {
          el.width = 0; el.height = 0;
          el._px = null;
          el.getContext = function () {
            if (!el._px) el._px = new Uint8ClampedArray(el.width * el.height * 4);
            if (!el._ctx) el._ctx = makeCtx(el);
            return el._ctx;
          };
        }
        return el;
      },
      addEventListener(type, fn, capture) {
        listeners.document.push({ type, fn, capture });
      },
      removeEventListener(type, fn) {
        listeners.document = listeners.document.filter(
          l => !(l.type === type && l.fn === fn));
      }
    },
    addEventListener(type, fn, capture) {
      listeners.window.push({ type, fn, capture });
    },
    removeEventListener(type, fn) {
      listeners.window = listeners.window.filter(
        l => !(l.type === type && l.fn === fn));
    },
    chrome: {
      storage: {
        local: {
          get(keys, cb) { cb({ pbc_settings: state.settings, pbc_sites: state.sites }); },
          set() {}
        },
        onChanged: {
          addListener(fn) { hooks.onChanged = fn; }
        }
      }
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of FILES) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox,
                    { filename: f });
  }

  const WORLD = ['mousemove', 'mouseleave', 'scroll', 'resize'];
  const worldCount = () => listeners.window.filter(
    l => WORLD.indexOf(l.type) !== -1).length;
  const botEl = () => bodyEl.children.filter(c => c._cls === 'pbc-bot')[0] || null;
  const canvasOf = () => {
    const el = botEl();
    return el ? el.children.filter(c => c.width !== undefined)[0] || null : null;
  };
  const opaqueOf = () => {
    const c = canvasOf();
    if (!c || !c._px) return 0;
    let n = 0;
    for (let i = 3; i < c._px.length; i += 4) if (c._px[i] > 20) n++;
    return n;
  };
  const setEnabled = (on) => {
    state.settings = { enabled: on };
    hooks.onChanged({ pbc_settings: { newValue: state.settings } }, 'local');
  };

  return { sandbox, raf, timers, intervals, listeners, hooks, state,
           bodyEl, worldCount, botEl, canvasOf, opaqueOf, setEnabled };
}

/* ---------------------------------------------------------------- *
 * 1. a disabled companion must stay completely idle
 * ---------------------------------------------------------------- */
const off = boot({ settings: { enabled: false } });
ok('globally disabled: no animation loop is armed', off.raf.scheduled === 0,
   'scheduled=' + off.raf.scheduled);
ok('globally disabled: no world listeners are bound', off.worldCount() === 0,
   'listeners=' + off.worldCount());
ok('globally disabled: no frame is pending', off.raf.last === null);
ok('globally disabled: the element exists but is hidden',
   !!off.botEl() && off.botEl().style.display === 'none',
   'display=' + (off.botEl() && off.botEl().style.display));

/* ---------------------------------------------------------------- *
 * 2. defaults (nothing stored): running, painted, one of everything
 * ---------------------------------------------------------------- */
const on = boot(null);
ok('enabled by default: exactly one loop is armed', on.raf.scheduled === 1,
   'scheduled=' + on.raf.scheduled);
ok('enabled by default: one listener per world event', on.worldCount() === 4,
   'listeners=' + on.worldCount());
ok('enabled by default: the element is shown',
   !!on.botEl() && on.botEl().style.display === 'block',
   'display=' + (on.botEl() && on.botEl().style.display));
ok('enabled by default: the canvas is the default 4px size',
   !!on.canvasOf() && on.canvasOf().width === G * 4 &&
   on.canvasOf().height === G * 4,
   on.canvasOf() ? on.canvasOf().width + 'x' + on.canvasOf().height : 'no canvas');
ok('enabled by default: the character is actually drawn',
   on.opaqueOf() > 800, 'opaque=' + on.opaqueOf());

/* ---------------------------------------------------------------- *
 * 3. a per-site opt-out is honoured on that origin only
 * ---------------------------------------------------------------- */
const perSite = { settings: { enabled: true },
                  sites: { 'http://localhost:8765': { enabled: false } } };
const site = boot(perSite, 'http://localhost:8765');
ok('per-site off: that origin arms no loop', site.raf.scheduled === 0,
   'scheduled=' + site.raf.scheduled);
ok('per-site off: that origin binds no listeners', site.worldCount() === 0,
   'listeners=' + site.worldCount());
ok('per-site off: the element is hidden', site.botEl().style.display === 'none');

const otherSite = boot(perSite, 'https://example.com');
ok('per-site off: a different origin is unaffected',
   otherSite.raf.scheduled === 1 && otherSite.worldCount() === 4,
   'scheduled=' + otherSite.raf.scheduled + ' listeners=' + otherSite.worldCount());

/* ---------------------------------------------------------------- *
 * 4. live toggling: stop really stops, restart does not stack
 * ---------------------------------------------------------------- */
const live = boot({ settings: { enabled: true } });
ok('live: starts running', live.raf.scheduled === 1 && live.worldCount() === 4);

live.setEnabled(false);
ok('live: turning it off cancels the frame', live.raf.cancelled >= 1,
   'cancelled=' + live.raf.cancelled);
const scheduledWhileOff = live.raf.scheduled;
live.raf.last(now + 16);            // a frame already in flight
ok('live: a frame delivered after the toggle does not reschedule',
   live.raf.scheduled === scheduledWhileOff,
   'scheduled ' + scheduledWhileOff + ' -> ' + live.raf.scheduled);
ok('live: turning it off unbinds the world listeners', live.worldCount() === 0,
   'listeners=' + live.worldCount());
ok('live: turning it off leaves no timers or intervals behind',
   live.intervals.size === 0, 'intervals=' + live.intervals.size);

live.setEnabled(true);
ok('live: turning it back on arms exactly one loop',
   live.raf.scheduled === scheduledWhileOff + 1,
   'scheduled=' + live.raf.scheduled);
ok('live: turning it back on binds one listener per world event',
   live.worldCount() === 4, 'listeners=' + live.worldCount());
live.setEnabled(false);
live.setEnabled(true);
ok('live: two toggle cycles still leave exactly one of each',
   live.worldCount() === 4, 'listeners=' + live.worldCount());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
