/*
 * character.js — Pixel Companion character engine.
 *
 * Creates the DOM element + canvas for one bot. The behavior controller
 * (behaviors.js) owns a single rAF loop and calls `bot.tick(dt)`; the bot
 * updates its internal clock and re-renders.
 *
 * API:
 *   bot.boot()                                    mount into document
 *   bot.tick(dtMs)                                advance clock + render
 *   bot.setEnabled(on) / bot.setSize(px)          live settings
 *   bot.setSkin(id)                               any PBArt.skinIds entry
 *   bot.setPos(x, y) / bot.setFacing(dir)         placement
 *   bot.size() / bot.groundY() / bot.hitTest(x,y) geometry + pixel hit test
 *   bot.state = 'walk'|'idle'|'jump'|'fall'|'sit'
 *   bot.face = 'normal'|'blink'|'happy'|'surprise'|'love'
 *   bot.jump() / bot.wave(ms) / bot.squash()
 *   bot.startAction(name) / bot.stopAction()      keyframed poses (see ACTIONS)
 *   bot.held / bot.pinned                         true while dragged / pinned
 *   bot.onClick / bot.onHover / bot.onGrab / bot.onRelease / bot.onDrop
 */
(function (global) {
  'use strict';

  var W = 64, H = 64; // internal art grid

  function PixelBot(opts) {
    opts = opts || {};
    this.px = opts.px || 4;
    this.skin = opts.skin || 'bot';
    this.state = 'idle';
    this.face = 'normal';
    this.facing = 1;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.phase = 0;                 // walk cycle
    this.t = 0;                     // seconds
    this._blinkAt = 0;
    this._blinkUntil = 0;
    this._waveT = null;
    this._bumpAt = -1;
    this._bumpDir = 1;
    this._enabled = true;
    this.onClick = null;
    this.onHover = null;
    this.onGrab = null;             // pointer pressed on an opaque pixel
    this.onRelease = null;          // pointer let go, dragged or not
    this.onDrop = null;             // released after a drag, (x, y)
    this.held = false;              // being dragged: arms up, legs dangling
    this.pinned = false;            // dropped away from the floor: floats there
    this._mask = null;              // alpha mask of the sprite, for hit testing
    this._maskAt = 0;
    this._drag = null;
    this._hitState = false;
    this._swallow = 0;              // swallow the page click that follows a grab
    this._built = false;
  }

  /* ---- sizing / placement ---- */
  PixelBot.prototype.size = function () {
    return { w: W * this.px, h: H * this.px };
  };

  PixelBot.prototype.groundY = function () {
    return Math.max(0, (global.innerHeight || 600) - H * this.px);
  };

  PixelBot.prototype.setSize = function (px) {
    this.px = px;
    if (!this._built) return;
    this.canvas.width = W * px;
    this.canvas.height = H * px;
    this.el.style.width = (W * px) + 'px';
    this.el.style.height = (H * px) + 'px';
    this.ctx.imageSmoothingEnabled = false;
    this.setPos(this.x, this.y);
    this._render();
    this._refreshMask();
  };

  PixelBot.prototype.setEnabled = function (on) {
    this._enabled = !!on;
    if (this._built) this.el.style.display = on ? 'block' : 'none';
    if (!on) this._setCursor(null);
  };

  PixelBot.prototype.setSkin = function (id) {
    var valid = (PBArt.skinIds.indexOf(id) !== -1);
    this.skin = valid ? id : 'bot';
    if (this._built) {
      this._render();
      this._refreshMask();
    }
  };

  PixelBot.prototype.isEnabled = function () {
    return this._enabled && this._built;
  };

  /* ---- mounting ---- */
  PixelBot.prototype.boot = function () {
    if (this._built) return;
    this._built = true;

    var px = this.px;
    this.el = document.createElement('div');
    this.el.className = 'pbc-bot';
    this.el.style.cssText =
      'position:fixed;z-index:2147483647;' +
      'width:' + (W * px) + 'px;height:' + (H * px) + 'px;' +
      'pointer-events:none;image-rendering:pixelated;' +
      'overflow:hidden;will-change:transform;' +
      'filter:drop-shadow(0 3px 5px rgba(10,20,40,0.30));';

    this.canvas = document.createElement('canvas');
    this.canvas.width = W * px;
    this.canvas.height = H * px;
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;';
    /* willReadFrequently: the alpha mask below re-reads this canvas with
       getImageData() twice a second, which otherwise forces a GPU->CPU
       readback every time (and a console warning in Chrome). */
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.ctx.imageSmoothingEnabled = false;
    this.el.appendChild(this.canvas);

    /* Pointer wiring.
     *
     * The old hot-spot was a full-size div with pointer-events:auto, so every
     * transparent pixel of the 64x64 box still swallowed the click — 44% of the
     * box on average, 58% for the widest skins.  That is what made the
     * character "eat" clicks aimed at the page.
     *
     * Instead the element keeps pointer-events:none, so the page is never
     * blocked, and capture-phase listeners decide for themselves whether the
     * pointer is over an opaque sprite pixel (hitTest against an alpha mask read
     * back from the canvas).  Only then do they claim the event.
     */
    var self = this;
    var onDown = function (e) { self._pointerDown(e); };
    var onMove = function (e) { self._pointerMove(e); };
    var onUp = function (e) { self._pointerUp(e); };
    var onClick = function (e) {
      if (self._swallow && performance.now() < self._swallow) {
        e.preventDefault();
        e.stopPropagation();
        self._swallow = 0;
      }
    };
    /* On a touch device the press goes to the page, so the page would start
       scrolling under the drag. Only touchstart's preventDefault stops that —
       which is why it is claimed here too, and only over a real pixel. */
    var onTouch = function (e) {
      if (!e.touches || e.touches.length !== 1) return;
      if (!self.hitTest(e.touches[0].clientX, e.touches[0].clientY)) return;
      e.preventDefault();
    };
    /* Pointer capture is not available on the document, so a window that loses
       focus mid-drag would otherwise leave the character stuck in the air. */
    var onBlur = function () {
      if (self._drag) {
        self._pointerUp({ clientX: self._drag.tx, clientY: self._drag.ty });
      }
      self._setCursor(null);
    };
    this._unbind = function () {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('touchstart', onTouch, true);
      global.removeEventListener('blur', onBlur);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    document.addEventListener('touchstart', onTouch,
                              { passive: false, capture: true });
    global.addEventListener('blur', onBlur);
    document.addEventListener('click', onClick, true);

    (document.body || document.documentElement).appendChild(this.el);
    this._render();
    this._refreshMask();
  };

  /* ---- hit testing ---- */
  /* Sample the rendered canvas into a per-pixel alpha mask.  Refreshed on
   * skin/size changes and now and then during animation, since the pose (arms,
   * legs) shifts the silhouette slightly. */
  PixelBot.prototype._refreshMask = function () {
    if (!this._built || this._dead) return;
    var px = this.px, w = W * px, data;
    try {
      data = this.ctx.getImageData(0, 0, w, H * px).data;
    } catch (err) {
      this._mask = null;            // unreadable canvas: fall back to the box
      return;
    }
    var mask = this._mask || (this._mask = new Uint8Array(W * H));
    var half = px >> 1;
    for (var j = 0; j < H; j++) {
      for (var i = 0; i < W; i++) {
        var o = (((j * px + half) * w) + (i * px + half)) * 4;
        mask[j * W + i] = data[o + 3] > 20 ? 1 : 0;
      }
    }
  };

  /* Is this viewport point over an opaque part of the character? */
  PixelBot.prototype.hitTest = function (clientX, clientY) {
    if (!this._built || !this._enabled) return false;
    var lx = clientX - this.x, ly = clientY - this.y;
    var w = W * this.px, h = H * this.px;
    if (lx < 0 || ly < 0 || lx >= w || ly >= h) return false;
    if (!this._mask) return true;   // no mask available: keep the old behaviour
    var i = (lx / this.px) | 0, j = (ly / this.px) | 0;
    return this._mask[j * W + i] === 1;
  };

  /* ---- pointer handling ---- */
  PixelBot.prototype._pointerDown = function (e) {
    if (!this._enabled || !this._built || this._drag) return;
    if (e.button) return;                                  // left button only
    if (!this.hitTest(e.clientX, e.clientY)) return;
    /* this press belongs to the character, not the page underneath */
    e.preventDefault();
    e.stopPropagation();
    this._drag = {
      ox: e.clientX - this.x,
      oy: e.clientY - this.y,
      sx: e.clientX,
      sy: e.clientY,
      t0: performance.now(),
      moved: false,
      tx: this.x,
      ty: this.y
    };
    this.el.style.transition = 'none';
    this._swallow = performance.now() + 600;
    if (this.onGrab) this.onGrab();
  };

  PixelBot.prototype._pointerMove = function (e) {
    if (!this._built || !this._enabled) return;
    var d = this._drag;
    if (d) {
      if (!d.moved &&
          Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 5) {
        d.moved = true;
      }
      if (!d.moved) return;
      var s = this.size();
      d.tx = Math.max(0, Math.min((global.innerWidth || 800) - s.w,
                                  e.clientX - d.ox));
      d.ty = Math.max(0, Math.min((global.innerHeight || 600) - s.h,
                                  e.clientY - d.oy));
      return;
    }
    var over = this.hitTest(e.clientX, e.clientY);
    if (over !== this._hitState) {
      this._hitState = over;
      if (this.onHover) this.onHover(over);
      this._setCursor(over ? 'grab' : null);
    }
  };

  PixelBot.prototype._pointerUp = function (e) {
    var d = this._drag;
    if (!d) return;
    this._drag = null;
    this.el.style.transition = '';
    this._swallow = performance.now() + 600;
    /* Every press must end somewhere, tap included: the tap branch below fires
       onClick and never onDrop, so a listener that claimed ownership on press
       (behaviors.js sets mode='held' there) had nothing to release it. */
    if (this.onRelease) this.onRelease();
    if (!d.moved) {
      /* a tap, not a drag */
      this._setCursor('grab');
      if (this.onClick) this.onClick();
      return;
    }
    this.setPos(d.tx, d.ty);
    this._hitState = this.hitTest(e.clientX, e.clientY);
    this._setCursor(this._hitState ? 'grab' : null);
    if (this.onDrop) this.onDrop(this.x, this.y);
  };

  /* Only ever touches the root's inline cursor, so the page's own cursor rules
   * still win on its own elements.  Tracked with an explicit flag: inferring
   * "we already set it" from the current value left the cursor stuck as grab
   * over the page whenever a later hover re-armed it without saving again. */
  PixelBot.prototype._setCursor = function (kind) {
    var root = document.documentElement;
    if (kind) {
      if (!this._cursorSet) {
        this._cursorWas = root.style.cursor || '';
        this._cursorSet = true;
      }
      this._cursorKind = kind;
      if (root.style.cursor !== kind) root.style.cursor = kind;
    } else if (this._cursorSet) {
      /* Only take our own value back off again.  A page that set a cursor of
         its own while we were showing 'grab' must keep it — blindly restoring
         the saved string clobbered it. */
      if (!this._cursorKind || root.style.cursor === this._cursorKind) {
        root.style.cursor = this._cursorWas;
      }
      this._cursorSet = false;
      this._cursorWas = undefined;
      this._cursorKind = undefined;
    }
  };

  /* Squash and stretch: flatten on impact, overshoot back, settle. */
  PixelBot.prototype.squash = function () {
    if (!this._built) return;
    var el = this.el;
    var steps = [
      [0, 'scale(1.24, 0.72)'],
      [130, 'scale(0.90, 1.14)'],
      [260, 'scale(1.05, 0.96)'],
      [390, '']
    ];
    /* pivot on the feet when standing, on the middle when floating */
    el.style.transformOrigin = this.pinned ? '50% 50%' : '50% 86%';
    el.style.transition = 'transform 120ms cubic-bezier(.3,.7,.4,1)';
    var self = this;
    steps.forEach(function (s) {
      setTimeout(function () {
        if (!self._dead && self._built) el.style.transform = s[1];
      }, s[0]);
    });
  };

  PixelBot.prototype.destroy = function () {
    this._dead = true;
    if (this._unbind) this._unbind();
    this._setCursor(null);
    if (this._built && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this._built = false;
  };

  /* ---- interactions ---- */
  PixelBot.prototype.setPos = function (x, y) {
    this.x = x; this.y = y;
    if (this._built) {
      this.el.style.left = Math.round(x) + 'px';
      this.el.style.top = Math.round(y) + 'px';
    }
  };

  PixelBot.prototype.setFacing = function (dir) {
    this.facing = dir < 0 ? -1 : 1;
  };

  PixelBot.prototype.jump = function () {
    if (this.state === 'jump' || this.state === 'fall') return;
    this.state = 'jump';
    this.vy = -9;
  };

  /* Timed on the bot's own clock (this.t), not wall time: tick() only advances
   * `t` while frames are actually being rendered, so a tab that sat hidden for
   * two minutes no longer resumes with the arm stuck in the wave pose for two
   * minutes' worth of frames. */
  PixelBot.prototype.wave = function (ms) {
    ms = ms || 1600;
    this._waveT = { start: this.t, until: this.t + ms / 1000 };
  };

  PixelBot.prototype.bump = function (dir) {
    this._bumpAt = performance.now();
    this._bumpDir = dir || 1;
    this.vx = this._bumpDir * 4;
  };

  /* Action timelines.  Each is a list of [elapsedMs, armState] keyframes plus
   * a total duration, so a skin can break into a short routine of poses without
   * any per-frame logic in the art.  `hop: true` marks a routine that actually
   * leaves the ground — the behaviour fires jump() for those (see _doAction),
   * which is what makes it an arc instead of a pose.
   *   punch   — guard, jab, guard, cross, guard     (panda kung fu)
   *   bounce  — paws up, riding the jump arc        (panda, hops)
   *   crane   — guard, one-legged crane stance, guard (panda kung fu)
   *   stretch — down, arms up, hold, down           (Oyen's only exercise)
   *   salute  — paw to the brim, hold, home         (scout pup, hops)
   *   spit    — lean and fire a volley of seeds     (watermelon)
   *
   * A skin opts in with `actions: ['name', ...]`; anything else never fires. */
  var ACTIONS = {
    punch:  { dur: 1500, keys: [[0, 'guard'], [260, 'punchA'], [520, 'guard'],
                                [780, 'punchB'], [1040, 'guard']] },
    bounce: { dur: 1200, hop: true,
              keys: [[0, 'up'], [820, 'up'], [980, 'down']] },
    crane:  { dur: 1700, keys: [[0, 'guard'], [500, 'crane'], [1300, 'guard']] },
    stretch: { dur: 1600,
               keys: [[0, 'down'], [320, 'up'], [1240, 'up'], [1500, 'down']] },
    salute: { dur: 1500, hop: true,
              keys: [[0, 'down'], [240, 'salute'], [1180, 'salute'],
                     [1400, 'down']] },
    spit:   { dur: 1600,
              keys: [[0, 'down'], [220, 'guard'], [1380, 'guard'],
                     [1580, 'down']] }
  };

  /* Start an action; returns its duration in ms (0 if unknown). */
  PixelBot.prototype.startAction = function (name) {
    var def = ACTIONS[name];
    if (!def) return 0;
    this.action = { name: name, t0: this.t * 1000 };
    this.armState = def.keys[0][1];
    /* Whether this routine is a real hop.  The behaviour used to test for the
       literal name 'bounce', which quietly limited the air to the panda; now
       any skin can declare one. */
    this.actionHops = def.hop === true;
    return def.dur;
  };

  PixelBot.prototype.stopAction = function () {
    this.action = null;
  };

  /* ---- loop ---- */
  PixelBot.prototype.tick = function (dtMs) {
    if (this._dead) return;
    this.t += dtMs / 1000;

    /* Being carried: chase the pointer with a little lag so it dangles, and
     * keep the walk cycle running so the legs swing. */
    if (this._drag && this._drag.moved) {
      this.held = true;
      var k = Math.min(1, dtMs / 90);
      this.setPos(this.x + (this._drag.tx - this.x) * k,
                  this.y + (this._drag.ty - this.y) * k);
      this.phase = (this.phase + 0.03) % 1;
      this.state = 'idle';
    } else if (this.held) {
      this.held = false;
    }

    /* the silhouette shifts with the pose, so re-sample the mask now and then */
    if (this.t - this._maskAt > 0.5) {
      this._maskAt = this.t;
      this._refreshMask();
    }

    this._render();
  };

  PixelBot.prototype._render = function () {
    if (!this._built) return;
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    /* Blink scheduling.  A blink is a short *window*, not a single frame: one
       frame at 60fps reads as a rendering glitch rather than a blink, and it
       flickered the mouth with it, because `face` also drove the mouth below.
       The mood is what the behaviour asked for; the blink only overrides the
       eyes. */
    var mood = this.face;
    var face = mood;
    if (this.held) {
      face = 'surprise';
    } else {
      if (this.t > this._blinkAt) {
        this._blinkUntil = this.t + 0.12;             // ~7 frames at 60fps
        this._blinkAt = this.t + 0.7 + Math.random() * 1.8;
      }
      if (this.t < this._blinkUntil) face = 'blink';
    }

    var mouth = 'normal';
    if (this.held || this.state === 'jump' || this.state === 'fall') mouth = 'o';
    else if (this.state === 'sit' || mood === 'happy' || mood === 'love')
      mouth = 'smile';

    var arm = 'down';
    var wave = 0;
    var actionName = null;
    /* A running kung-fu action drives the arm pose from its keyframes. */
    if (this.action) {
      var def = ACTIONS[this.action.name];
      var elapsed = this.t * 1000 - this.action.t0;
      if (!def || elapsed > def.dur) {
        this.action = null;
      } else {
        actionName = this.action.name;
        for (var k = 0; k < def.keys.length; k++) {
          if (elapsed >= def.keys[k][0]) arm = def.keys[k][1];
        }
        this.armState = arm;
      }
    }
    if (!this.action && !this.held) {
      if (this._waveT && this.t < this._waveT.until) {
        arm = 'wave';
        wave = (this.t - this._waveT.start) / 1.2;
      } else if (this.state === 'idle' || this.state === 'sit') {
        arm = (Math.sin(this.t * 0.7) > 0.6) ? 'up' : 'down';
      }
    }
    /* carried: both arms up as if lifted by the scruff, legs still swinging */
    if (this.held) arm = 'up';

    var phase = (this.state === 'walk' || this.held) ? this.phase : 0;
    var sway = (this.state === 'idle')
      ? Math.round(Math.sin(this.t * 2.2) * 0.6) : 0;

    PBArt.draw(PBArt.scaled(ctx, this.px), {
      skin: this.skin,
      face: face,
      mouth: mouth,
      phase: phase,
      bob: 0,
      facing: this.facing,
      arm: arm,
      wave: wave,
      sway: sway,
      action: actionName,
      shadow: this.state !== 'sit'
    });
  };

  global.PixelBot = PixelBot;
})(typeof globalThis !== 'undefined' ? globalThis : this);