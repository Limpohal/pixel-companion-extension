/*
 * interaction-headless.js — verify the pointer handling without a browser.
 *
 * The complaint this guards against: the old hot-spot was a full-size div with
 * pointer-events:auto, so the transparent parts of the sprite swallowed clicks
 * meant for the page.  These tests assert that a press on a transparent pixel
 * is left alone, a press on an opaque pixel is claimed, a press-and-move drags
 * the character, and a release decides between walking and pinning.
 *
 * Sections 7 and 8 guard the resource half of the same story: a speech bubble
 * used to leave its 'resize' listener, its typewriter interval and its dismiss
 * timer behind for the lifetime of the tab (one bubble every 9-25s, forever),
 * bubbles could stack on top of each other, and PBBehavior.stop() cancelled a
 * single frame while the loop cheerfully queued the next one — so it never
 * actually stopped.
 *
 * Run: node test/interaction-headless.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const G = 64;

/* ---------------------------------------------------------------- *
 * a small DOM + canvas stub
 * ---------------------------------------------------------------- */
const listeners = { document: [], window: [] };
let now = 1000;
const timers = [];                             // deferred callbacks, flushed by hand
function flushTimers() { while (timers.length) timers.shift()(); }
const intervals = new Map();                   // live setInterval callbacks
let intervalSeq = 0;
const raf = { scheduled: 0, cancelled: 0 };
let timerSeq = 0;
const cancelledTimers = new Set();              // clearTimeout must really cancel
function addTimer(fn) {
  const id = ++timerSeq;
  const t = function () { if (!cancelledTimers.has(id)) fn(); };
  t.id = id;
  timers.push(t);
  return id;
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

const documentEl = makeEl();
const bodyEl = makeEl();

const sandbox = {
  console,
  performance: { now: () => now },
  requestAnimationFrame: () => { raf.scheduled++; return raf.scheduled; },
  cancelAnimationFrame: () => { raf.cancelled++; },
  setTimeout: (fn) => addTimer(fn),
  clearTimeout: (id) => { cancelledTimers.add(id); },
  setInterval: (fn) => { const id = ++intervalSeq; intervals.set(id, fn); return id; },
  clearInterval: (id) => { intervals.delete(id); },
  innerWidth: 1200,
  innerHeight: 800,
  devicePixelRatio: 1,
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
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

['content/art.js', 'content/synth.js', 'content/speech.js',
 'content/character.js', 'content/behaviors.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
});

/* ---------------------------------------------------------------- *
 * helpers
 * ---------------------------------------------------------------- */
let pass = 0, fail = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '  -> ' + detail : '')); }
}

function fire(type, ev) {
  let stopped = false, prevented = false;
  const e = Object.assign({
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; }
  }, ev);
  listeners.document
    .filter(l => l.type === type)
    .forEach(l => l.fn(e));
  return { stopped, prevented };
}

const bot = new sandbox.PixelBot({ px: 2, skin: 'panda' });
let dropped = null, grabbed = 0, clicked = 0, hovered = [];
bot.onDrop = (x, y) => { dropped = { x, y }; };
bot.onGrab = () => { grabbed++; };
bot.onClick = () => { clicked++; };
bot.onHover = (o) => { hovered.push(o); };
bot.boot();

const size = bot.size();
bot.setPos(100, bot.groundY());

console.log('  canvas ' + size.w + 'x' + size.h + ', mask built: ' +
            (bot._mask ? 'yes' : 'no'));

/* ---------------------------------------------------------------- *
 * 1. hit testing
 * ---------------------------------------------------------------- */
/* find one opaque pixel and one transparent pixel inside the box */
let opaque = null, clear = null;
for (let j = 0; j < G && (!opaque || !clear); j++) {
  for (let i = 0; i < G; i++) {
    const on = bot._mask[j * G + i] === 1;
    if (on && !opaque) opaque = { i, j };
    if (!on && !clear && i > 4 && i < 59) clear = { i, j };
  }
}
const hitAt = (p) => bot.hitTest(bot.x + p.i * bot.px + 1,
                                 bot.y + p.j * bot.px + 1);

