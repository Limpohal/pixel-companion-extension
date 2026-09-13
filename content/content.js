/*
 * content.js — entry point for the Pixel Companion content script.
 *
 * Loads settings from chrome.storage.local (with sensible defaults and a
 * graceful fallback if the API is unavailable), decides per-site enablement,
 * boots one bot + behavior controller, and live-applies storage changes.
 *
 * Storage schema (chrome.storage.local):
 *   pbc_settings  { enabled:bool, size:int, speed:number,
 *                   sound:bool, speech:bool, character:string }
 *   pbc_sites     { "https://origin": { enabled:bool }, ... }
 */
(function () {
  'use strict';

  var DEFAULTS = {
    settings: { enabled: true, size: 4, speed: 1, sound: true, speech: true,
                character: 'bot' },
    sites: {}
  };

  var store = null;
  try {
    store = chrome.storage.local;   // requires "storage" permission
  } catch (e) {
    store = null;
  }

  var origin = 'unknown';
  try { origin = location.origin; } catch (e) {}

  var settings = JSON.parse(JSON.stringify(DEFAULTS.settings));
  var siteSetting = null; // undefined => enabled by default
  var bot = null;
  var behavior = null;

  /* ---------------------------------------------------------------- *
   * settings plumbing
   * ---------------------------------------------------------------- */
  function loadSettings(settingsObj, sitesObj) {
    settingsObj = settingsObj || DEFAULTS.settings;
    sitesObj = sitesObj || DEFAULTS.sites;
    settings.enabled = settingsObj.enabled !== false;
    settings.size = clampInt(settingsObj.size, 2, 10, 4);
    settings.speed = clampNum(settingsObj.speed, 0.4, 3, 1);
    settings.sound = settingsObj.sound !== false;
    settings.speech = settingsObj.speech !== false;
    var skinIds = (typeof PBArt !== 'undefined' && PBArt.skinIds) || ['bot'];
    settings.character = (skinIds.indexOf(settingsObj.character) !== -1)
      ? settingsObj.character : 'bot';
    siteSetting = sitesObj[origin];
    if (siteSetting && siteSetting.enabled === false) {
      settings.enabled = false;
    }
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

  function readStore(cb) {
    if (!store) { cb(null, null); return; }
    try {
      store.get(['pbc_settings', 'pbc_sites'], function (res) {
        cb(res && res.pbc_settings, res && res.pbc_sites);
      });
    } catch (e) {
      cb(null, null);
    }
  }

  function applyLive() {
    if (!bot) return;
    /* module-level `settings` already refreshed by the caller */
    bot.setSize(settings.size);
    bot.setEnabled(settings.enabled);
    bot.setSkin(settings.character);
  }

  /* ---------------------------------------------------------------- *
   * boot
   * ---------------------------------------------------------------- */
  function init() {
    readStore(function (settingsRaw, sitesRaw) {
      loadSettings(settingsRaw, sitesRaw);

      bot = new PixelBot({ px: settings.size, skin: settings.character });
      bot.boot();
      bot.setEnabled(settings.enabled);
      bot.setSkin(settings.character);
      bot.setPos(
        Math.random() * Math.max(10, window.innerWidth - bot.size().w - 10),
        bot.groundY()
      );

      behavior = new PBBehavior(bot, function () {
        return settings;
      });
      behavior.start();

      if (store) {
        try {
          chrome.storage.onChanged.addListener(function (changes, area) {
            if (area !== 'local') return;
            if (changes.pbc_settings || changes.pbc_sites) {
              readStore(function (s, st) {
                loadSettings(s, st);
                applyLive();
              });
            }
          });
        } catch (e) { /* older API */ }
      }
    });
  }

  function boot() {
    if (document.body) {
      init();
    } else {
      var tries = 0;
      var t = setInterval(function () {
        tries++;
        if (document.body || tries > 200) {
          clearInterval(t);
          init();
        }
      }, 25);
    }
  }

  boot();
})();