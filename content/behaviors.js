/*
 * behaviors.js — Hermes-style behavior brain for the Pixel Companion.
 *
 * Owns the single rAF loop; drives the bot through a small state machine:
 *
 *   walk  — patrol the bottom of the viewport, flip at edges
 *   idle  — stand and wiggle, blink, occasionally speak
 *   sit   — parked, relaxed, smiley
 *   jump  — hop (physics, with bounce)
 *   fall  — airborne after jump
 *   held  — being dragged by the pointer; physics suspended
 *   pinned— dropped away from the floor; floats there and bobs
 *   scroll— riding the vertical scrollbar, following page scroll
 *
 * Plus ambient reactions: looks/waves at the mouse, squashes when poked,
 * rides the scrollbar when the page scrolls, and speaks on timers.
 */
(function (global) {
  'use strict';

  function PBBehavior(bot, getSettings) {
    this.bot = bot;
    this.getSettings = getSettings;       // () => settings object
    this.mode = 'walk';
    this.modeUntil = 0;                   // ms timestamp
    this.mouse = { x: -9999, y: -9999, near: false };
    this.scrollbar = null;                // {frac, trackH}
    this.nextSpeak = 0;
    this._raf = null;
    this._last = null;
    this._started = false;
    this._scrollStoppedAt = 0;
    this._speakLockUntil = 0;
    this._hoverWaveAt = 0;
    this.nextAction = 0;                  // kung-fu flourish timer
  }

  /* Skins may declare `actions` (see art.js).  The panda uses this to break
   * into kung fu; every other character simply never qualifies. */
  function actionList(bot) {
    var skin = PBArt.SKINS[bot.skin];
    return (skin && skin.actions) || null;
  }

  var GRAVITY = 0.55;         // normalized units per frame**2 at 60fps

  /* ---------------------------------------------------------------- *
   * wiring
   * ---------------------------------------------------------------- */
  PBBehavior.prototype.start = function () {
    if (this._started) return;
    this._started = true;
    var self = this;

    /* place bot at a random spot on the ground */
    var s = this.bot.size();
    var x = Math.random() * Math.max(10, global.innerWidth - s.w - 10);
    this.bot.setPos(x, this.bot.groundY());
    this.bot.setFacing(Math.random() < 0.5 ? 1 : -1);
    this.mode = 'walk';
    this.modeUntil = this._now() + 6000;
    /* first kung-fu flourish lands 7-13s after the page loads, then every
       20-35s while he is not otherwise busy */
    this.nextAction = this._now() + 7000 + Math.random() * 6000;

    /* world listeners */
    global.addEventListener('mousemove', function (e) {
      self.mouse.x = e.clientX;
      self.mouse.y = e.clientY;
    });
    global.addEventListener('mouseleave', function () {
      self.mouse.x = -9999;
      self.mouse.y = -9999;
    });
    var scrollT = null;
    global.addEventListener('scroll', function () {
      if (self.mode === 'scroll') {
        self._scrollStoppedAt = self._now() + 1400;
      } else if (scrollT === null) {
        /* page scrolled while grounded: maybe hop on */
        scrollT = setTimeout(function () {
          scrollT = null;
          self._maybeRideScroll();
        }, 120);
      }
    }, true);

    global.addEventListener('resize', function () {
      self._clampToViewport();
    });

    /* bot reactions */
    this.bot.onClick = function () {
      self._reactClick();
    };
    this.bot.onHover = function (over) {
      self._hover = over;
      if (over) {
        self.bot.face = 'happy';
        self._hoverWaveAt = self._now() + 900;
      } else {
        self.bot.face = 'normal';
      }
    };
    /* picked up: the pointer owns it now, so drop whatever it was doing */
    this.bot.onGrab = function () {
      self.mode = 'held';
      self.bot.stopAction();
      self.bot.state = 'idle';
      self.bot.face = 'surprise';
      self._speakLockUntil = self._now() + 1600;
    };
    /* put down: near the floor it goes back to walking, higher up it stays
       pinned there and bobs gently until you move it again */
    this.bot.onDrop = function (x, y) {
      var s = self.bot.size();
      var band = Math.round(s.h * 0.4);         // "close enough to the floor"
      if (y >= self.bot.groundY() - band) {
        self.bot.pinned = false;
        self.bot.setPos(x, self.bot.groundY());
        self.mode = 'walk';
        self.modeUntil = self._now() + 1200 + Math.random() * 2000;
      } else {
        self.bot.pinned = true;
        self._pinY = y;
        self.bot.setPos(x, y);                  // settle immediately, no 1-frame lag
        self.mode = 'pinned';
        self.modeUntil = 0;                     // stays until moved again
      }
      self.bot.squash();
      self._play('land');
    };

    this._last = performance.now();
    this._frame = this._frame.bind(this);
    this._raf = requestAnimationFrame(this._frame);
  };

  PBBehavior.prototype.stop = function () {
    this._started = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  };

  PBBehavior.prototype._now = function () {
    return performance.now();
  };

  /* ---------------------------------------------------------------- *
   * main loop
   * ---------------------------------------------------------------- */
  PBBehavior.prototype._frame = function (now) {
    var dt = Math.min(50, now - (this._last || now));
    this._last = now;
    if (this._frame) this._raf = requestAnimationFrame(this._frame);

    var s = this.getSettings();
    if (!s.enabled) return;               // still render, just no behavior

    this._update(dt, now);
    this.bot.tick(dt);
  };

  PBBehavior.prototype._update = function (dt, now) {
    var bot = this.bot;
    var s = this.getSettings();
    var speedMul = (s.speed || 1);
    var px = bot.px;
    var n = dt / 16.7;               // normalized to a 60fps frame

    /* ---- scrollbar riding takes full priority ---- */
    if (this.mode === 'scroll') {
      this._updateScroll(now);
      return;
    }

    /* ---- being carried: the pointer owns the position ---- */
    if (this.mode === 'held' || bot.held) {
      bot.state = 'idle';
      this._mouseReact(dt, now);
      return;
    }

    /* ---- pinned: floating where it was dropped, bobbing gently ---- */
    if (this.mode === 'pinned') {
      bot.state = 'idle';
      /* keep the pin point on screen if the window was resized under it */
      var bs = bot.size();
      this._pinY = Math.max(0, Math.min(this._pinY,
                             (global.innerHeight || 600) - bs.h));
      bot.y = this._pinY + Math.sin(now / 700) * 3;
      this._clampToViewport();
      if (s.speech && now > this.nextSpeak && now > this._speakLockUntil) {
        this._speak(this._hover ? 'happy' : 'idle');
        this.nextSpeak = now + 9000 + Math.random() * 16000;
      }
      this._mouseReact(dt, now);
      return;
    }

    /* ---- physics: walk / jump / fall ---- */
    if (bot.state === 'walk') {
      var walkSpeed = 0.04 * px * speedMul * n;   // px per 60fps frame
      bot.x += bot.facing * walkSpeed;
    } else if (bot.state === 'jump' || bot.state === 'fall') {
      bot.vy += GRAVITY * n;
      bot.x += (bot.vx || 0) * n;
      bot.y += bot.vy * n;
      if (bot.vy > 0) bot.state = 'fall';
      if (bot.y >= bot.groundY()) {
        bot.y = bot.groundY();
        bot.vy = 0;
        bot.state = 'walk';
        bot.phase = 0;
        this._onLand(now);
      }
    }

    /* ---- walk-cycle phase advances while walking ---- */
    if (bot.state === 'walk') {
      bot.phase = (bot.phase + 0.018 * speedMul * n) % 1;
    }

    /* ---- edge flip ---- */
    this._clampToViewport();

    /* ---- mode scheduling ---- */
    if (this.mode === 'walk' && now > this.modeUntil) this._pickGroundMode(now);
    else if (this.mode === 'idle' && now > this.modeUntil) this._pickGroundMode(now);
    else if (this.mode === 'sit' && now > this.modeUntil) {
      this._pickGroundMode(now);
    } else if (this.mode === 'scroll' && now > this.modeUntil) {
      this._leaveScroll(now);
    }

    /* ---- ambient speak ---- */
    if (s.speech && now > this.nextSpeak && now > this._speakLockUntil) {
      var banks = ['idle', 'idle', 'happy'];
      var bank = banks[Math.floor(Math.random() * banks.length)];
      if (this.mode === 'sit') bank = 'love';
      this._speak(bank);
      this.nextSpeak = now + 9000 + Math.random() * 16000;
    }

    /* ---- kung-fu flourish, if this skin has moves ---- */
    this._maybeAction(now);

    /* ---- mouse reactivity ---- */
    this._mouseReact(dt, now);
  };

  /* ---------------------------------------------------------------- *
   * ground modes
   * ---------------------------------------------------------------- */
  PBBehavior.prototype._pickGroundMode = function (now) {
    var r = Math.random();
    if (r < 0.55) {
      this.mode = 'walk';
      this.bot.state = 'walk';
      this.modeUntil = now + 2500 + Math.random() * 6000;
    } else if (r < 0.82) {
      this.mode = 'idle';
      this.bot.state = 'idle';
      this.bot.face = 'normal';
      this.modeUntil = now + 1200 + Math.random() * 2800;
    } else {
      this.mode = 'sit';
      this.bot.state = 'sit';
      this.bot.face = 'love';
      this.modeUntil = now + 3000 + Math.random() * 7000;
    }
  };

  /* ---------------------------------------------------------------- *
   * kung-fu flourishes (skins that declare `actions`)
   * ---------------------------------------------------------------- */
  PBBehavior.prototype._doAction = function (now, forced) {
    var list = actionList(this.bot);
    if (!list || !list.length) return false;
    var name = forced || list[Math.floor(Math.random() * list.length)];
    var dur = this.bot.startAction(name);
    if (!dur) return false;
    /* the belly bounce is an actual hop */
    if (name === 'bounce') this.bot.jump();
    this.mode = 'idle';
    this.bot.state = this.bot.state === 'jump' ? 'jump' : 'idle';
    this.bot.face = 'happy';
    this.modeUntil = now + dur + 250;
    this.nextAction = now + 20000 + Math.random() * 15000;   // 20-35s
    this._speak('action', dur + 300);
    this._play('kungfu');
    this._speakLockUntil = now + dur + 700;
    return true;
  };

  PBBehavior.prototype._maybeAction = function (now) {
    if (this.mode === 'scroll') return;
    if (this.bot.state === 'jump' || this.bot.state === 'fall') return;
    if (this.bot.action) return;
    if (now < this.nextAction) return;
    this._doAction(now);
  };

  PBBehavior.prototype._clampToViewport = function () {
    var bot = this.bot;
    if (bot.held) return;                 // the pointer owns the position
    var s = bot.size();
    var maxX = Math.max(0, global.innerWidth - s.w);
    if (bot.x <= 1) { bot.x = 1; if (!bot.pinned) bot.setFacing(1); }
    else if (bot.x >= maxX - 1) { bot.x = maxX - 1; if (!bot.pinned) bot.setFacing(-1); }
    /* Ground it only when it is neither airborne nor pinned mid-page. */
    if (!bot.pinned && bot.state !== 'jump' && bot.state !== 'fall') {
      bot.y = Math.min(bot.y, bot.groundY());
    }
    bot.setPos(bot.x, bot.y);
  };

  /* ---------------------------------------------------------------- *
   * jump + landing
   * ---------------------------------------------------------------- */
  PBBehavior.prototype._reactClick = function () {
    var bot = this.bot;
    if (this.mode === 'scroll' || bot.held || this.mode === 'held') return;
    /* A poke gets a squash-and-stretch boing.  It deliberately does NOT
       interrupt what the character was doing and does not move it: the
       per-character kung-fu flourish still fires on its own timer. */
    bot.squash();
    bot.face = 'happy';
    this._play('boing');
    this._speak('jump', 1200);
    this._speakLockUntil = this._now() + 1500;
  };

  PBBehavior.prototype._onLand = function (now) {
    this._play('land');
    this.bot.face = 'normal';
    this.mode = 'walk';
    this.modeUntil = now + 2000 + Math.random() * 3000;
  };

  /* ---------------------------------------------------------------- *
   * mouse reactions
   * ---------------------------------------------------------------- */
  PBBehavior.prototype._mouseReact = function (dt, now) {
    var bot = this.bot;
    var s = bot.size();
    var cx = bot.x + s.w / 2, cy = bot.y + s.h / 2;
    var dx = this.mouse.x - cx, dy = this.mouse.y - cy;
    var dist = Math.sqrt(dx * dx + dy * dy);

    var wasNear = this._near;
    this._near = dist < 170;
    if (this._near && !wasNear) {
      this._play('thought');
    }

    if (this._near && this.mode !== 'scroll') {
      /* face the mouse */
      if (dx !== 0) bot.setFacing(dx > 0 ? 1 : -1);
      /* wave when it hovers nearby */
      if (this._hover && this._now() > this._hoverWaveAt) {
        bot.wave(1400);
        if (Math.random() < 0.25) this._speak('wave', 1400);
        this._hoverWaveAt = this._now() + 4000 + Math.random() * 5000;
      }
    }
  };

  /* ---------------------------------------------------------------- *
   * scrollbar riding
   * ---------------------------------------------------------------- */
  PBBehavior.prototype._pageScrollable = function () {
    var de = document.documentElement;
    var db = document.body;
    var sh = Math.max(de.scrollHeight, db ? db.scrollHeight : 0);
    return sh > global.innerHeight + 40;
  };

  PBBehavior.prototype._maybeRideScroll = function () {
    if (this.mode === 'scroll') return;
    if (this.mode === 'held' || this.mode === 'pinned') return;
    if (this.bot.held || this.bot.pinned) return;
    if (!this._pageScrollable()) return;
    if (Math.random() > 0.35) return;
    var bot = this.bot;
    var now = this._now();
    var s = bot.size();
    /* hop to the scrollbar track: top-right, above the thumb area */
    this.mode = 'scroll';
    this.bot.state = 'walk';
    this.bot.face = 'happy';
    this.modeUntil = now + 4000 + Math.random() * 6000;
    this._play('wave');
    this._speak('scroll', 1800);
    this._speakLockUntil = now + 2000;
    this.bot.vx = 0;
    var trackX = global.innerWidth - s.w - 14;
    this.bot.setPos(trackX, this.bot.groundY());
    this._scrollStoppedAt = now + 1500;
  };

  PBBehavior.prototype._updateScroll = function (now) {
    var bot = this.bot;
    var de = document.documentElement;
    var sh = Math.max(de.scrollHeight, (document.body ? document.body.scrollHeight : 0));
    var maxScroll = Math.max(1, sh - global.innerHeight);
    var frac = Math.min(1, Math.max(0, (global.scrollY || de.scrollTop || 0) / maxScroll));
    var s = bot.size();
    /* thumb-ish position: leave margins like a real scrollbar thumb */
    var top = 8 + frac * Math.max(0, global.innerHeight - s.h - 16);
    bot.setPos(bot.x, top);
    bot.phase = (bot.phase + 0.05) % 1;
    this.scrollbar = { frac: frac };
    if (now > this._scrollStoppedAt) {
      this._leaveScroll(now);
    }
  };

  PBBehavior.prototype._leaveScroll = function (now) {
    this.mode = 'idle';
    this.bot.state = 'idle';
    this.bot.face = 'normal';
    this.modeUntil = now + 800;
    var bot = this.bot;
    /* hop back down */
    bot.setPos(bot.x, bot.groundY());
    bot.phase = 0;
  };

  /* ---------------------------------------------------------------- *
   * speech + sound helpers
   * ---------------------------------------------------------------- */
  PBBehavior.prototype._speak = function (bank, minDur) {
    var s = this.getSettings();
    if (!s.speech) return;
    var text = PB_SPEECH.pick(bank, this.bot.skin);
    try {
      new PB_SPEECH.SpeechBubble({
        parent: this.bot.el,
        duration: minDur || 2400,
        text: text
      }).show();
    } catch (e) { /* ignore */ }
  };

  PBBehavior.prototype._play = function (name) {
    var s = this.getSettings();
    if (!s.sound) return;
    PB_SOUND.play(name);
  };

  /* scroll-mode update hook (called from the scroll listener). */
  PBBehavior.prototype.onPageScroll = function () {
    if (this.mode !== 'scroll') return;
    this._scrollStoppedAt = this._now() + 1400;
  };

  global.PBBehavior = PBBehavior;
})(typeof globalThis !== 'undefined' ? globalThis : this);