ok('hitTest true on an opaque sprite pixel', hitAt(opaque) === true,
   JSON.stringify(opaque));
ok('hitTest false on a transparent sprite pixel', hitAt(clear) === false,
   JSON.stringify(clear));
ok('hitTest false outside the box', bot.hitTest(bot.x - 5, bot.y - 5) === false);

/* how much of the box is transparent — the thing that used to eat clicks */
let clearPx = 0;
for (let k = 0; k < G * G; k++) if (bot._mask[k] === 0) clearPx++;
console.log('  box: ' + (G * G - clearPx) + ' opaque, ' + clearPx +
            ' transparent (' + Math.round(clearPx / (G * G) * 100) + '% now click-through)');

/* ---------------------------------------------------------------- *
 * 2. presses pass through transparent pixels
 * ---------------------------------------------------------------- */
const onClear = fire('pointerdown', {
  button: 0,
  clientX: bot.x + clear.i * bot.px + 1,
  clientY: bot.y + clear.j * bot.px + 1
});
ok('press on a transparent pixel is NOT claimed', !onClear.stopped && !onClear.prevented,
   'stopped=' + onClear.stopped + ' prevented=' + onClear.prevented);
ok('press on a transparent pixel starts no drag', bot._drag === null);

/* ---------------------------------------------------------------- *
 * 3. a press on the character is claimed, and a tap squashes
 * ---------------------------------------------------------------- */
const px0 = bot.x;
const onOpaque = fire('pointerdown', {
  button: 0,
  clientX: bot.x + opaque.i * bot.px + 1,
  clientY: bot.y + opaque.j * bot.px + 1
});
ok('press on an opaque pixel IS claimed', onOpaque.stopped && onOpaque.prevented);
ok('press on an opaque pixel starts a drag', bot._drag !== null);
ok('grabbing notifies the behaviour', grabbed === 1);

fire('pointerup', { clientX: bot.x + opaque.i * bot.px + 1,
                    clientY: bot.y + opaque.j * bot.px + 1 });
ok('a tap with no movement fires onClick', clicked === 1);
ok('a tap leaves the character where it was', bot.x === px0);

/* the squash timeline: drive it by hand and watch each step */
let squashed = [];
const origTransform = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(bot.el.style), 'transform');
bot.squash();
ok('squash pins the transform origin to the feet',
   bot.el.style.transformOrigin === '50% 86%', bot.el.style.transformOrigin);
ok('squash adds a transform transition',
   /transform/.test(String(bot.el.style.transition)));
