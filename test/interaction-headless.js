/*
 * interaction-headless.js — verify the pointer handling without a browser.
 *
 * The complaint this guards against: the old hot-spot was a full-size div with
 * pointer-events:auto, so the transparent parts of the sprite swallowed clicks
 * meant for the page.  These tests assert that a press on a transparent pixel
 * is left alone, a press on an opaque pixel is claimed, a press-and-move drags
 * the character, and a release decides between walking and pinning.
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
const listeners = { document: [] };
let now = 1000;
const timers = [];                             // deferred callbacks, flushed by hand
function flushTimers() { while (timers.length) timers.shift()(); }

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
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  setTimeout: (fn) => { timers.push(fn); return timers.length; },
  clearTimeout: () => {},
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
  addEventListener() {},
  removeEventListener() {}
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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
