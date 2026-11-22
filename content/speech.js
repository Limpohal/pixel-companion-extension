/*
 * speech.js — speech bubbles + the bot's personality line bank.
 * SpeechBubble creates a little rounded bubble above the bot that
 * types out text with a blinking caret, then fades away.
 */
(function (global) {
  'use strict';

  var PB_SPEECH = {};

  /* ---- line banks ---- */
  var LINES = {
    idle: [
      'beep boop', 'all good here', 'just vibing',
      'this tab is my home', 'zzz… beep', 'monitoring…',
      'watching you work', 'boop!', 'so many tabs', 'hello human'
    ],
    happy: [
      'nice!', 'beep beep!', 'love that', 'great job!',
      'wow!', 'that was smooth', 'phew', 'achievement unlocked'
    ],
    surprise: [
      'whoa!', 'whoop!', 'wow wow', 'did you see that?!',
      '?!', 'beep?', 'unexpected!', 'whoa there'
    ],
    wave: [
      'hi hi hi!', 'hello!!', 'over here!', 'hey hey!',
      '*waves*', 'psst!', 'boop boop!', 'follow me!'
    ],
    love: [
      '<3', 'beep <3', 'aww', 'you\'re my favorite tab', '*blush*', '<3 <3'
    ],
    jump: [
      'wheee!', 'up we go!', 'wheee!!', 'boing!', 'yeet!'
    ],
    scroll: [
      'riding the scrollbar', 'weeeee', 'it\'s a slide!',
      'how fast can this go?', 'yeehaw'
    ]
  };

  /* ---- per-character line banks (override 'idle'/'love'/'jump' banks) ---- */
  var CHARACTER_LINES = {
    snowman: {
      idle: [
        'staying cool', 'chill vibes only', 'do not warm up to me too fast',
        'snow problem here', 'feeling frosty', 'brrr… nice',
        'winter is my season', 'flake later!'
      ],
      love: ['cool <3', 'you melt my heart', 'warm hugs!', '*frosty blush*'],
      jump: ['snow way!', 'flurry hop!', 'brrring it on!'],
      scroll: ['sliding like sleet', 'ice ride!', 'downhill!']
    },
    shark: {
      idle: [
        'just keep swimming', 'hood up, worries down',
        'baby shark, doo doo', 'cozy in my hoodie',
        'fin-tastic!', 'no bones about it', 'chillin' + '\u2019' + ' hard'
      ],
      love: ['you\'re jaw-some', '<3 from the pod', 'hug? hug.', '*snuggle*'],
      jump: ['cannonball!', 'belly flop!', 'making waves!'],
      scroll: ['surf\'s up!', 'riding the current', 'tidal slide!']
    },
    capy: {
      idle: [
        'mmhmm', 'it is what it is', 'no thoughts, leaf hat',
        'everything is fine', 'v slowly', 'unbothered',
        'grass tastes good today', 'resting is my job'
      ],
      love: ['mmhmm <3', 'sit with me', 'warm and round', '*content sigh*'],
      jump: ['hooray… i guess', 'small hop', 'wheee (quietly)'],
      scroll: ['elevator mode', 'going down, slowly', 'mm, descending']
    },
    koala: {
      idle: [
        'zzz… eucalyptus', 'nap first, questions later',
        '20 hours of sleep, minimum', 'leaf me alone',
        'hugging mode: on', 'slow and sleepy'
      ],
      love: ['clinging to you <3', 'nap buddy found', '*sleepy sniff*'],
      jump: ['whoa!! too awake', 'leaf jump!', 'hup!'],
      scroll: ['sliding like a gum tree', 'snooze scroll']
    },
    panda: {
      idle: [
        'snack time. again.', 'bamboo > everything',
        'rolling is a lifestyle', 'eating is my cardio',
        'chew chew chew', 'fluffy and ready'
      ],
      love: ['<3 + bamboo = happy', 'cuddle and chew', 'you complete my snack'],
      jump: ['panda bounce!', 'boing~', 'tumbling!'],
      scroll: ['rolling down', 'wheee, bamboo later'],
      /* shouted while doing his kung-fu flourishes */
      action: [
        'hiya!', 'hah!', 'hooah!', 'noodle fist!', 'belly power!',
        'inner peace!', 'kung fu!', 'wax on, snack on!'
      ]
    },
    butterfly: {
      idle: [
        'just fluttering by', 'pollen o clock', 'wings fresh today',
        'flower count: many', 'light as a pixel', 'breezy'
      ],
      love: ['flutter <3', 'you give me butterflies', '*happy wing flap*'],
      jump: ['wheee, lift off!', 'flutter jump!', 'airborne!'],
      scroll: ['gliding down', 'wind tunnel mode']
    },
    skye: {
      idle: [
        'this pup gotta fly!', 'goggles on!', 'let\'s take to the sky',
        'all clear down here', 'wind sock checked', 'ten-hup!'
      ],
      love: ['yip <3', 'best co-pilot ever', '*tail wag intensifies*'],
      jump: ['up, up and away!', 'loop-de-loop!', 'flying high!'],
      scroll: ['dive! dive!', 'descending, over', 'on final approach']
    },
    xbuddy: {
      idle: [
        'xx', 'staring into the void. hi.', 'art is pain, roughly',
        '4 eyes, 0 thoughts', 'grey is a mood', 'existing'
      ],
      love: ['xx <3 xx', 'four-eyed affection', 'you + me + void'],
      jump: ['h o p', 'ascending', 'yeet (stoic)'],
      scroll: ['descending into the void', 'down we go, expressionless']
    },
    sunflower: {
      idle: [
        'photosynthesis o clock', 'facing the light', 'seeds, seeds, seeds',
        'tall and sunny', 'bee magnet', 'growing, slowly'
      ],
      love: ['sun <3', 'you are my sunshine', '*petal flutter*'],
      jump: ['petal power!', 'reaching for the sun!', 'sprout!'],
      scroll: ['turning to face the screen', 'following the light down']
    },
    elephant: {
      idle: [
        'never forgets', 'big ears, good listener', 'trunk stuff',
        'peanuts?', 'i remember that tab', 'dust bath later'
      ],
      love: ['trunk hug <3', 'you are remembered', '*gentle trumpet*'],
      jump: ['trumpet!', 'heavy landing!', 'up we lumber!'],
      scroll: ['packing the trunk', 'trumpeting downwards']
    },
    duck: {
      idle: [
        'bello!', 'so yellow', 'buddies?', 'goggle check', 'hehehe',
        'banana?', 'overalls day'
      ],
      love: ['buddy <3', 'you are my buddy', '*happy wiggle*'],
      jump: ['wheee!', 'boing!', 'up up up!'],
      scroll: ['going down', 'wheeeeee', 'following along']
    },
    cat: {
      /* Oyen: ginger, heavy-lidded, completely unimpressed. */
      idle: [
        'oyen oyen', 'feed me. now.', 'i was asleep, you know',
        'monday again? pass', 'this is my spot', 'do not perceive me',
        'five more minutes', 'unimpressed, always'
      ],
      love: ['fine. i like you.', 'you may pet me', 'purr… allegedly',
             '*slow blink*'],
      jump: ['mrrow!', 'hey! i was napping', 'oyen oyen!'],
      scroll: ['fine, i will ride', 'taking me with you?', 'lazy elevator'],
      action: ['big stretch', 'yaaawn…', '*stretch*', 'okay. nap time.',
               'that is all i had']
    },
    scout: {
      /* Scout Pup: cheerful beagle troop leader, permanently prepared. */
      idle: [
        'be prepared', 'on patrol', 'trail looks clear', "scout's honour",
        'did someone say snacks?', 'campfire later?',
        'good deed of the day: done', 'steady paws, steady pace'
      ],
      love: ['you are my best pal', "scout's honour <3", '*tail wag*',
             'buddy system!'],
      jump: ['hop to it!', 'onward!', "scout's pace!"],
      scroll: ['downhill trail', 'steady descent, scout', 'following the map'],
      action: ['salute!', 'at your service', 'reporting for duty',
               "scout's honour!"]
    },
    melon: {
      /* Watermelon: one cool customer. */
      idle: [
        'stay cool', 'juicy', 'seedless and thriving', 'slice of life',
        'in my rind', 'water you doing?', 'summer body, all year',
        'spitting seeds is cardio'
      ],
      love: ['you are so sweet', 'my favourite slice', '*seedy blush*',
             'juicy crush'],
      jump: ['splish!', 'juicy hop!', 'seeds away!'],
      scroll: ['rolling downhill', 'juicy descent', 'wheee, rind and shine'],
      action: ['seeds away!', 'ptooey!', 'spit take!', 'fruity fire!']
    }
  };

  /* A character's lines shadow the shared bank for the keys it defines. */
  PB_SPEECH.linesFor = function (character) {
    var ov = CHARACTER_LINES[character];
    if (!ov) return LINES;
    var merged = {};
    for (var k in LINES) merged[k] = LINES[k];
    for (var k2 in ov) merged[k2] = ov[k2];
    return merged;
  };
  PB_SPEECH.characterLines = CHARACTER_LINES;

  PB_SPEECH.lines = LINES;

  /* Pick a random line from a bank. */
  PB_SPEECH.pick = function (bank, character) {
    var banks = character ? PB_SPEECH.linesFor(character) : LINES;
    var arr = banks[bank] || banks.idle;
    return arr[Math.floor(Math.random() * arr.length)];
  };

  /* ---- bubble palettes (popup theme setting) ---- */
  var BUBBLE_PALETTES = {
    dark: {
      bg: 'rgba(22,33,59,0.92)',
      text: '#eef6ff',
      shadow: '0 4px 14px rgba(10,20,40,0.35)',
      border: ''
    },
    light: {
      bg: 'rgba(255,255,255,0.97)',
      text: '#1b2233',
      shadow: '0 4px 14px rgba(20,30,60,0.18)',
      border: 'border:1px solid rgba(20,30,60,0.10);'
    }
  };

  /* Resolve 'system' against prefers-color-scheme.  Falls back to dark when
     matchMedia is unavailable (older browsers, and the headless test sandbox). */
  PB_SPEECH.resolveTheme = function (pref) {
    if (pref === 'light' || pref === 'dark') return pref;
    try {
      if (global.matchMedia &&
          global.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
      }
    } catch (e) { /* no matchMedia */ }
    return 'dark';
  };

  /* ---- bubble element ---- */
  function SpeechBubble(opts) {
    opts = opts || {};
    this.parent = opts.parent;      // the bot element (position:fixed)
    this.offsetX = opts.offsetX || 0;
    this.offsetY = opts.offsetY || 0;
    this.duration = opts.duration || 2600;
    this.text = opts.text || 'beep';
    this.theme = PB_SPEECH.resolveTheme(opts.theme);
    this.el = null;
    this._content = null;
    this._onResize = null;    // kept on the instance so hide() can unbind it
    this._typeIv = null;      // typewriter interval
    this._dismissT = null;    // auto-dismiss timer
    this._closing = false;
  }

  SpeechBubble.prototype.show = function () {
    var self = this;
    if (!this.parent) return;
    var pal = BUBBLE_PALETTES[this.theme] || BUBBLE_PALETTES.dark;
    var el = document.createElement('div');
    el.className = 'pbc-bubble';
    el.style.cssText =
      'position:fixed;z-index:2147483647;pointer-events:none;' +
      'max-width:190px;padding:8px 11px;border-radius:12px;' +
      'background:' + pal.bg + ';color:' + pal.text + ';' +
      pal.border +
      'font:12px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
      'box-shadow:' + pal.shadow + ';' +
      'opacity:0;transform:translateY(4px);transition:opacity .18s ease,' +
      'transform .18s ease;will-change:transform;' +
      'white-space:pre-wrap;word-break:break-word;';
    /* tail */
    var tail = document.createElement('div');
    tail.style.cssText =
      'position:absolute;left:18px;top:100%;width:0;height:0;' +
      'border:6px solid transparent;border-top-color:' + pal.bg + ';' +
      'border-bottom:none;';
    el.appendChild(tail);

    var content = document.createElement('span');
    content.textContent = '';
    el.appendChild(content);
    this.el = el;
    this._content = content;
    document.body.appendChild(el);

    /* position above the bot */
    this.reposition();
    /* Named, and stored on the instance: the anonymous closure this used to
       be could never be unbound, so every bubble ever shown left one live
       'resize' listener on the page's window for the lifetime of the tab
       (the ambient speaker alone makes one every 9-25 seconds). */
    this._onResize = function () { self.reposition(); };
    window.addEventListener('resize', this._onResize);

    /* fade in */
    requestAnimationFrame(function () {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });

    this._type(this.text);

    /* auto-dismiss */
    this._dismissT = setTimeout(function () {
      self._dismissT = null;
      self.hide();
    }, this.duration + 500);
    return this;
  };

  SpeechBubble.prototype.reposition = function () {
    if (!this.el || !this.parent) return;
    var pr = this.parent.getBoundingClientRect();
    var bw = this.el.offsetWidth;
    var bh = this.el.offsetHeight;
    var x = pr.left + pr.width / 2 - bw / 2 + this.offsetX;
    x = Math.max(6, Math.min(x, window.innerWidth - bw - 6));
    var y = pr.top - bh - 8 + this.offsetY;
    if (y < 6) y = pr.bottom + 8; // flip below if no room
    this.el.style.left = Math.round(x) + 'px';
    this.el.style.top = Math.round(y) + 'px';
  };

  /* Typewriter effect. */
  SpeechBubble.prototype._type = function (text) {
    var self = this;
    var i = 0;
    var caret = document.createElement('span');
    caret.textContent = '▍';
    caret.style.opacity = '0.85';
    this.el.appendChild(caret);
    var iv = setInterval(function () {
      i += 1;
      if (!self._content) {           // hidden mid-word: stop typing
        clearInterval(iv);
        self._typeIv = null;
        return;
      }
      if (i <= text.length) {
        self._content.textContent = text.slice(0, i);
      } else {
        clearInterval(iv);
        self._typeIv = null;
        caret.style.opacity = '0';
        setTimeout(function () { if (caret.parentNode) caret.parentNode.removeChild(caret); }, 300);
      }
    }, 28);
    this._typeIv = iv;
  };

  SpeechBubble.prototype.hide = function () {
    var self = this;
    if (!this.el || this._closing) return;
    this._closing = true;
    /* Unhook the three things that outlive the element otherwise: the resize
       listener (forever), the typewriter interval (up to a second), and the
       auto-dismiss timer (up to the full duration). */
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
      this._onResize = null;
    }
    if (this._typeIv !== null) { clearInterval(this._typeIv); this._typeIv = null; }
    if (this._dismissT !== null) { clearTimeout(this._dismissT); this._dismissT = null; }
    this._content = null;
    this.el.style.opacity = '0';
    this.el.style.transform = 'translateY(4px)';
    setTimeout(function () {
      if (self.el && self.el.parentNode) self.el.parentNode.removeChild(self.el);
      self.el = null;
    }, 200);
  };

  PB_SPEECH.SpeechBubble = SpeechBubble;

  global.PB_SPEECH = PB_SPEECH;
})(typeof globalThis !== 'undefined' ? globalThis : this);