while (timers.length) {
  timers.shift()();
  squashed.push(String(bot.el.style.transform));
}
ok('squash flattens, overshoots, then clears',
   /scale\(1\.24/.test(squashed[0] || '') && squashed[squashed.length - 1] === '',
   JSON.stringify(squashed));

/* the page click that follows the grab must be swallowed */
const swallowed = fire('click', { clientX: 0, clientY: 0 });
ok('the page click after a grab is swallowed', swallowed.stopped && swallowed.prevented);

/* ---------------------------------------------------------------- *
 * 4. dragging moves it, and releasing decides walk vs pin
 * ---------------------------------------------------------------- */
const target = { x: 400, y: bot.groundY() };
fire('pointerdown', {
  button: 0,
  clientX: bot.x + opaque.i * bot.px + 1,
  clientY: bot.y + opaque.j * bot.px + 1
});
fire('pointermove', { clientX: 0, clientY: 0 });
fire('pointermove', {
  clientX: target.x + opaque.i * bot.px + 1,
  clientY: target.y + opaque.j * bot.px + 1
});
ok('moving marks the press as a drag', bot._drag && bot._drag.moved === true);

/* the drag target should follow the pointer, offset by the grab point */
const wantX = target.x + opaque.i * bot.px + 1 - (opaque.i * bot.px + 1);
ok('drag target tracks the pointer', Math.abs(bot._drag.tx - wantX) <= 1,
   'tx=' + bot._drag.tx + ' want=' + wantX);

fire('pointerup', {
  clientX: target.x + opaque.i * bot.px + 1,
  clientY: target.y + opaque.j * bot.px + 1
});
ok('release reports a drop', dropped !== null);
ok('drop near the floor reports a floor y',
   dropped && Math.abs(dropped.y - bot.groundY()) <= 1);

/* drop high up -> the behaviour should pin it */
const beh = new sandbox.PBBehavior(bot, () => ({
  enabled: true, speed: 1, speech: false, sound: false
}));
beh.start();
beh.bot.onDrop(300, 120);
ok('drop high up pins the character', bot.pinned === true && beh.mode === 'pinned');

beh.bot.onDrop(300, bot.groundY());
ok('drop near the floor un-pins it', bot.pinned === false && beh.mode === 'walk');

/* the exact boundary, so the rule is documented rather than assumed:
   a drop inside the band above the floor lands and walks, one above it pins */
const band = Math.round(bot.size().h * 0.4);
const threshold = bot.groundY() - band;
console.log('  floor band: within ' + band + 'px of the resting spot (sprite is ' +
            bot.size().h + 'px tall, window ' + sandbox.innerHeight + 'px)');
console.log('  drop with a top y >= ' + threshold + ' -> lands and walks');
console.log('  drop with a top y <  ' + threshold + ' -> stays pinned');

beh.bot.onDrop(300, threshold + 1);
ok('a drop just inside the band lands and walks',
   bot.pinned === false && beh.mode === 'walk' &&
   Math.abs(bot.y - bot.groundY()) <= 1,
   'pinned=' + bot.pinned + ' mode=' + beh.mode + ' y=' + bot.y);

beh.bot.onDrop(300, threshold - 1);
ok('a drop just above the band stays pinned',
   bot.pinned === true && beh.mode === 'pinned',
   'pinned=' + bot.pinned + ' mode=' + beh.mode);

/* and a pinned character must not wander off while it floats */
const pinY = beh._pinY;                   // the pin point, not the last position
for (let i = 0; i < 120; i++) beh._update(16, now + i * 16);
ok('a pinned character does not walk away',
   bot.pinned === true && Math.abs(bot.x - 300) < 2,
   'x=' + bot.x + ' (dropped at 300)');
ok('a pinned character bobs around its pin point',
   Math.abs(bot.y - pinY) <= 3, 'y=' + bot.y + ' vs pin point ' + pinY);

/* ---------------------------------------------------------------- *
 * 5. a held character ignores gravity and the ground clamp
 * ---------------------------------------------------------------- */
beh.bot.onGrab();
ok('grab switches the behaviour to held', beh.mode === 'held');
const heldY = bot.y;
bot._drag = { moved: true, tx: bot.x, ty: heldY - 200, ox: 0, oy: 0 };
bot.tick(16);
beh._update(16, now);
ok('a held character rises instead of falling', bot.y < heldY,
   'y ' + bot.y + ' vs ' + heldY);
ok('a held character keeps its arms up', bot.held === true);
bot._drag = null;

/* ---------------------------------------------------------------- *
 * 6. hover uses the same pixel test
 * ---------------------------------------------------------------- */
/* Re-derive the sample pixels: the mask is re-sampled as the pose changes, so
   a cell that was opaque at boot can be empty later. */
let opaque2 = null, clear2 = null;
for (let j = 0; j < G && (!opaque2 || !clear2); j++) {
  for (let i = 0; i < G; i++) {
    const on = bot._mask[j * G + i] === 1;
    if (on && !opaque2) opaque2 = { i, j };
    if (!on && !clear2 && i > 4 && i < 59) clear2 = { i, j };
  }
}
bot._hitState = false;                 // start from a known state
/* Check the behaviour's own hover flag rather than a stub: beh.start() wires
   bot.onHover itself, so a stub assigned earlier gets overwritten. */
beh._hover = false;
fire('pointermove', { clientX: bot.x + opaque2.i * bot.px + 1,
                      clientY: bot.y + opaque2.j * bot.px + 1 });
const hoverOn = beh._hover;
const cursorOn = documentEl.style.cursor;
fire('pointermove', { clientX: bot.x + clear2.i * bot.px + 1,
                      clientY: bot.y + clear2.j * bot.px + 1 });
ok('hover is true over an opaque pixel and false over a transparent one',
   hoverOn === true && beh._hover === false,
   'over opaque=' + hoverOn + ' over transparent=' + beh._hover);
ok('grab cursor shown over the character, gone once the pointer leaves',
   cursorOn === 'grab' && !documentEl.style.cursor,
   'over=' + cursorOn + ' after=' + JSON.stringify(documentEl.style.cursor));

/* ---------------------------------------------------------------- *
 * 7. speech bubbles: one live bubble, and nothing left behind
 * ---------------------------------------------------------------- */
const winListeners = (type) => listeners.window.filter(l => l.type === type).length;
const liveBubbles = () => bodyEl.children.filter(c => c._cls === 'pbc-bubble');

/* Earlier sections leave squash-keyframe timers queued; drain them so the
   bubble checks below can talk about "the next timer" unambiguously. */
flushTimers();
ok('the timer queue is drained before the bubble checks', timers.length === 0,
   'pending=' + timers.length);

const resizeBase = winListeners('resize');
const b1 = new sandbox.PB_SPEECH.SpeechBubble({ parent: bot.el, text: 'beep boop',
                                               duration: 1000 });
b1.show();
ok('a shown bubble adds one window resize listener',
   winListeners('resize') === resizeBase + 1, 'got ' + winListeners('resize'));
ok('a shown bubble starts one typewriter interval', intervals.size === 1,
   'intervals=' + intervals.size);
ok('a shown bubble is in the document', liveBubbles().length === 1);

/* Run just the auto-dismiss timer: the listener and the interval have to go at
   that moment, while the element is still fading out (200ms). */
const dismiss = timers.shift();
dismiss();
ok('auto-dismiss unbinds the resize listener', winListeners('resize') === resizeBase,
   'got ' + winListeners('resize'));
ok('auto-dismiss clears the typewriter interval', intervals.size === 0,
   'intervals=' + intervals.size);
ok('the element is still attached during the fade-out', liveBubbles().length === 1);
flushTimers();
ok('the bubble element is detached after the fade', liveBubbles().length === 0);

/* The leak itself: a long session used to accumulate one listener per bubble.
   20 show/hide cycles must leave the window exactly as they found it. */
for (let i = 0; i < 20; i++) {
  const b = new sandbox.PB_SPEECH.SpeechBubble({ parent: bot.el, text: 'hi there',
                                                 duration: 500 });
  b.show();
  b.hide();
  flushTimers();
}
ok('20 show/hide cycles leave no listeners behind',
   winListeners('resize') === resizeBase, 'got ' + winListeners('resize'));
ok('20 show/hide cycles leave no intervals behind', intervals.size === 0,
   'intervals=' + intervals.size);
ok('20 show/hide cycles leave no elements behind', liveBubbles().length === 0,
   'live=' + liveBubbles().length);

/* Stacking: a poke during an ambient thought used to add a second bubble. */
const talker = new sandbox.PBBehavior(bot, () => ({
  enabled: true, speed: 1, speech: true, sound: false
}));
talker.start();
talker._speak('idle', 1000);
const firstBubble = talker._bubble;
talker._speak('jump', 1000);
ok('a second thought dismisses the first bubble',
   talker._bubble !== null && talker._bubble !== firstBubble &&
   firstBubble._closing === true);
/* A replaced bubble fades out for 200ms, so two elements may briefly coexist;
   what must never happen is two live bubbles.  Run queued timers until the
   replaced one has finished its fade — its dismiss timer was cancelled by
   hide(), and the new bubble's dismiss timer is still pending, so this also
   proves the removal came from the right timer. */
let guard = 0;
while (liveBubbles().length > 1 && timers.length && guard++ < 10) timers.shift()();
ok('the replaced bubble is detached once its fade ends', liveBubbles().length === 1,
   'live=' + liveBubbles().length);
ok('the new bubble is still up',
   talker._bubble && talker._bubble.el === liveBubbles()[0]);

const newBubble = talker._bubble;
talker.stop();
ok('stop() dismisses the live bubble',
   talker._bubble === null && !!newBubble && newBubble._closing === true);
flushTimers();
ok('a stopped behaviour leaves no bubble behind', liveBubbles().length === 0);

/* ---------------------------------------------------------------- *
 * 8. stop() really stops — and unbinds what it bound
 * ---------------------------------------------------------------- */
const WORLD = ['mousemove', 'mouseleave', 'scroll', 'resize'];
const worldCounts = () => WORLD.map(winListeners).join(',');

const stopper = new sandbox.PBBehavior(bot, () => ({
  enabled: false, speed: 1, speech: false, sound: false
}));
const worldBase = worldCounts();
stopper.start();
ok('start() binds one listener per world event',
   WORLD.every((t, i) => winListeners(t) === Number(worldBase.split(',')[i]) + 1),
   'before=' + worldBase + ' after=' + worldCounts());

const rafBefore = raf.scheduled;
stopper.stop();
ok('stop() clears the running and started flags',
   stopper._running === false && stopper._started === false);
ok('stop() drops the pending frame handle', stopper._raf === null);
/* A frame already in flight must not put another one on the queue.  This is
   the bug: stop() cancelled one frame and the loop rescheduled itself. */
stopper._frame(now + 16);
ok('a frame delivered after stop() does not reschedule',
   raf.scheduled === rafBefore && stopper._raf === null,
   'scheduled ' + rafBefore + ' -> ' + raf.scheduled);
ok('stop() unbinds every world listener it bound', worldCounts() === worldBase,
   'before=' + worldBase + ' after=' + worldCounts());

/* And a restart must not end up with two of everything. */
stopper.start();
stopper.stop();
ok('a start/stop cycle does not stack world listeners', worldCounts() === worldBase,
   'before=' + worldBase + ' after=' + worldCounts());
stopper.stop();
ok('stop() is idempotent', worldCounts() === worldBase);

/* ---------------------------------------------------------------- *
 * 9. a tap must hand the character back to itself
 * ---------------------------------------------------------------- */
const tapper = new sandbox.PBBehavior(bot, () => ({
  enabled: true, speed: 1, speech: false, sound: false
}));
tapper.start();
/* Section 5 left bot.held set with no tick to clear it.  The real loop clears
   it on the very next frame (tick() drops it once the drag is gone), so start
   from the state a real tap would actually see. */
bot._drag = null;
bot.tick(16);

function opaquePixel() {
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) if (bot._mask[j * G + i] === 1) return { i, j };
  }
  return null;
}
function pressOnTheCharacter() {
  const p = opaquePixel();
  const x = bot.x + p.i * bot.px + 1;
  const y = bot.y + p.j * bot.px + 1;
  fire('pointerdown', { button: 0, clientX: x, clientY: y });
  return { x, y };
}

