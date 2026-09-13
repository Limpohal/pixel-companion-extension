/*
 * synth.js — tiny synthesized sound effects via WebAudio (no audio files).
 * Only plays when the user has sound enabled AND has interacted with the
 * page at least once (browser autoplay policy).
 */
(function (global) {
  'use strict';

  var PB_SOUND = {
    enabled: true,
    _ctx: null,
    _unlocked: false,
    _master: null
  };

  function ensure() {
    if (!PB_SOUND.enabled) return null;
    if (!PB_SOUND._ctx) {
      try {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        PB_SOUND._ctx = new AC();
        PB_SOUND._master = PB_SOUND._ctx.createGain();
        PB_SOUND._master.gain.value = 0.5;
        PB_SOUND._master.connect(PB_SOUND._ctx.destination);
      } catch (e) {
        return null;
      }
    }
    /* Unlock on first gesture — browsers require it. */
    if (!PB_SOUND._unlocked && PB_SOUND._ctx.state === 'suspended') {
      PB_SOUND._ctx.resume();
    }
    PB_SOUND._unlocked = true;
    return PB_SOUND._ctx;
  }

  function tone(ctx, master, type, freq, dur, vol, when, slideTo) {
    var t0 = ctx.currentTime + (when || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /* Public sound effects; each no-ops gracefully if audio unavailable. */
  PB_SOUND.play = function (name) {
    var ctx = ensure();
    if (!ctx || !PB_SOUND._master) return;
    var m = PB_SOUND._master;
    try {
      switch (name) {
        case 'hop':
          tone(ctx, m, 'square', 320, 0.16, 0.16, 0, 660);
          break;
        case 'boing':
          /* squash-and-stretch poke: a fast upward bend that falls back */
          tone(ctx, m, 'sine', 260, 0.20, 0.14, 0, 720);
          tone(ctx, m, 'triangle', 520, 0.16, 0.07, 0.05, 300);
          break;
        case 'land':
          tone(ctx, m, 'triangle', 200, 0.10, 0.12, 0, 90);
          break;
        case 'boop':
          tone(ctx, m, 'sine', 740, 0.10, 0.10);
          tone(ctx, m, 'sine', 990, 0.12, 0.08, 0.06);
          break;
        case 'wave':
          tone(ctx, m, 'sine', 520, 0.10, 0.08);
          tone(ctx, m, 'sine', 660, 0.10, 0.08, 0.10);
          tone(ctx, m, 'sine', 880, 0.12, 0.08, 0.20);
          break;
        case 'thought':
          tone(ctx, m, 'sine', 880, 0.06, 0.05);
          tone(ctx, m, 'sine', 1180, 0.08, 0.05, 0.07);
          break;
        case 'blip':
          tone(ctx, m, 'square', 440, 0.06, 0.06);
          break;
        case 'kungfu':
          /* a short descending "hiya!" for the kung-fu flourishes */
          tone(ctx, m, 'square', 700, 0.07, 0.10, 0, 420);
          tone(ctx, m, 'square', 420, 0.10, 0.09, 0.08, 200);
          break;
        default:
          break;
      }
    } catch (e) { /* ignore */ }
  };

  global.PB_SOUND = PB_SOUND;
})(typeof globalThis !== 'undefined' ? globalThis : this);