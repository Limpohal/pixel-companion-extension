/*
 * popup.js — settings popup logic for Pixel Companion.
 * Reads/writes chrome.storage.local: pbc_settings + pbc_sites.
 * Renders an animated preview of the bot with a small walking loop.
 */
(function () {
  'use strict';

  var DEFAULTS = { enabled: true, size: 4, speed: 1, sound: true, speech: true,
                   character: 'bot' };

  var origin = 'unknown';

  var els = {
    siteToggle: document.getElementById('siteToggle'),
    globalToggle: document.getElementById('globalToggle'),
    soundToggle: document.getElementById('soundToggle'),
    speechToggle: document.getElementById('speechToggle'),
    size: document.getElementById('size'),
    speed: document.getElementById('speed'),
    sizeVal: document.getElementById('sizeVal'),
    speedVal: document.getElementById('speedVal'),
    siteHint: document.getElementById('siteHint'),
    preview: document.getElementById('preview'),
    charGrid: document.getElementById('charGrid')
  };

  var settings = JSON.parse(JSON.stringify(DEFAULTS));
  var sites = {};
  var siteSetting = null;

  var store = null;
  try { store = chrome.storage.local; } catch (e) {}

  /* ---------------------------------------------------------------- *
   * Determine the active tab's origin
   * ---------------------------------------------------------------- */
  function getPageOrigin(cb) {
    try {
      var tabs = chrome && chrome.tabs;
      if (tabs && tabs.query) {
        tabs.query({ active: true, currentWindow: true }, function (t) {
          try {
            var u = t && t[0] && t[0].url;
            if (u) {
              var a = document.createElement('a');
              a.href = u;
              origin = a.origin || a.hostname || u;
            }
          } catch (e) { /* use default */ }
          cb();
        });
      } else {
        cb();
      }
    } catch (e) { cb(); }
  }

  function clampInt(v, lo, hi, d) {
    v = parseInt(v, 10);
    if (isNaN(v)) return d;
    return Math.max(lo, Math.min(hi, v));
  }
  function clampNum(v, lo, hi, d) {
    v = parseFloat(v);
    if (isNaN(v)) return d;
    return Math.max(lo, Math.min(hi, v));
  }

  /* ---------------------------------------------------------------- *
   * load
   * ---------------------------------------------------------------- */
  function load() {
    els.siteHint.textContent = origin === 'unknown' ? 'this page' : origin;
    if (!store) {
      applyToUI();
      return;
    }
    store.get(['pbc_settings', 'pbc_sites'], function (res) {
      if (res && res.pbc_settings) {
        settings.enabled = res.pbc_settings.enabled !== false;
        settings.size = clampInt(res.pbc_settings.size, 2, 10, 4);
        settings.speed = clampNum(res.pbc_settings.speed, 0.4, 3, 1);
        settings.sound = res.pbc_settings.sound !== false;
        settings.speech = res.pbc_settings.speech !== false;
        settings.character = (PBArt.skinIds.indexOf(res.pbc_settings.character) !== -1)
          ? res.pbc_settings.character : 'bot';
      }
      if (res && res.pbc_sites) sites = res.pbc_sites;
      siteSetting = sites[origin] || null;
      applyToUI();
    });
  }

  function applyToUI() {
    var siteOn = !(siteSetting && siteSetting.enabled === false);
    els.siteToggle.checked = siteOn && settings.enabled;
    els.siteToggle.disabled = !settings.enabled;
    els.globalToggle.checked = settings.enabled;
    els.soundToggle.checked = settings.sound;
    els.speechToggle.checked = settings.speech;
    els.size.value = String(settings.size);
    els.speed.value = String(Math.round(settings.speed * 10));
    updateLabels();
    /* `load()` resolves asynchronously, so the picker highlight must be
       re-synced here — not only when a tile is clicked. */
    markSelected();
  }

  function updateLabels() {
    var sizes = ['mini', 'small', 'cozy', 'medium', 'large', 'chunky', 'beefy', 'big boy', 'giant'];
    var sz = settings.size - 2; // 2..10 -> 0..8
    els.sizeVal.textContent = settings.size + ' px · ' +
      (sizes[sz] || 'whoa');
    els.speedVal.textContent = settings.speed.toFixed(1) + '×';
  }

  /* ---------------------------------------------------------------- *
   * save (debounced)
   * ---------------------------------------------------------------- */
  var saveTimer = null;
  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (!store) return;
      store.set({
        pbc_settings: {
          enabled: settings.enabled,
          size: settings.size,
          speed: Math.round(settings.speed * 10) / 10,
          sound: settings.sound,
          speech: settings.speech,
          character: settings.character
        },
        pbc_sites: sites
      });
    }, 150);
  }

  function siteOnNow() {
    return !(siteSetting && siteSetting.enabled === false);
  }

  /* ---------------------------------------------------------------- *
   * event wiring
   * ---------------------------------------------------------------- */
  els.globalToggle.addEventListener('change', function () {
    settings.enabled = this.checked;
    els.siteToggle.disabled = !settings.enabled;
    if (!settings.enabled) els.siteToggle.checked = false;
    else els.siteToggle.checked = siteOnNow();
    save();
  });

  els.siteToggle.addEventListener('change', function () {
    siteSetting = sites[origin] || {};
    if (this.checked) {
      delete siteSetting.enabled;
      if (!Object.keys(siteSetting).length) delete sites[origin];
      else sites[origin] = siteSetting;
    } else {
      sites[origin] = { enabled: false };
    }
    save();
  });

  els.soundToggle.addEventListener('change', function () {
    settings.sound = this.checked;
    save();
  });

  els.speechToggle.addEventListener('change', function () {
    settings.speech = this.checked;
    save();
  });

  els.size.addEventListener('input', function () {
    settings.size = clampInt(this.value, 2, 10, 4);
    updateLabels();
    save();
  });

  els.speed.addEventListener('input', function () {
    settings.speed = clampNum(this.value / 10, 0.4, 3, 1);
    updateLabels();
    save();
  });

  /* ---------------------------------------------------------------- *
   * animated preview
   * ---------------------------------------------------------------- */
  function startPreview() {
    var canvas = els.preview;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var t = 0;
    (function loop() {
      t += 0.016;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(16, 14);
      var face = (Math.sin(t * 1.3) > 0.985) ? 'blink' : 'happy';
      PBArt.draw(PBArt.scaled(ctx, 1), {
        skin: settings.character,
        face: face,
        mouth: (Math.sin(t) > 0.93) ? 'smile' : 'normal',
        phase: t * 0.9,
        facing: 1,
        arm: 'wave',
        wave: t,
        sway: Math.round(Math.sin(t * 2.5) * 0.6)
      });
      ctx.restore();
      requestAnimationFrame(loop);
    })();
  }

  /* ---------------------------------------------------------------- *
   * character picker
   * ---------------------------------------------------------------- */
  function buildCharacterGrid() {
    if (!els.charGrid) return;
    els.charGrid.innerHTML = '';
    PBArt.skinIds.forEach(function (id) {
      var opt = document.createElement('div');
      opt.className = 'char-opt';
      opt.dataset.skin = id;

      var cv = document.createElement('canvas');
      cv.width = 64; cv.height = 64;
      var cctx = cv.getContext('2d');
      cctx.imageSmoothingEnabled = false;
      PBArt.draw(PBArt.scaled(cctx, 1), {
        skin: id,
        face: 'happy',
        mouth: 'smile',
        phase: 0.1,
        facing: 1,
        arm: 'down'
      });
      opt.appendChild(cv);

      var name = document.createElement('div');
      name.className = 'cname';
      name.textContent = PBArt.skinLabel(id);
      opt.appendChild(name);

      opt.addEventListener('click', function () {
        settings.character = id;
        markSelected();
        updateHeaderPreview();
        save();
      });
      els.charGrid.appendChild(opt);
    });
    markSelected();
  }

  function markSelected() {
    if (!els.charGrid) return;
    var kids = els.charGrid.querySelectorAll('.char-opt');
    for (var i = 0; i < kids.length; i++) {
      kids[i].classList.toggle('sel', kids[i].dataset.skin === settings.character);
    }
  }

  function updateHeaderPreview() {
    /* startPreview redraws every frame from settings.character; nothing else
       needed here — kept as a hook for clarity. */
  }

  /* ---- kick off ---- */
  getPageOrigin(function () {
    load();
    buildCharacterGrid();
    startPreview();
  });
})();