let press = pressOnTheCharacter();
ok('a press hands the position to the pointer', tapper.mode === 'held',
   'mode=' + tapper.mode);
fire('pointerup', { clientX: press.x, clientY: press.y });
ok('a tap gives the character its own schedule back', tapper.mode === 'walk',
   'mode=' + tapper.mode);
ok('a tap pokes the character instead of bailing on the held guard',
   bot.face === 'happy', 'face=' + bot.face);

/* And it must be able to move again — driven through the real loop body.  Park
   the tracked pointer far away first so mouse reactivity cannot flip it. */
listeners.window.filter(l => l.type === 'mousemove')
  .forEach(l => l.fn({ clientX: 1, clientY: 1 }));
bot.setPos(100, bot.groundY());
bot.setFacing(1);
const walkFrom = bot.x;
for (let i = 0; i < 60; i++) tapper._frame(now + i * 16);
ok('after a tap the character walks again', bot.x > walkFrom + 1,
   'x ' + walkFrom + ' -> ' + bot.x + ' facing=' + bot.facing);
ok('a tap gets the poke feedback, not a frozen surprise face',
   tapper.mode !== 'held' && bot.state === 'walk',
   'mode=' + tapper.mode + ' state=' + bot.state);

/* Cmd-Tab mid-press makes the browser synthesize a release: same trap */
press = pressOnTheCharacter();
ok('the blur-path press is claimed', bot._drag !== null);
listeners.window.filter(l => l.type === 'blur').forEach(l => l.fn());
ok('a window blur mid-press releases the character', tapper.mode === 'walk',
   'mode=' + tapper.mode);

