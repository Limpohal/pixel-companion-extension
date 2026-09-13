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

  /* ---- bubble element ---- */
  function SpeechBubble(opts) {
    opts = opts || {};
    this.parent = opts.parent;      // the bot element (position:fixed)
    this.offsetX = opts.offsetX || 0;
    this.offsetY = opts.offsetY || 0;
    this.duration = opts.duration || 2600;
    this.text = opts.text || 'beep';
    this.el = null;
  }

  SpeechBubble.prototype.show = function () {
    var self = this;
    if (!this.parent) return;
    var el = document.createElement('div');
    el.className = 'pbc-bubble';
    el.style.cssText =
      'position:fixed;z-index:2147483647;pointer-events:none;' +
      'max-width:190px;padding:8px 11px;border-radius:12px;' +
      'background:rgba(22,33,59,0.92);color:#eef6ff;' +
      'font:12px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
      'box-shadow:0 4px 14px rgba(10,20,40,0.35);' +
      'opacity:0;transform:translateY(4px);transition:opacity .18s ease,' +
      'transform .18s ease;will-change:transform;' +
      'white-space:pre-wrap;word-break:break-word;';
    /* tail */
    var tail = document.createElement('div');
    tail.style.cssText =
      'position:absolute;left:18px;top:100%;width:0;height:0;' +
      'border:6px solid transparent;border-top-color:rgba(22,33,59,0.92);' +
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
    window.addEventListener('resize', function () { self.reposition(); });

    /* fade in */
    requestAnimationFrame(function () {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });

    this._type(this.text);

    /* auto-dismiss */
    setTimeout(function () {
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
      if (i <= text.length) {
        self._content.textContent = text.slice(0, i);
      } else {
        clearInterval(iv);
        caret.style.opacity = '0';
        setTimeout(function () { if (caret.parentNode) caret.parentNode.removeChild(caret); }, 300);
      }
    }, 28);
  };

  SpeechBubble.prototype.hide = function () {
    var self = this;
    if (!this.el) return;
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