/* ---------------------------------------------------------------- *
 * 10. the wave and the blink run on the bot's own clock
 * ---------------------------------------------------------------- */
const realDraw = sandbox.PBArt.draw;
let lastDraw = null;
sandbox.PBArt.draw = function (ctx, opts) {
  lastDraw = opts;
  return realDraw.call(this, ctx, opts);
};

/* 10a. a wave must not inherit the wall-clock gap a hidden tab leaves behind */
bot.state = 'idle';
bot.face = 'normal';
now += 120000;                       // two minutes hidden: no frames rendered
bot.wave(1400);
let waveFrames = 0;
for (let i = 0; i < 200; i++) {      // 3.2s worth of rendered frames
  bot.tick(16);
  if (lastDraw && lastDraw.arm === 'wave') waveFrames++;
}
ok('a wave lasts ~1.4s of frames even after a hidden tab',
   waveFrames >= 60 && waveFrames <= 100, 'wave frames=' + waveFrames + ' of 200');

/* 10b. a blink is a short window, not one frame, and the mood still drives the
   mouth while the eyes are shut */
bot.state = 'idle';
bot.face = 'happy';
/* 10a left a blink window possibly still in flight, which would make the first
   run below a partial one; ask for a blink now so every window is a full one. */
bot._blinkAt = 0;
bot._blinkUntil = 0;
const runs = [];
let run = 0, blinkFrames = 0, mouthWrong = 0;
for (let i = 0; i < 600; i++) {      // 9.6s worth of frames
  bot.tick(16);
  if (lastDraw.face === 'blink') {
    blinkFrames++; run++;
    if (lastDraw.mouth !== 'smile') mouthWrong++;
  } else if (run) { runs.push(run); run = 0; }
}
/* Let a blink still in progress finish, so the final run is not clipped by the
   end of the measurement window (the first run is handled by the reset above). */
let guardFrames = 0;
while (run > 0 && guardFrames++ < 600) {
  bot.tick(16);
  if (lastDraw.face !== 'blink') break;
  run++;
}
if (run) runs.push(run);
ok('the character blinks at all', runs.length >= 2, 'blinks=' + runs.length);
ok('every blink lasts several frames, not one',
   runs.length > 0 && runs.every(n => n >= 5 && n <= 12),
   'run lengths=' + JSON.stringify(runs));
ok('the mouth keeps the mood through a blink', mouthWrong === 0,
   mouthWrong + ' of ' + blinkFrames + ' blink frames had the wrong mouth');

/* ---------------------------------------------------------------- *
 * 11. every flourish is actually wired up (and only the hoppers hop)
 * ---------------------------------------------------------------- */
const MOOD_BANKS = ['idle', 'happy', 'love', 'wave', 'jump', 'scroll'];
const flourishSkins = sandbox.PBArt.skinIds.filter(
  id => (sandbox.PBArt.SKINS[id].actions || []).length);
ok('four characters have a flourish (panda, cat, scout, melon)',
   flourishSkins.join() === 'panda,cat,scout,melon', flourishSkins.join());

/* A skin naming an action that is not in ACTIONS, or missing its `action`
   speech bank, fails silently in the browser: startAction() returns 0 and the
   routine simply never happens.  Both are cheap to get wrong. */
const unknownAction = [], missingBank = [];
for (const id of flourishSkins) {
  const probe = new sandbox.PixelBot({ px: 2, skin: id });
  probe.boot();
  for (const name of sandbox.PBArt.SKINS[id].actions) {
    if (probe.startAction(name) <= 0) unknownAction.push(id + ':' + name);
  }
  const bank = sandbox.PB_SPEECH.characterLines[id];
  if (!bank || !bank.action || !bank.action.length) missingBank.push(id);
}
ok('every declared action exists in the ACTIONS table',
   unknownAction.length === 0, unknownAction.join());
ok('every flourish character has an action speech bank',
   missingBank.length === 0, missingBank.join());

const noLine = [];
for (const id of sandbox.PBArt.skinIds) {
  for (const bank of MOOD_BANKS) {
    const line = sandbox.PB_SPEECH.pick(bank, id);
    if (typeof line !== 'string' || !line) noLine.push(id + ':' + bank);
  }
}
ok('every skin answers every mood bank the behaviour asks for',
   noLine.length === 0, noLine.join());

/* `hop: true` on a routine is what makes it an arc rather than a pose — the
   behaviour used to test for the literal name 'bounce' instead. */
function runFlourish(id, name) {
  const b = new sandbox.PixelBot({ px: 2, skin: id });
  b.boot();
  b.setPos(300, b.groundY());
  const h = new sandbox.PBBehavior(b, () => ({
    enabled: true, speed: 1, speech: false, sound: false
  }));
  h.start();
  h._speak = function () {};
  h._doAction(now, name);
  const hopped = b.state === 'jump';
  let peak = b.y;
  for (let i = 0; i < 120; i++) {
    h._update(16, now + i * 16);
    b.tick(16);
    peak = Math.min(peak, b.y);
  }
  return { hopped: hopped, rise: b.groundY() - peak,
           landed: Math.abs(b.y - b.groundY()) <= 1 };
}
const scoutSalute = runFlourish('scout', 'salute');
ok('the scout pup salutes with a real hop and lands',
   scoutSalute.hopped && scoutSalute.rise > 10 && scoutSalute.landed,
   JSON.stringify(scoutSalute));
const catStretch = runFlourish('cat', 'stretch');
ok('the cat stretches without leaving the ground',
   !catStretch.hopped && catStretch.rise === 0, JSON.stringify(catStretch));
const melonSpit = runFlourish('melon', 'spit');
/* the melon is a floater: it is already ~1-3px above the floor before the
   action, so a grounded spit shows a small non-zero rise rather than 0 */
ok('the melon spits seeds while hovering (no jump arc)',
   !melonSpit.hopped && melonSpit.rise > 0 && melonSpit.rise < 12,
   JSON.stringify(melonSpit));
const pandaBounce = runFlourish('panda', 'bounce');
ok('the panda still hops (the flag replaced a hard-coded name check)',
   pandaBounce.hopped && pandaBounce.rise > 10 && pandaBounce.landed,
   JSON.stringify(pandaBounce));

/* The spit is drawn entirely by the art hook (`action === 'spit'`), so guard
   that the action actually reaches the renderer and paints the seed volley. */
try {
  const drawPixels = (opts) => {
    const canvas = { width: G, height: G, _px: new Uint8ClampedArray(G * G * 4) };
    sandbox.PBArt.draw(makeCtx(canvas), opts);
    let n = 0;
    for (let i = 3; i < canvas._px.length; i += 4) if (canvas._px[i]) n++;
    return n;
  };
  const base = drawPixels({ skin: 'melon', face: 'normal', mouth: 'normal',
                            arm: 'down' });
  const spit = drawPixels({ skin: 'melon', face: 'normal', mouth: 'normal',
                            arm: 'down', action: 'spit' });
  const okSpit = spit > base;
  if (!okSpit) fail++;
  else pass++;
  console.log((okSpit ? '  PASS ' : '  FAIL ') +
              'the spit action paints its seed volley (' + base + ' -> ' +
              spit + ' px)');
} catch (e) {
  fail++;
  console.log('  FAIL spit render check threw: ' + e.message);
}

/* ---------------------------------------------------------------- *
 * 12. speech-bubble theme
 * ---------------------------------------------------------------- */
/* The popup's light/dark setting reaches the on-page bubbles as a resolved
   palette.  These guard the two failure modes: a light bubble keeping the dark
   colours (invisible styling bug), and 'system' throwing where matchMedia is
   missing (this sandbox has none, which also proves the dark fallback). */
function bubbleCss(theme) {
  const b = new sandbox.PB_SPEECH.SpeechBubble({ parent: bot.el, text: 'hi',
                                                 duration: 400, theme: theme });
  b.show();
  const css = b.el.style.cssText;
  b.hide();
  flushTimers();
  return css;
}
try {
  const lightCss = bubbleCss('light');
  const darkCss = bubbleCss('dark');
  ok('the light bubble uses the light palette',
     /rgba\(255,255,255/.test(lightCss) && /#1b2233/.test(lightCss),
     lightCss.slice(0, 90));
  ok('the dark bubble keeps the dark palette',
     /rgba\(22,33,59/.test(darkCss) && /#eef6ff/.test(darkCss),
     darkCss.slice(0, 90));
  ok('resolveTheme falls back to dark without matchMedia',
     sandbox.PB_SPEECH.resolveTheme('system') === 'dark');
} catch (e) {
  fail++;
  console.log('  FAIL bubble theme check threw: ' + e.message);
}

/* ---------------------------------------------------------------- *
 * 13. the watermelon floats instead of walking
 * ---------------------------------------------------------------- */
try {
  ok('the melon draws no legs', sandbox.PBArt.SKINS.melon.feet === false &&
     !sandbox.PBArt.SKINS.melon.drawLegs);
  ok('the melon is flagged as a floater', sandbox.PBArt.SKINS.melon.float === true);

  const floatBot = new sandbox.PixelBot({ px: 2, skin: 'melon' });
  floatBot.boot();
  floatBot.setPos(300, floatBot.groundY());
  const floatH = new sandbox.PBBehavior(floatBot, () => ({
    enabled: true, speed: 1, speech: false, sound: false
  }));
  floatH.start();
  floatH._speak = function () {};
  floatBot.state = 'walk';
  floatH.mode = 'walk';
  floatH.modeUntil = now + 60000;

  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 180; i++) {
    floatH._update(16, now + i * 16);
    floatBot.tick(16);
    lo = Math.min(lo, floatBot.y);
    hi = Math.max(hi, floatBot.y);
  }
  const ground = floatBot.groundY();
  ok('the floating melon never touches the floor',
     hi < ground, 'top y ' + hi + ' vs ground ' + ground);
  ok('it bounces while it travels', ground - lo > 3,
     'lift range ' + (ground - hi) + '..' + (ground - lo));

  /* the idle bob must also stay off the floor, and a floater must never pick
     the sit mode (a slice cannot sit down) */
  floatBot.state = 'idle';
  floatH.mode = 'idle';
  let idleLo = Infinity, idleHi = -Infinity;
  for (let i = 0; i < 90; i++) {
    floatH._update(16, now + 4000 + i * 16);
    floatBot.tick(16);
    idleLo = Math.min(idleLo, floatBot.y);
    idleHi = Math.max(idleHi, floatBot.y);
  }
  ok('it keeps hovering while idle', idleHi < ground,
     'top y ' + idleHi + ' vs ground ' + ground);
  let sits = 0;
  for (let i = 0; i < 300; i++) {
    floatH._pickGroundMode(now);
    if (floatH.mode === 'sit') sits++;
  }
  ok('the melon never picks the sit mode', sits === 0, 'sit rolls=' + sits);
} catch (e) {
  fail++;
  console.log('  FAIL melon float check threw: ' + e.message);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
