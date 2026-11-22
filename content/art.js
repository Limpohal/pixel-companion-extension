/*
 * art.js — pure pixel-art renderer for the Pixel Companion.
 *
 * DOM-free on purpose: `PBArt.draw` works against ANY object that implements
 *   fillRect(x, y, w, h, color)
 * so we can render to a real <canvas>, to a fake recorder in Node for ASCII
 * previews, and to the popup preview. All coordinates live in the internal
 * 64x64 grid; callers scale the canvas up to display size.
 *
 * Skins: 'bot' | 'snowman' | 'shark' | 'capy'  (terrarium crew)
 */
(function (global) {
  'use strict';

  var GRID = 64;

  /* ------------------------------------------------------------------ *
   * Base palette (the original aqua bot)
   * ------------------------------------------------------------------ */
  var C = {
    body:    '#3ec1d3',   // aqua chassis
    bodyDk:  '#2a9db0',   // shaded chassis
    panel:   '#fffdf2',   // face screen
    eye:     '#16213b',
    cheek:   '#ffb3a0',
    foot:    '#ffd166',
    footDk:  '#c78f2e',
    orb:     '#ff6b6b',
    orbGlow: '#ffb3b3',
    outlineSoft: 'rgba(22,33,59,0.28)'
  };

  /* ------------------------------------------------------------------ *
   * Eye shapes: lists of [dx, dy] pixels relative to the eye origin.
   * ------------------------------------------------------------------ */
  var EYES = {
    normal: [
      [1,0],[2,0],[3,0],[4,0],
      [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],
      [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],
      [0,3],[1,3],[2,3],[3,3],[4,3],[5,3],
      [1,4],[2,4],[3,4],[4,4]
    ],
    blink: [
      [0,0],[1,0],[2,0],[3,0],[4,0],[5,0],
      [1,1],[2,1],[3,1],[4,1]
    ],
    happy: [
      [2,0],[3,0],
      [1,1],[4,1],
      [0,2],[5,2],
      [0,3],[5,3]
    ],
    surprise: [
      [2,0],[3,0],[4,0],
      [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],
      [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],
      [0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],
      [0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],
      [2,5],[3,5],[4,5]
    ],
    love: [
      [1,0],[2,0],[3,0],[4,0],
      [0,1],[5,1],
      [0,2],[5,2],
      [1,3],[2,3],[3,3],[4,3]
    ]
  };

  /* Small dot eyes (capybara): 4x4 variants keyed the same way. */
  var EYES_SMALL = {
    normal: [
      [0,0],[1,0],[0,1],[1,1]
    ],
    blink: [
      [0,0],[1,0]
    ],
    happy: [
      [0,1],[1,0],[2,1]
    ],
    surprise: [
      [0,0],[1,0],[0,1],[1,1],[0,2],[1,2]
    ],
    love: [
      [0,0],[1,0],[0,1],[1,1]
    ]
  };

  /* One big shiny eye for the newer characters: an 8x8 dark mass, with a
     2x2 glint and a 1x1 sparkle painted on top by each skin (the shared eye
     step can only draw a single colour).  Size is the whole point — at the
     picker's 44px a small pupil vanishes completely and the face reads as a
     blob with two specks. */
  var CUTE_EYES = {
    normal: [
      [2,0],[3,0],[4,0],[5,0],
      [1,1],[2,1],[3,1],[4,1],[5,1],[6,1],
      [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],
      [0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],
      [0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],
      [0,5],[1,5],[2,5],[3,5],[4,5],[5,5],[6,5],[7,5],
      [1,6],[2,6],[3,6],[4,6],[5,6],[6,6],
      [2,7],[3,7],[4,7],[5,7]
    ],
    blink: [
      [0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],
      [1,1],[2,1],[3,1],[4,1],[5,1],[6,1]
    ],
    happy: [
      [2,0],[3,0],[4,0],[5,0],
      [1,1],[6,1],
      [0,2],[7,2]
    ],
    surprise: [
      [2,0],[3,0],[4,0],[5,0],
      [1,1],[2,1],[3,1],[4,1],[5,1],[6,1],
      [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],
      [0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],
      [0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],
      [0,5],[1,5],[2,5],[3,5],[4,5],[5,5],[6,5],[7,5],
      [0,6],[1,6],[2,6],[3,6],[4,6],[5,6],[6,6],[7,6],
      [1,7],[2,7],[3,7],[4,7],[5,7],[6,7],
      [2,8],[3,8],[4,8],[5,8]
    ],
    love: [
      [1,0],[2,0],[5,0],[6,0],
      [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],
      [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],
      [0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],
      [1,4],[2,4],[3,4],[4,4],[5,4],[6,4],
      [2,5],[3,5],[4,5],[5,5]
    ]
  };

  /* Closed, content eyes for Scout Pup (option "closed happy"): soft arcs at
     rest, a short line on blink, and an open oval only when startled — so the
     resting face never stares.  Seven-pixel footprint, so the eye anchors stay
     symmetric around the sprite axis. */
  var HAPPY_EYES = {
    normal: [
      [2,1],[3,1],[4,1],[1,2],[5,2]
    ],
    blink: [
      [2,2],[3,2],[4,2]
    ],
    happy: [
      [2,1],[3,1],[4,1],[1,2],[5,2]
    ],
    surprise: [
      [2,0],[3,0],[4,0],
      [1,1],[2,1],[3,1],[4,1],[5,1],
      [1,2],[2,2],[3,2],[4,2],[5,2],
      [1,3],[2,3],[3,3],[4,3],[5,3],
      [2,4],[3,4],[4,4]
    ],
    love: [
      [2,1],[3,1],[4,1],[1,2],[5,2]
    ]
  };

  /* Mouth shapes relative to the mouth origin. */
  var MOUTHS = {
    normal: [
      [0,0],[1,0],[2,0],[3,0],[4,0],[5,0]
    ],
    smile: [
      [0,0],[1,0],[4,0],[5,0],
      [1,1],[2,1],[3,1],[4,1]
    ],
    o: [
      [0,0],[1,0],[2,0],[3,0],[4,0],[5,0],
      [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],
      [0,2],[1,2],[2,2],[3,2],[4,2],[5,2]
    ]
  };

  /* ------------------------------------------------------------------ *
   * Geometry constants (64x64 grid)
   * ------------------------------------------------------------------ */
  var G = {
    bodyX: 8,  bodyY: 12, bodyW: 48, bodyH: 38,   // capsule x 8..55, y 12..49
    corner: 6,
    feetY: 50, feetH: 6,                          // feet y 50..55
    footLX: 16, footRX: 42, footW: 6,
    armY: 24,
    panelX: 20, panelY: 20, panelW: 24, panelH: 19, // screen x 20..43, y 20..38
    eyeY: 24,                                     // eye origin y
    eye1X: 24, eye2X: 38,                         // eye origins (both 6 wide)
    mouthX: 29, mouthY: 35,                       // mouth origin (6 wide)
    cheek1: [12, 30], cheek2: [50, 30],           // 2x3 blush pixels
    antX: 30, antTop: 3, antStemH: 9,             // antenna stem x 30..33
    orbX: 27, orbY: 0, orbW: 9, orbH: 6,          // antenna orb
    shadowY: 58, shadowW: 34, shadowH: 4
  };

  /* ------------------------------------------------------------------ *
   * Skins — the terrarium crew.
   * Each skin overrides palette bits + geometry flags, and can hook the
   * draw pipeline with extras(ctx, by, opts) callbacks.
   * ------------------------------------------------------------------ */
  var SKINS = {
    bot: {
      label: 'Beep Bot',
      col: { body: C.body, bodyDk: C.bodyDk, eye: C.eye, cheek: C.cheek,
             foot: C.foot, footDk: C.footDk, mouth: C.eye },
      feet: true, antenna: true, panel: true,
      eyes: EYES, eyeW: 6,
      cheekFaces: { happy: 1, love: 1 }
    },

    snowman: {
      label: 'Snowman',
      col: { body: '#fdfdf7', bodyDk: '#d8dbe2', eye: '#2b2b33', cheek: '#ffb9a8',
             foot: '#fdfdf7', footDk: '#d8dbe2', mouth: '#e2543a', nose: '#f2913d' },
      feet: false, antenna: false, panel: false,
      eyes: EYES, eyeW: 6,
      eyeY: 26, eye1X: 24, eye2X: 38,
      mouthY: 36,
      cheekFaces: { happy: 1, love: 1, normal: 1 },
      extraUnder: function (ctx, by) {
        /* snow base: soften the capsule bottom so it reads as round */
        rect(ctx, G.bodyX + 4, by + G.bodyH - 6, G.bodyW - 8, 5, '#ffffff');
      },
      extraOver: function (ctx, by, opts) {
        var dy = by - G.bodyY;
        /* red scarf */
        rect(ctx, G.bodyX + 4, by + 2, G.bodyW - 8, 5, '#d8402f');
        rect(ctx, G.bodyX + 6, by + 2, G.bodyW - 12, 2, '#f0604c');
        rect(ctx, G.bodyX + 10, by + 7, 5, 9, '#d8402f');   // scarf tail
        rect(ctx, G.bodyX + 10, by + 14, 5, 2, '#a82e22');
        /* santa hat: band + cone + star */
        var hx = 22, hy = 4 + dy;
        rect(ctx, hx, hy + 8, 20, 4, '#ffffff');            // white trim
        rect(ctx, hx + 2, hy + 4, 16, 4, '#d8402f');        // brim
        rect(ctx, hx + 5, hy, 10, 4, '#d8402f');            // cone
        rect(ctx, hx + 8, hy - 2, 5, 2, '#d8402f');         // cone tip
        rect(ctx, hx + 8, hy - 4, 3, 3, '#ffd84d');         // star
        rect(ctx, hx + 9, hy - 6, 1, 2, '#ffd84d');
        /* carrot nose (replaces mouth) */
        rect(ctx, 31, 36 + dy, 6, 2, '#f2913d');
        rect(ctx, 33, 38 + dy, 4, 2, '#e0762a');
        rect(ctx, 35, 40 + dy, 2, 1, '#c9641f');
      }
    },

    shark: {
      label: 'Baby Shark',
      col: { body: '#a9dff2', bodyDk: '#7fbfdd', eye: '#241f26', cheek: '#f2b8c0',
             foot: '#a9dff2', footDk: '#7fbfdd', mouth: '#e2778a' },
      feet: true, antenna: false, panel: false,
      customFace: true,          // costume: face lives inside the mouth
      eyes: EYES, eyeW: 6,
      defaultFace: 'happy',
      cheekFaces: {},
      /* The whole costume face is drawn in one hook:
         snout point, bead eyes, open mouth w/ scalloped teeth,
         and the cat face peeking out from inside. */
      face: function (ctx, by, face, opts) {
        var dy = by - G.bodyY;
        var dark = '#8a9bb5';          // mouth interior (light slate)
        var tooth = '#eef1f5';
        var toothHi = '#f8fafc';
        var ink = '#2a2530';
        var pink = '#e2778a';
        var blush = '#f2b8c0';

        /* ---- pointed snout above the dome (merged into body) ---- */
        rect(ctx, 29, 3 + dy, 6, 2, '#bfe8f7');
        rect(ctx, 28, 5 + dy, 8, 2, '#bfe8f7');
        rect(ctx, 26, 7 + dy, 12, 6, '#a9dff2');      // runs into the dome
        rect(ctx, 24, 10 + dy, 16, 3, '#a9dff2');     // dome-ward flare
        rect(ctx, 37, 5 + dy, 1, 7, '#7fbfdd');       // snout shade edge

        /* ---- shark bead eyes (on the hood, always open) ---- */
        rect(ctx, 14, 14 + dy, 5, 5, ink);
        rect(ctx, 15, 15 + dy, 2, 2, '#ffffff');      // shine
        rect(ctx, 45, 14 + dy, 5, 5, ink);
        rect(ctx, 46, 15 + dy, 2, 2, '#ffffff');

        /* ---- big open mouth: dark interior + lip ring ---- */
        rect(ctx, 11, 21 + dy, 42, 26, '#7fbfdd');    // lip ring
        rect(ctx, 13, 23 + dy, 38, 22, dark);

        /* ---- scalloped teeth: top + bottom rows ---- */
        var tx = [15, 21, 27, 33, 39, 45];
        for (var i = 0; i < tx.length; i++) {
          rect(ctx, tx[i], 24 + dy, 4, 3, tooth);
          rect(ctx, tx[i] + 1, 23 + dy, 2, 1, toothHi);
          rect(ctx, tx[i], 40 + dy, 4, 3, tooth);
          rect(ctx, tx[i] + 1, 43 + dy, 2, 1, toothHi);
        }

        /* ---- the cat face peeking out ---- */
        if (face === 'surprise') {
          /* wide-open round eyes + little o mouth */
          rect(ctx, 22, 28 + dy, 5, 5, '#fdfdfd');
          rect(ctx, 24, 30 + dy, 2, 2, ink);
          rect(ctx, 38, 28 + dy, 5, 5, '#fdfdfd');
          rect(ctx, 40, 30 + dy, 2, 2, ink);
          rect(ctx, 30, 34 + dy, 4, 3, pink);
          rect(ctx, 31, 37 + dy, 2, 1, pink);
          rect(ctx, 18, 33 + dy, 3, 2, blush);
          rect(ctx, 44, 33 + dy, 3, 2, blush);
        } else {
          /* closed happy arcs (normal / blink / happy / love) */
          var arc = [[1, 0], [2, 0], [0, 1], [3, 1], [4, 1], [1, 2], [3, 2]];
          var ex;
          for (var a = 0; a < arc.length; a++) {
            ex = arc[a];
            rect(ctx, 21 + ex[0], 29 + dy + ex[1], 1, 1, ink);
            rect(ctx, 38 + ex[0], 29 + dy + ex[1], 1, 1, ink);
          }
          /* :3 mouth — wider when happy/love */
          var w = (face === 'happy' || face === 'love') ? [0, 1, 2, 3, 4, 5, 6]
                                                        : [0, 1, 2, 3, 4];
          for (var m = 0; m < w.length; m++) {
            var down = (m % 2 === 1) ? 1 : 0;
            rect(ctx, 30 - Math.floor(w.length / 2) + m,
                 35 + dy + down, 1, 2, pink);
          }
          /* blush — bigger for love */
          var b = (face === 'love') ? 4 : 3;
          rect(ctx, 18, 33 + dy, b, 2, blush);
          rect(ctx, 46 - b, 33 + dy, b, 2, blush);
          if (face === 'love') {
            /* tiny heart on the right cheek */
            rect(ctx, 44, 27 + dy, 1, 1, '#f26d8d');
            rect(ctx, 46, 27 + dy, 1, 1, '#f26d8d');
            rect(ctx, 44, 28 + dy, 3, 1, '#f26d8d');
            rect(ctx, 45, 29 + dy, 1, 1, '#f26d8d');
          }
        }
      }
    },

    capy: {
      label: 'Capybara',
      col: { body: '#b5793c', bodyDk: '#8f5c2a', eye: '#3a2a1a', cheek: '#e0a06a',
             foot: '#8f5c2a', footDk: '#6e4620', mouth: '#3a2a1a' },
      feet: true, antenna: false, panel: false,
      eyes: EYES_SMALL, eyeW: 4,
      eyeY: 26, eye1X: 24, eye2X: 38,
      mouthY: 32,        // above the Y-nose, which is drawn over the face later
      cheekFaces: { happy: 1, love: 1 },
      extraUnder: function (ctx, by) {
        /* muzzle patch */
        roundedRect(ctx, 22, by + 18, 20, 14, 5, '#d9a86c');
        rect(ctx, 24, by + 20, 16, 3, '#e6bd85');           // muzzle shine
      },
      extraOver: function (ctx, by, opts) {
        var dy = by - G.bodyY;
        /* the Y nose: two nostril dots + stem */
        var nx = 30, ny = 34 + dy;
        rect(ctx, nx, ny, 4, 4, '#3a2a1a');                 // nose block
        rect(ctx, nx + 1, ny - 1, 2, 1, '#3a2a1a');
        rect(ctx, nx + 1, ny + 4, 2, 4, '#3a2a1a');         // stem down
        rect(ctx, nx, ny + 1, 1, 2, '#5a4430');             // nostril lights
        rect(ctx, nx + 3, ny + 1, 1, 2, '#5a4430');
        /* leaf hat: wide green leaf, tilted */
        var hx = 18, hy = 2 + dy;
        rect(ctx, hx, hy + 6, 28, 4, '#4f9e3d');            // leaf body
        rect(ctx, hx + 4, hy + 2, 20, 4, '#5cb548');        // upper leaf
        rect(ctx, hx + 10, hy, 8, 2, '#5cb548');            // tip
        rect(ctx, hx + 2, hy + 8, 24, 2, '#3d7d30');        // under-shade
        rect(ctx, hx + 14, hy + 1, 2, 8, '#2f6b26');        // midrib
        rect(ctx, hx + 26, hy + 6, 4, 4, '#4f9e3d');        // brim tip
        /* ears */
        rect(ctx, G.bodyX + 2, by + 2, 4, 3, '#8f5c2a');
        rect(ctx, G.bodyX + G.bodyW - 6, by + 2, 4, 3, '#8f5c2a');
      }
    },

    koala: {
      label: 'Koala',
      col: { body: '#a9b7c4', bodyDk: '#8b99a8', eye: '#2b2b33', cheek: '#f2a8b4',
             foot: '#8b99a8', footDk: '#6d7a89', mouth: '#3a3f47' },
      feet: true, antenna: false, panel: false,
      eyes: EYES, eyeW: 6,
      eyeY: 19, eye1X: 24, eye2X: 34,
      mouthY: 43,
      cheekFaces: { happy: 1, love: 1 },
      extraBehind: function (ctx, by) {
        /* Two big round fluffy ears sitting ON TOP of the head — the koala's
           single most recognisable feature.  Drawn behind the body so they
           read as ears rather than side handles. */
        roundedRect(ctx, 3, by - 11, 19, 19, 8, '#8b99a8');    // left ear
        roundedRect(ctx, 42, by - 11, 19, 19, 8, '#8b99a8');   // right ear
        roundedRect(ctx, 7, by - 7, 11, 11, 5, '#efe9df');     // cream inner
        roundedRect(ctx, 46, by - 7, 11, 11, 5, '#efe9df');
        rect(ctx, 2, by - 5, 3, 6, '#e3e8ee');                 // fluffy tufts
        rect(ctx, 59, by - 5, 3, 6, '#e3e8ee');
      },
      extraUnder: function (ctx, by) {
        /* the big dark oval nose — koalas are mostly nose */
        roundedRect(ctx, 26, 27, 12, 15, 5, '#3a3f47');
        rect(ctx, 28, 29, 3, 2, '#5a616b');                    // shine
        rect(ctx, 27, 39, 4, 1, '#2b2f36');                    // nostril shading
        rect(ctx, 33, 39, 4, 1, '#2b2f36');
      },
      extraOver: function (ctx, by, opts) {
        /* eucalyptus sprig lying across the crown */
        rect(ctx, 30, by - 9, 2, 9, '#4f8f3f');                // stem
        roundedRect(ctx, 23, by - 7, 9, 5, 2, '#7ec25f');
        roundedRect(ctx, 32, by - 8, 9, 5, 2, '#7ec25f');
        roundedRect(ctx, 28, by - 11, 8, 5, 3, '#93d473');
      }
    },

    panda: {
      label: 'Panda',
      col: { body: '#fbfcfd', bodyDk: '#e3e9ef', eye: '#2b313b', cheek: '#f7b8c8',
             foot: '#2b313b', footDk: '#1c222b', mouth: '#2b313b',
             arm: '#2b313b', armDk: '#1c222b' },
      feet: true, antenna: false, panel: false,
      customBody: true,
      customFace: true,
      /* the moves he breaks into on his own (see behaviors.js) */
      actions: ['punch', 'bounce', 'crane'],
      /* Silhouette half-width for a row, dy measured from `by`.  A head ellipse
         blended into a wider belly ellipse, so the union is one smooth pear:
         no seam where the head meets the body and no stacked-box outline.
         The shorts and sash are measured from this too, so clothing can never
         end up wider than he is. */
      hw: function (dy) {
        var head = 1 - Math.pow((dy - 9) / 15, 2);
        var belly = 1 - Math.pow((dy - 22) / 17, 2);
        var h = head > 0 ? 18 * Math.sqrt(head) : 0;
        var b = belly > 0 ? 22 * Math.sqrt(belly) : 0;
        return Math.round(Math.max(h, b));
      },
      body: function (ctx, by) {
        var fill = '#fbfcfd', shade = '#e3e9ef';
        /* Each row carries a 2px shaded right edge.  The old body was flat
           white with no shading at all, so on a light page it had no visible
           edge — the single biggest reason it looked unfinished. */
        for (var dy = -6; dy <= 38; dy++) {
          var w = this.hw(dy);
          if (!w) continue;
          rect(ctx, 32 - w, by + dy, w * 2, 1, fill);
          rect(ctx, 32 + w - 2, by + dy, 2, 1, shade);
        }
      },
      /* stance-aware legs: wide when fighting, one knee up for the crane.
         They start at y46 so they emerge from the shorts hem.  The right leg
         is derived from the left (64 - x - w) — it used to be hard-coded at
         x37, which put the pair 1.5px off centre. */
      drawLegs: function (ctx, swing, col, by, opts) {
        var ink = '#2b313b', gloss = '#414a57';
        var arm = (opts && opts.arm) || 'down';
        if (arm === 'crane') {
          roundedRect(ctx, 12, by + 34, 14, 10, 4, ink);     // planted leg
          roundedRect(ctx, 34, by + 22, 17, 8, 4, ink);      // lifted knee
          rect(ctx, 14, by + 38, 10, 1, gloss);              // toe line
          return;
        }
        var wide = (arm === 'guard' || arm === 'punchA' || arm === 'punchB');
        var l1 = Math.round(swing * 2), l2 = Math.round(-swing * 2);
        var x1 = wide ? 8 : 12, x2 = 64 - x1 - 14;
        roundedRect(ctx, x1 + l1, by + 34, 14, 10, 4, ink);
        roundedRect(ctx, x2 + l2, by + 34, 14, 10, 4, ink);
        /* toe creases instead of the big pale pads, which read as clogs */
        rect(ctx, x1 + 3 + l1, by + 39, 3, 1, gloss);
        rect(ctx, x1 + 9 + l1, by + 39, 3, 1, gloss);
        rect(ctx, x2 + 3 + l2, by + 39, 3, 1, gloss);
        rect(ctx, x2 + 9 + l2, by + 39, 3, 1, gloss);
      },
      extraBehind: function (ctx, by) {
        /* Big round ears on the crown, with a soft inner shade — small square
           ears were one of the things that read as "unfinished". */
        roundedRect(ctx, 17, by - 9, 13, 13, 6, '#2b313b');
        roundedRect(ctx, 34, by - 9, 13, 13, 6, '#2b313b');
        roundedRect(ctx, 20, by - 6, 7, 7, 3, '#414a57');
        roundedRect(ctx, 37, by - 6, 7, 7, 3, '#414a57');
      },
      extraUnder: function (ctx, by) {
        /* Soft muzzle first, so the patches are not sliced off by a straight
           line across their lower edge.  Rounded, not rectangular — a
           rectangle there read as surgical tape across the face. */
        roundedRect(ctx, 22, by + 11, 18, 12, 6, '#eef2f6');
        /* One BOLD patch per eye: a solid teardrop, 14px at its widest, drawn
           row by row so its outline is continuous.  Angles down and out, and no
           row crosses x28 so a 6px white bridge stays between the pair.
           This is the panda's signature — at 10px they read as thin rims
           around the eyes, which looked like spectacles rather than patches. */
        var rows = [
          [3, 19, 8], [4, 17, 11], [5, 16, 12], [6, 15, 13], [7, 15, 14],
          [8, 15, 14], [9, 15, 14], [10, 15, 13], [11, 16, 12], [12, 17, 10],
          [13, 19, 7], [14, 21, 4]
        ];
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          rect(ctx, r[1], by + r[0], r[2], 1, '#2b313b');
          rect(ctx, 64 - r[1] - r[2], by + r[0], r[2], 1, '#2b313b');
        }
      },
      extraBack: function (ctx, by, opts) {
        /* bamboo staff.  The resting arms used to be drawn here, which put them
           BEHIND the shorts — the clothing then swallowed his paws.  They are
           drawn in extraOver now, on top of the clothing. */
        rect(ctx, 54, by + 2, 3, 30, '#7cc45e');
        rect(ctx, 54, by + 9, 3, 1, '#5a9e4a');
        rect(ctx, 54, by + 16, 3, 1, '#5a9e4a');
        rect(ctx, 54, by + 23, 3, 1, '#5a9e4a');
        roundedRect(ctx, 49, by - 1, 8, 4, 2, '#6dbb5a');
        roundedRect(ctx, 55, by + 1, 7, 4, 2, '#6dbb5a');
      },
      /* Po-style eyes: cream sclera, a green iris, a dark pupil and a highlight.
         A plain white disc with nothing inside it reads as a glowing empty
         socket — which is exactly what a ghost looks like.  It is the PUPIL
         that makes an eye alive: something to focus with.  One pixel of iris
         ring plus one pixel of sclera is enough at this size. */
      face: function (ctx, by, faceLike, opts) {
        var ink = '#2b313b';
        var sclera = '#fffdf5';
        var pupil = '#171b22';
        var blush = '#f4b8c2';
        /* mid kung-fu he shouts rather than smiles */
        var fighting = (opts.arm === 'guard' || opts.arm === 'punchA' ||
                        opts.arm === 'punchB' || opts.arm === 'crane');
        /* Natural panda eyes: a small dark eye sitting in the patch, not the
           old 7x7 pale disc with a green iris and a 2px pupil.  That big
           eyeball with a pinprick pupil is the "staring" look people called
           unsettling.  Happy/love use a soft closed arc, so the picker and the
           idle animation read friendly rather than wide-eyed. */
        /* Happy/love: the roster's usual closed chevron, drawn warm.
           Anything else: a cream eye with a 3x3 pupil and a glint.  No iris
           ring, no pinprick pupil — that combination was the stare. */
        var eyeHappy = function (x) {
          rect(ctx, x + 2, by + 8, 2, 1, sclera);
          rect(ctx, x + 1, by + 9, 1, 1, sclera);
          rect(ctx, x + 4, by + 9, 1, 1, sclera);
          rect(ctx, x, by + 10, 1, 1, sclera);
          rect(ctx, x + 5, by + 10, 1, 1, sclera);
        };
        if (faceLike === 'blink') {
          rect(ctx, 19, by + 9, 5, 1, sclera);
          rect(ctx, 40, by + 9, 5, 1, sclera);
        } else if (faceLike === 'surprise') {
          /* only a startle pulls the eyes open; even then they stay narrow */
          roundedRect(ctx, 18, by + 5, 7, 7, 3, sclera);
          roundedRect(ctx, 39, by + 5, 7, 7, 3, sclera);
          rect(ctx, 21, by + 8, 1, 2, pupil);
          rect(ctx, 42, by + 8, 1, 2, pupil);
        } else {
          /* Content: the resting panda has soft closed eyes.  Big round eyes
             with small centred pupils read as a stare; closing them for idle,
             happy and love removes that entirely. */
          eyeHappy(19);
          eyeHappy(39);
        }
        /* soft blush on the cheeks */
        if (faceLike !== 'blink') {
          rect(ctx, 16, by + 15, 4, 2, blush);
          rect(ctx, 44, by + 15, 4, 2, blush);
        }
        /* small rounded nose, then a wide friendly smile with room below it */
        roundedRect(ctx, 29, by + 13, 6, 3, 1, ink);
        if (fighting || faceLike === 'surprise') {
          roundedRect(ctx, 28, by + 18, 8, 5, 2, ink);    // shouting
          roundedRect(ctx, 30, by + 20, 4, 2, 1, '#e0708a');
        } else {
          rect(ctx, 26, by + 17, 1, 1, ink);              // upturned corners
          rect(ctx, 37, by + 17, 1, 1, ink);
          rect(ctx, 27, by + 18, 10, 1, ink);
          rect(ctx, 28, by + 19, 8, 1, ink);
          rect(ctx, 30, by + 20, 4, 1, ink);
          rect(ctx, 28, by + 21, 8, 1, '#dce4eb');        // chin shade
        }
      },
      extraOver: function (ctx, by, opts) {
        var cloth = '#8a5a3b', clothDk = '#6f4630';
        var patch1 = '#a06a45';
        var sash = '#e8b83c', sashDk = '#c99b28';
        var dy, w;
        /* Patchwork shorts and a sash, sitting at the waist.  Every row is
           measured from the same silhouette function the body uses, so the
           clothing can never end up wider than he is — the old flat 52-wide
           rectangle hung up to 11px past the belly. */
        for (dy = 26; dy <= 34; dy++) {
          w = this.hw(dy);
          rect(ctx, 32 - w, by + dy, w * 2, 1, cloth);
        }
        w = this.hw(34);
        rect(ctx, 32 - w, by + 34, w * 2, 1, clothDk);        // hem shade
        /* patchwork */
        rect(ctx, 14, by + 28, 7, 3, patch1);
        rect(ctx, 31, by + 29, 6, 3, patch1);
        rect(ctx, 42, by + 28, 7, 3, patch1);
        /* sash band */
        for (dy = 24; dy <= 25; dy++) {
          w = this.hw(dy);
          rect(ctx, 32 - w, by + dy, w * 2, 1, sash);
        }
        w = this.hw(25);
        rect(ctx, 32 - w, by + 25, w * 2, 1, sashDk);
        /* knot and two tails off to the left: a big knot dead centre read as
           the rim of a pot rather than a tied sash */
        roundedRect(ctx, 17, by + 23, 7, 5, 2, sash);
        roundedRect(ctx, 19, by + 24, 3, 2, 1, sashDk);
        rect(ctx, 15, by + 27, 2, 6, sash);
        rect(ctx, 18, by + 28, 2, 5, sashDk);
        /* Resting arms last, so the paws hang IN FRONT of the shorts.  Drawn
           behind them the clothing swallowed his hands.  Only when the arms
           hang: during guard/punch/crane the chassis draws the working arm, and
           these would give him a third one. */
        var armState = (opts && opts.arm) || 'down';
        if (armState === 'down') {
          roundedRect(ctx, 6, by + 15, 11, 18, 5, '#2b313b');
          roundedRect(ctx, 47, by + 15, 11, 18, 5, '#2b313b');
          rect(ctx, 7, by + 17, 2, 14, '#414a57');
          rect(ctx, 48, by + 17, 2, 14, '#414a57');
        }
      }
    },

    butterfly: {
      /* Black-and-yellow mascot butterfly: a chunky yellow body under two big
         soft black wings with yellow spots.  Two wings and no feelers on
         purpose — the old four-winged, antennaed version read as an insect
         rather than a plush. */
      label: 'Butterfly',
      col: { body: '#ffcf3f', bodyDk: '#e0ad1f', eye: '#2a2530',
             cheek: '#f7a8c3', foot: '#2a2530', footDk: '#171420',
             mouth: '#2a2530', arm: '#ffcf3f', armDk: '#e0ad1f' },
      feet: true, antenna: false, panel: false,
      bodyInset: 11,
      eyes: CUTE_EYES, eyeW: 8,
      eyeY: 20, eye1X: 21, eye2X: 35,
      mouthY: 33,
      cheekX: [20, 42], cheekY: 26,
      defaultFace: 'happy',
      cheekFaces: { happy: 1, love: 1, normal: 1 },
      extraBehind: function (ctx, by, opts) {
        var ink = '#2a2530', spot = '#ffd84d';
        var lift = (opts.arm === 'wave') ? 2 : 0;
        /* the wings breathe with the walk cycle */
        var flap = Math.round(Math.sin((opts.phase || 0) * Math.PI * 2) * 1);
        /* Wings start just above the shoulders rather than above the head:
           rising 12px above a round head made them read as ears. */
        var y0 = Math.max(0, by - 4 - lift + flap);
        /* Exactly two wings — one big soft capsule per side.  A yellow rim
           keeps the black panel from reading as a separate blob, and the
           previous four-winged, antennaed version is what read as an insect. */
        /* The wing flares outward toward the bottom (narrow shoulder, wide
           hindwing).  A straight capsule read as an ear beside the round body. */
        roundedRect(ctx, 2, y0, 22, 20, 11, ink);
        roundedRect(ctx, 0, y0 + 14, 24, 28, 12, ink);
        roundedRect(ctx, 40, y0, 22, 20, 11, ink);
        roundedRect(ctx, 40, y0 + 14, 24, 28, 12, ink);
        /* yellow spots: small near the shoulder, a big one on the hindwing */
        roundedRect(ctx, 8, y0 + 5, 5, 5, 2, spot);
        roundedRect(ctx, 51, y0 + 5, 5, 5, 2, spot);
        roundedRect(ctx, 4, y0 + 17, 10, 12, 5, spot);
        roundedRect(ctx, 50, y0 + 17, 10, 12, 5, spot);
        roundedRect(ctx, 8, y0 + 33, 5, 5, 2, spot);
        roundedRect(ctx, 51, y0 + 33, 5, 5, 2, spot);
      },
      extraOver: function (ctx, by, opts) {
        var shine = '#fffdf5';
        /* eye shine, only where an eye is actually open */
        if (opts.face !== 'happy' && opts.face !== 'blink' &&
            opts.face !== 'love') {
          rect(ctx, 23, by + 10, 2, 2, shine);
          rect(ctx, 26, by + 13, 1, 1, shine);
          rect(ctx, 37, by + 10, 2, 2, shine);
          rect(ctx, 40, by + 13, 1, 1, shine);
        }
        /* lift the shared flat mouth into a smile at rest */
        if (opts.mouth !== 'o') {
          rect(ctx, 28, by + 20, 1, 1, '#2a2530');
          rect(ctx, 35, by + 20, 1, 1, '#2a2530');
        }
      }
    },
    skye: {
      label: 'Aviator Pup',
      col: { body: '#f7b8cf', bodyDk: '#e193b4', eye: '#332433', cheek: '#f28ab8',
             foot: '#e193b4', footDk: '#c97a9a', mouth: '#332433' },
      feet: true, antenna: false, panel: false,
      eyes: EYES, eyeW: 6,
      eyeY: 25, eye1X: 24, eye2X: 34,
      mouthY: 41,
      defaultFace: 'happy',
      cheekFaces: { happy: 1, love: 1, normal: 1 },
      extraBehind: function (ctx, by, opts) {
        /* floppy tan ears hanging beside the head */
        roundedRect(ctx, 4, by + 1, 11, 21, 5, '#d9a06b');
        roundedRect(ctx, 6, by + 6, 6, 13, 3, '#bd8449');
        roundedRect(ctx, 49, by + 1, 11, 21, 5, '#d9a06b');
        roundedRect(ctx, 52, by + 6, 6, 13, 3, '#bd8449');
        /* waggy tail */
        var wag = Math.round(Math.sin((opts.phase || 0) * Math.PI * 2) * 2);
        roundedRect(ctx, 51 + wag, by + 26, 9, 6, 3, '#f7b8cf');
      },
      extraUnder: function (ctx, by) {
        /* pale pup muzzle */
        roundedRect(ctx, 22, by + 17, 20, 14, 6, '#fce3ee');
        rect(ctx, 25, by + 20, 5, 2, '#ffffff');
      },
      extraOver: function (ctx, by, opts) {
        /* leather aviator helmet hugging the skull, with side flaps */
        roundedRect(ctx, 13, by - 7, 38, 15, 7, '#e05a9b');
        roundedRect(ctx, 13, by + 4, 8, 11, 3, '#e05a9b');     // left flap
        roundedRect(ctx, 43, by + 4, 8, 11, 3, '#e05a9b');     // right flap
        rect(ctx, 15, by - 5, 8, 2, '#f28ab8');                // shine
        rect(ctx, 13, by + 6, 38, 2, '#c24680');               // brim shade
        /* goggles pushed up on the forehead */
        rect(ctx, 13, by - 1, 38, 3, '#f2d06b');               // strap
        roundedRect(ctx, 22, by - 4, 10, 9, 3, '#f2d06b');
        roundedRect(ctx, 24, by - 2, 6, 5, 2, '#9adcf0');      // lens
        rect(ctx, 25, by - 1, 2, 2, '#d8f2fb');                // lens shine
        roundedRect(ctx, 32, by - 4, 10, 9, 3, '#f2d06b');
        roundedRect(ctx, 34, by - 2, 6, 5, 2, '#9adcf0');
        rect(ctx, 37, by - 1, 2, 2, '#d8f2fb');
        /* pup nose */
        roundedRect(ctx, 29, by + 24, 6, 4, 2, '#4a3340');
      }
    },

    xbuddy: {
      label: 'X-Buddy',
      col: { body: '#b7c1ba', bodyDk: '#9aa69f', eye: '#2b3038', cheek: '#c8b0b4',
             foot: '#dfe4e2', footDk: '#c2c9c6', mouth: '#2b3038',
             arm: '#dfe4e2', armDk: '#c2c9c6' },
      feet: false, antenna: false, panel: false,
      customBody: true,
      customFace: true,
      noArms: true,
      defaultFace: 'normal',
      cheekFaces: {},
      /* The art-figure build from the reference: one big rounded skull carrying
         two lobes, a slim tube torso, arms hanging as tubes with pale mittens,
         dark shorts with two pale dots on the hips, and chunky rounded boots.
         All of it is drawn here rather than on the shared chassis — the chassis
         arm anchors are pinned to a wide body and would float away from a
         figure this slim. */
      body: function (ctx, by, opts) {
        var figure = '#b7c1ba', shade = '#9aa69f', light = '#c6cfc9';
        var pale = '#dfe4e2', paleDk = '#c2c9c6';
        var shorts = '#3a4049', dot = '#9aa69f';
        var arm = (opts && opts.arm) || 'down';
        var raised = (arm === 'wave' || arm === 'up');
        /* boots — big and rounded, touching in the middle as in the reference */
        roundedRect(ctx, 21, by + 34, 11, 10, 4, pale);
        roundedRect(ctx, 32, by + 34, 11, 10, 4, pale);
        rect(ctx, 22, by + 42, 9, 1, paleDk);
        rect(ctx, 33, by + 42, 9, 1, paleDk);
        /* legs */
        roundedRect(ctx, 24, by + 29, 6, 15, 3, figure);
        roundedRect(ctx, 34, by + 29, 6, 15, 3, figure);
        /* torso — a slim tube, well narrower than the skull.  The shade stops
           short of the rounded top and bottom rows, where the silhouette has
           already inset and the strip would poke out by a pixel. */
        roundedRect(ctx, 23, by + 12, 18, 15, 5, figure);
        rect(ctx, 39, by + 15, 2, 9, shade);
        /* shorts, with the pale dots on the hips */
        roundedRect(ctx, 20, by + 24, 24, 8, 3, shorts);
        roundedRect(ctx, 22, by + 26, 5, 4, 2, dot);
        roundedRect(ctx, 37, by + 26, 5, 4, 2, dot);
        /* Lobes: a smooth OVAL with a gentle dimple, drawn as a row profile.
           Two lessons from the earlier attempts, both about the outline:
             - rows all anchored to the skull's edge curve on the outside and
               stay dead flat against the head: a shape that narrows on one side
               only is a wedge, which is why it read as a triangle;
             - two full circles overlapping by four rows gave near-straight
               sides, so there was no lobe shape at all.
           This profile follows an ellipse (outer edge 17,15,13,12,11,11,10...)
           with a 2px dimple at the middle rows, which is what the reference
           actually shows: one tall rounded mass with a nip in it.
           Rows are [dy, outerX]; every row runs to the skull's edge at x20, so
           that flat inner side is hidden, and the mirror is [43, w]. */
        var lobeRows = [
          [-9, 17], [-8, 15], [-7, 13], [-6, 12], [-5, 11], [-4, 11],
          [-3, 10], [-2, 10], [-1, 10], [0, 12], [1, 12], [2, 12],
          [3, 10], [4, 10], [5, 10], [6, 11], [7, 11], [8, 12],
          [9, 13], [10, 15], [11, 17]
        ];
        for (var lr = 0; lr < lobeRows.length; lr++) {
          var lx = lobeRows[lr][1], lw = 21 - lx;
          rect(ctx, lx, by + lobeRows[lr][0], lw, 1, figure);
          rect(ctx, 43, by + lobeRows[lr][0], lw, 1, figure);
        }
        /* a soft sheen on the upper part of each lobe — kept close in tone,
           since a bright one turns it into a ring */
        roundedRect(ctx, 12, by - 6, 7, 7, 3, light);
        roundedRect(ctx, 45, by - 6, 7, 7, 3, light);
        /* skull */
        roundedRect(ctx, 20, by - 9, 24, 22, 10, figure);
        rect(ctx, 40, by - 5, 2, 12, shade);
        /* Arms: attached at the shoulders and hanging in front of the shorts.
           A 1px shade line on each arm's inner edge separates arm from torso —
           same-colour and touching, the two read as one wide slab.  The mittens
           stop at the hip so they never merge with the boots below. */
        if (raised) {
          roundedRect(ctx, 17, by + 14, 6, 13, 3, figure);   // left stays down
          roundedRect(ctx, 41, by + 4, 6, 13, 3, figure);    // right lifts
          rect(ctx, 22, by + 16, 1, 10, shade);
          rect(ctx, 41, by + 6, 1, 10, shade);
          roundedRect(ctx, 16, by + 25, 8, 8, 3, pale);
          roundedRect(ctx, 43, by - 4, 8, 8, 3, pale);       // mitten up beside the head
        } else {
          roundedRect(ctx, 17, by + 14, 6, 13, 3, figure);
          roundedRect(ctx, 41, by + 14, 6, 13, 3, figure);
          rect(ctx, 22, by + 16, 1, 10, shade);
          rect(ctx, 41, by + 16, 1, 10, shade);
          roundedRect(ctx, 16, by + 25, 8, 8, 3, pale);
          roundedRect(ctx, 40, by + 25, 8, 8, 3, pale);
        }
      },
      /* Face: X-ed out eyes and the cross-shaped mouth from the reference.
         The eyes never change — they are crossed out whatever the mood. */
      face: function (ctx, by, faceLike, opts) {
        var ink = '#2b3038';
        /* An 8x8 X: bigger, so the eyes fill the face as they do in the
           reference.  A 7x7 X on a 24px skull left too much empty cheek. */
        var X = [[0,0],[7,0],[1,1],[6,1],[2,2],[5,2],[3,3],[4,3],
                 [3,4],[4,4],[2,5],[5,5],[1,6],[6,6],[0,7],[7,7]];
        var i;
        for (i = 0; i < X.length; i++) {
          rect(ctx, 23 + X[i][0], by - 2 + X[i][1], 1, 1, ink);
          rect(ctx, 33 + X[i][0], by - 2 + X[i][1], 1, 1, ink);
        }
        if (faceLike === 'surprise') {
          roundedRect(ctx, 29, by + 8, 6, 5, 2, ink);        // open mouth
        } else {
          /* HORIZONTAL stitched mouth: a seam running left-to-right with three
             short vertical stitches crossing it.  It used to be a vertical seam
             with horizontal stitches — the opposite orientation.  The middle
             stitch is 2px so the mark stays centred on the sprite's 31.5 axis,
             and the outer two are 1px, leaving a 1px gap either side. */
          rect(ctx, 29, by + 9, 6, 1, ink);                  // horizontal seam
          rect(ctx, 29, by + 8, 1, 3, ink);                  // stitches
          rect(ctx, 31, by + 8, 2, 3, ink);
          rect(ctx, 34, by + 8, 1, 3, ink);
        }
        if (faceLike === 'love') {
          rect(ctx, 45, by - 12, 1, 1, '#e2708a');
          rect(ctx, 47, by - 12, 1, 1, '#e2708a');
          rect(ctx, 45, by - 11, 3, 1, '#e2708a');
          rect(ctx, 46, by - 10, 1, 1, '#e2708a');
        }
      }
    },

    sunflower: {
      label: 'Sunflower',
      col: { body: '#8a6238', bodyDk: '#6b4a2a', eye: '#3a2a1a', cheek: '#f2a8b4',
             foot: '#4e9e3a', footDk: '#3d7d30', mouth: '#3a2a1a',
             arm: '#4e9e3a', armDk: '#3d7d30' },
      feet: false, antenna: false, panel: false,
      noArms: true,
      /* The visible head is the seed disk drawn in extraUnder; the chassis
         underneath just gives it something opaque to sit on. */
      bodyInset: 10, bodyH: 30,
      eyes: EYES, eyeW: 6,
      eyeY: 22, eye1X: 24, eye2X: 34,
      mouthY: 33,
      cheekX: [18, 42], cheekY: 28,
      defaultFace: 'happy',
      cheekFaces: { happy: 1, love: 1, normal: 1 },
      extraBehind: function (ctx, by) {
        /* Twelve petals ringing the head.  Every petal is drawn twice — an
           orange rim pass first, then its yellow face — so overlaps between
           neighbours produce no visible seams. */
        var petals = [
          [24, 2, 16, 12], [24, 38, 16, 12],      // top / bottom
          [0, 20, 12, 16], [52, 20, 12, 16],      // sides
          [6, 9, 14, 12], [44, 9, 14, 12],        // upper diagonals
          [6, 32, 14, 12], [44, 32, 14, 12],      // lower diagonals
          [16, 3, 13, 11], [35, 3, 13, 11],       // in-fill near the top
          [16, 37, 13, 11], [35, 37, 13, 11]
        ];
        var i, p;
        for (i = 0; i < petals.length; i++) {
          p = petals[i];
          roundedRect(ctx, p[0] - 1, p[1] - 1, p[2] + 2, p[3] + 2, 6, '#e8952a');
        }
        for (i = 0; i < petals.length; i++) {
          p = petals[i];
          roundedRect(ctx, p[0], p[1], p[2], p[3], 5, '#ffd23f');
        }
      },
      extraUnder: function (ctx, by) {
        /* the seed head: concentric rings plus a ring of seeds */
        roundedRect(ctx, 15, 10, 34, 34, 17, '#6b4a2a');
        roundedRect(ctx, 18, 13, 28, 28, 14, '#8a6238');
        roundedRect(ctx, 21, 16, 22, 22, 11, '#9b7040');
        var seeds = [
          [19, 27], [45, 27], [21, 20], [43, 20], [21, 34], [43, 34],
          [26, 15], [38, 15], [26, 39], [38, 39], [32, 14], [32, 40]
        ];
        for (var i = 0; i < seeds.length; i++) {
          rect(ctx, seeds[i][0], seeds[i][1], 2, 2, '#5a3c22');
        }
      },
      extraOver: function (ctx, by, opts) {
        /* Stem, leaves and root feet go on top of the lower petals, which is
           where a real stem sits relative to the head. */
        var stem = '#4e9e3a', stemDk = '#3d7d30', leaf = '#5fb747';
        var swing = Math.sin((opts.phase || 0) * Math.PI * 2);
        var top = by + 31;                       // emerges from under the disk
        var raised = (opts.arm === 'wave' || opts.arm === 'up');
        rect(ctx, 30, top, 4, 55 - top, stem);
        rect(ctx, 30, top, 1, 55 - top, stemDk);
        var ly = raised ? top - 8 : top + 3;
        roundedRect(ctx, 19, ly, 12, 7, 3, leaf);
        rect(ctx, 23, ly + 3, 6, 1, stemDk);
        roundedRect(ctx, 33, ly + 8, 12, 7, 3, leaf);
        rect(ctx, 35, ly + 11, 6, 1, stemDk);
        /* roots doubling as feet, stepping with the walk cycle */
        var stepL = Math.round(swing * 2), stepR = Math.round(-swing * 2);
        rect(ctx, 26 + stepL, 51, 5, 3, stemDk);
        rect(ctx, 34 + stepR, 51, 5, 3, stemDk);
      }
    },

    elephant: {
      label: 'Elephant',
      col: { body: '#9aa6b2', bodyDk: '#7f8b98', eye: '#2b2b33', cheek: '#f2b8c0',
             foot: '#7f8b98', footDk: '#6b7681', mouth: '#2b2b33',
             arm: '#9aa6b2', armDk: '#7f8b98' },
      feet: true, antenna: false, panel: false,
      noArms: true,
      customBody: true,
      eyes: EYES, eyeW: 6,
      eyeY: 16, eye1X: 24, eye2X: 34,
      mouthY: 27,                     // hidden behind the trunk
      cheekX: [20, 40], cheekY: 21,
      defaultFace: 'normal',
      cheekFaces: { happy: 1, love: 1, normal: 1 },
      /* One properly round body (radius = half its height, so it is a true
         stadium) under a dome head.  Stacking two rounded blocks instead
         produced a visible step at the shoulders. */
      body: function (ctx, by) {
        var grey = '#9aa6b2', greyDk = '#8b97a4';
        roundedRect(ctx, 4, by + 6, 56, 32, 16, grey);      // round body
        roundedRect(ctx, 16, by - 4, 32, 22, 11, grey);     // dome head
        rect(ctx, 10, by + 33, 44, 2, greyDk);              // soft underside
      },
      /* stubby legs that step with the walk cycle */
      drawLegs: function (ctx, swing, col, by) {
        var leg = '#8b97a4', legDk = '#77828f';
        var l1 = Math.round(swing * 2), l2 = Math.round(-swing * 2);
        roundedRect(ctx, 12 + l1, by + 34, 14, 10, 3, leg);
        roundedRect(ctx, 38 + l2, by + 34, 14, 10, 3, leg);
        rect(ctx, 14 + l1, by + 41, 10, 2, legDk);          // toenails
        rect(ctx, 40 + l2, by + 41, 10, 2, legDk);
      },
      extraBack: function (ctx, by) {
        /* Huge fan ears, drawn over the body so they stand proud of it.
           The pink inner stays small — filling the whole ear made it read as
           a pink paddle rather than an ear. */
        roundedRect(ctx, 0, by - 8, 20, 30, 9, '#8b97a4');
        roundedRect(ctx, 44, by - 8, 20, 30, 9, '#8b97a4');
        roundedRect(ctx, 4, by - 1, 11, 16, 5, '#cfb8bd');
        roundedRect(ctx, 49, by - 1, 11, 16, 5, '#cfb8bd');
      },
      extraOver: function (ctx, by, opts) {
        var grey = '#9aa6b2', greyDk = '#8b97a4';
        var up = (opts.arm === 'wave' || opts.arm === 'up' ||
                  opts.face === 'surprise');
        if (up) {
          /* trumpeting: the trunk lifts and curls up to the side */
          roundedRect(ctx, 28, by + 12, 11, 13, 5, grey);
          roundedRect(ctx, 33, by + 5, 11, 12, 5, grey);
          roundedRect(ctx, 38, by - 1, 11, 11, 5, grey);
          rect(ctx, 41, by + 1, 6, 2, greyDk);
          rect(ctx, 45, by + 5, 3, 2, greyDk);
        } else {
          /* Long trunk tapering to the ground, with a soft curl at the tip.
             Rows are drawn individually so the taper stays smooth. */
          for (var i = 0; i < 28; i++) {
            var w = 10 - Math.round(i * 0.18);              // 10 -> 5
            var cx = 31.5 + (i > 21 ? (i - 21) * 0.6 : 0);  // tip drifts right
            var rx = Math.round(cx - w / 2);
            rect(ctx, rx, by + 14 + i, w, 1, grey);
            rect(ctx, rx, by + 14 + i, 1, 1, greyDk);       // shaded left edge
          }
        }
        /* tiny tusks tucked in beside the trunk */
        roundedRect(ctx, 25, by + 20, 4, 5, 2, '#f7f9fb');
        roundedRect(ctx, 35, by + 20, 4, 5, 2, '#f7f9fb');
      }
    },

    duck: {
      /* The ID stays `duck`: it is what is persisted in
         pbc_settings.character, so renaming it would silently reset the choice
         for anyone who already picked this one.

         The display label is deliberately kept as 'Minion'.  The Oct 2026 audit
         raised this as a trademark-risk item (the same class of risk that
         renamed Paws Patrol -> Aviator Pup and Kaws -> X-Buddy in 394d39e); the
         owner reviewed it and chose to keep the name.  Do not "fix" the
         id/label mismatch without asking first. */
      label: 'Minion',
      col: { body: '#ffd633', bodyDk: '#e8bd1f', eye: '#171b21', cheek: '#f4b8c2',
             foot: '#232830', footDk: '#161a20', mouth: '#232830',
             arm: '#ffd633', armDk: '#e8bd1f' },
      feet: true, antenna: false, panel: false,
      noArms: true,
      customBody: true,
      customFace: true,
      defaultFace: 'happy',
      cheekFaces: {},
      /* Tall yellow pill: a domed top over straight sides with a gently rounded
         base.  Drawing the base as a flat-bottomed shape (rather than one big
         rounded rect) keeps its width constant all the way down, so the denim
         overalls can span the full width without overhanging the body. */
      body: function (ctx, by) {
        var body = '#ffd633', shade = '#e8bd1f';
        roundedRect(ctx, 17, by - 9, 30, 24, 15, body);      // domed crown
        rect(ctx, 17, by + 12, 30, 19, body);                // straight sides
        roundedRect(ctx, 17, by + 29, 30, 9, 4, body);       // gently rounded base
        /* right-edge shade, stopping where the base starts to round in — run
           longer and it trails pixels below the body */
        rect(ctx, 43, by + 2, 3, 35, shade);
      },
      /* chunky black boots, wide enough to stand the tall body on */
      drawLegs: function (ctx, swing, col, by) {
        var boot = '#232830', sole = '#161a20';
        var l1 = Math.round(swing * 2), l2 = Math.round(-swing * 2);
        roundedRect(ctx, 18 + l1, by + 35, 12, 9, 4, boot);
        roundedRect(ctx, 34 + l2, by + 35, 12, 9, 4, boot);
        rect(ctx, 20 + l1, by + 42, 8, 1, sole);
        rect(ctx, 36 + l2, by + 42, 8, 1, sole);
      },
      /* Face: two metal-rimmed goggles with a black strap behind them and a
         bridge joining the rims, plus three strands of hair on the crown.
           rim 14px -> white lens 10 -> amber iris 6 -> pupil 4 -> 1px glint
         Both rings mirror on the sprite's 31.5 axis and the glint sits on the
         same side of each pupil, so the light direction reads consistently. */
      face: function (ctx, by, faceLike, opts) {
        var rim = '#c8ced6', rimDk = '#a8b0ba';
        var white = '#ffffff', iris = '#7a4a20', pupil = '#171b21';
        var ink = '#232830';
        /* hair — x25/x31/x37 so the outer pair mirrors and the middle strand is
           self-symmetric on the sprite's 31.5 axis */
        rect(ctx, 25, 0, 2, 5, ink);
        rect(ctx, 31, 0, 2, 4, ink);
        rect(ctx, 37, 0, 2, 5, ink);
        /* goggle strap across the head */
        rect(ctx, 17, 13, 30, 4, ink);
        /* rims */
        roundedRect(ctx, 18, 12, 14, 14, 7, rim);
        roundedRect(ctx, 32, 12, 14, 14, 7, rim);
        rect(ctx, 30, 17, 4, 3, rimDk);                // bridge
        /* lenses */
        roundedRect(ctx, 20, 14, 10, 10, 5, white);
        roundedRect(ctx, 34, 14, 10, 10, 5, white);
        /* irises and pupils */
        roundedRect(ctx, 22, 16, 6, 6, 3, iris);
        roundedRect(ctx, 36, 16, 6, 6, 3, iris);
        roundedRect(ctx, 23, 17, 4, 4, 2, pupil);
        roundedRect(ctx, 37, 17, 4, 4, 2, pupil);
        rect(ctx, 23, 17, 1, 1, white);                // glint, same side
        rect(ctx, 37, 17, 1, 1, white);
        /* wide grin */
        if (faceLike === 'surprise') {
          roundedRect(ctx, 29, 26, 6, 5, 2, ink);      // open mouth
        } else {
          rect(ctx, 27, 28, 10, 1, ink);
          rect(ctx, 28, 29, 8, 1, ink);
          rect(ctx, 26, 27, 1, 1, ink);                // upturned corners
          rect(ctx, 37, 27, 1, 1, ink);
        }
      },
      /* Denim overalls over the lower body, then the arms last so the gloves
         hang in front of the denim: drawn behind it, the overalls swallow his
         hands.  Straps start below the goggle rims (y27, not y23) or they
         paint over the bottom of the lenses. */
      extraOver: function (ctx, by, opts) {
        var denim = '#4a80c4', denimDk = '#3a68a0', denimLt = '#5f93d4';
        var ink = '#232830';
        var up = (opts.arm === 'wave' || opts.arm === 'up');
        /* shoulder straps */
        roundedRect(ctx, 21, by + 15, 5, 9, 2, denim);
        roundedRect(ctx, 38, by + 15, 5, 9, 2, denim);
        /* bib */
        roundedRect(ctx, 22, by + 21, 20, 17, 3, denim);
        rect(ctx, 22, by + 37, 20, 1, denimDk);              // hem fold
        /* buttons on the strap ends */
        roundedRect(ctx, 22, by + 21, 3, 3, 1, ink);
        roundedRect(ctx, 39, by + 21, 3, 3, 1, ink);
        /* front pocket with a simple mark (deliberately not the brand device) */
        roundedRect(ctx, 27, by + 25, 10, 9, 2, denimLt);
        rect(ctx, 28, by + 32, 8, 1, denimDk);
        roundedRect(ctx, 30, by + 27, 4, 4, 2, denimDk);
        /* arms and mitten gloves.  The arms are the same yellow as the body and
           touch it, so each carries a 1px shade seam on its inner edge — without
           it the arm and torso read as one slab with a bulge. */
        if (up) {
          roundedRect(ctx, 13, by + 14, 6, 14, 3, '#ffd633');   // left stays down
          roundedRect(ctx, 45, by + 8, 6, 14, 3, '#ffd633');    // right lifts
          rect(ctx, 18, by + 16, 1, 12, '#e8bd1f');
          rect(ctx, 45, by + 10, 1, 12, '#e8bd1f');
          roundedRect(ctx, 11, by + 25, 9, 10, 4, ink);
          roundedRect(ctx, 44, by, 9, 10, 4, ink);
        } else {
          roundedRect(ctx, 13, by + 14, 6, 14, 3, '#ffd633');
          roundedRect(ctx, 45, by + 14, 6, 14, 3, '#ffd633');
          rect(ctx, 18, by + 16, 1, 12, '#e8bd1f');
          rect(ctx, 45, by + 16, 1, 12, '#e8bd1f');
          roundedRect(ctx, 11, by + 25, 9, 10, 4, ink);
          roundedRect(ctx, 44, by + 25, 9, 10, 4, ink);
        }
      }
    },

    cat: {
      /* The id stays `cat`; "Oyen" is the label — the Malay/Indonesian name for
         a ginger cat.  Only ids are persisted, so the label can be renamed
         later without resetting anyone's saved choice (see the note on `duck`).

         Reshaped to read as a classic fat cartoon tabby: wide, rounded-tip
         ears with a salmon inner (the old narrow stepped pair read as a
         squirrel), a bigger cream muzzle with a cat nose, philtrum and "w"
         mouth, and cheek tufts.  The eyes stay the big shiny pair — the
         heavy-lidded variant was tried and read as smug.  The character and
         the Oyen name stay original. */
      label: 'Oyen',
      col: { body: '#ec9134', bodyDk: '#c9701f', eye: '#4a2e14', cheek: '#f2a08a',
             foot: '#ec9134', footDk: '#c9701f', mouth: '#7a4a22',
             arm: '#ec9134', armDk: '#c9701f' },
      feet: true, antenna: false, panel: false,
      eyes: CUTE_EYES, eyeW: 8,
      eyeY: 22, eye1X: 19, eye2X: 37,
      mouthY: 34,
      cheekFaces: {},
      bodyInset: -1,                 // a slightly wider, chubbier chassis
      actions: ['stretch'],
      extraBehind: function (ctx, by) {
        var fur = '#ec9134', stripe = '#c9701f';
        /* striped tail up the right-hand side */
        rect(ctx, 54, by + 30, 6, 6, fur);
        rect(ctx, 57, by + 16, 5, 16, fur);
        rect(ctx, 55, by + 9, 6, 8, fur);
        rect(ctx, 58, by + 13, 2, 3, stripe);
        rect(ctx, 58, by + 22, 2, 3, stripe);
      },
      /* Ears live over the head (extraBack), not behind it, so the wide base
         is genuinely attached to the skull instead of floating past its
         rounded corner. */
      extraBack: function (ctx, by) {
        var fur = '#ec9134', inner = '#f0a08f';
        /* left ear: rounded tip, straight diagonals, 12px base */
        rect(ctx, 14, by - 12, 2, 1, fur);
        rect(ctx, 13, by - 11, 4, 3, fur);
        rect(ctx, 12, by - 8, 6, 3, fur);
        rect(ctx, 11, by - 5, 8, 3, fur);
        rect(ctx, 10, by - 2, 10, 3, fur);
        rect(ctx, 9, by + 1, 12, 3, fur);
        /* salmon inner, 2px fur border all round */
        rect(ctx, 14, by - 8, 2, 2, inner);
        rect(ctx, 13, by - 6, 4, 2, inner);
        rect(ctx, 12, by - 4, 6, 2, inner);
        rect(ctx, 11, by - 2, 8, 2, inner);
        /* right ear, mirrored around x = 32 */
        rect(ctx, 48, by - 12, 2, 1, fur);
        rect(ctx, 47, by - 11, 4, 3, fur);
        rect(ctx, 46, by - 8, 6, 3, fur);
        rect(ctx, 45, by - 5, 8, 3, fur);
        rect(ctx, 44, by - 2, 10, 3, fur);
        rect(ctx, 43, by + 1, 12, 3, fur);
        rect(ctx, 48, by - 8, 2, 2, inner);
        rect(ctx, 47, by - 6, 4, 2, inner);
        rect(ctx, 46, by - 4, 6, 2, inner);
        rect(ctx, 45, by - 2, 8, 2, inner);
      },
      extraUnder: function (ctx, by) {
        /* wide cream muzzle: the old 12px patch was more chin than muzzle */
        roundedRect(ctx, 23, by + 17, 18, 11, 5, '#f7e3c8');
        rect(ctx, 27, by + 26, 10, 1, '#e7d2b4');   // soft chin line
      },
      extraOver: function (ctx, by, opts) {
        var stripe = '#c9701f', fur = '#ec9134';
        var ink = '#4a2e14';
        /* forehead tabby "M" and cheek stripes */
        rect(ctx, 26, by + 2, 2, 4, stripe);
        rect(ctx, 31, by + 1, 2, 5, stripe);
        rect(ctx, 36, by + 2, 2, 4, stripe);
        rect(ctx, 9, by + 11, 6, 2, stripe);
        rect(ctx, 9, by + 15, 6, 2, stripe);
        rect(ctx, 49, by + 11, 6, 2, stripe);
        rect(ctx, 49, by + 15, 6, 2, stripe);
        /* cheek tufts: stepped points at muzzle height, so the head widens
           into fat cheeks instead of sprouting tabs at eye level */
        rect(ctx, 5, by + 18, 4, 2, fur);
        rect(ctx, 4, by + 20, 3, 3, fur);
        rect(ctx, 55, by + 18, 4, 2, fur);
        rect(ctx, 57, by + 20, 3, 3, fur);
        /* Big shiny eyes (the heavy half-lidded version read as smug).  A
           glint and a small sparkle in the same corner of each eye; skipped
           where the shared shape is a squint rather than an open eye. */
        if (opts.face !== 'happy' && opts.face !== 'blink' &&
            opts.face !== 'love') {
          rect(ctx, 20, by + 11, 2, 2, '#fffdf5');
          rect(ctx, 23, by + 14, 1, 1, '#fffdf5');
          rect(ctx, 38, by + 11, 2, 2, '#fffdf5');
          rect(ctx, 41, by + 14, 1, 1, '#fffdf5');
        }
        /* cat nose, philtrum and lifted mouth corners */
        roundedRect(ctx, 29, by + 16, 6, 4, 2, '#e58aa0');
        rect(ctx, 31, by + 20, 2, 2, ink);          // philtrum
        rect(ctx, 28, by + 21, 1, 1, ink);          // upturned corners
        rect(ctx, 35, by + 21, 1, 1, ink);
        /* whiskers */
        rect(ctx, 14, by + 20, 8, 1, '#a8672a');
        rect(ctx, 14, by + 23, 8, 1, '#a8672a');
        rect(ctx, 42, by + 20, 8, 1, '#a8672a');
        rect(ctx, 42, by + 23, 8, 1, '#a8672a');
        /* toe lines on the paws */
        rect(ctx, 17, by + 39, 1, 3, stripe);
        rect(ctx, 20, by + 39, 1, 3, stripe);
        rect(ctx, 46, by + 39, 1, 3, stripe);
        rect(ctx, 43, by + 39, 1, 3, stripe);
        /* the reference's sparkles: lit only while he is showing off */
        if (opts.action === 'stretch') {
          rect(ctx, 4, by + 6, 6, 2, '#ffd166');
          rect(ctx, 6, by + 4, 2, 6, '#ffd166');
          rect(ctx, 54, by + 4, 6, 2, '#ffd166');
          rect(ctx, 56, by + 2, 2, 6, '#ffd166');
        }
      }
    },
    scout: {
      /* An original beagle scout: green campaign hat, red neckerchief, floppy
         black ears.  The look is inspired by the idea of a scout pup; the
         sprite is drawn from scratch and deliberately carries an original
         name, because the store's IP rules are what renamed Paws Patrol ->
         Aviator Pup and Kaws -> X-Buddy in 394d39e. */
      label: 'Scout Pup',
      col: { body: '#fbfaf5', bodyDk: '#e7e2d6', eye: '#231f28',
             cheek: '#f3b3b8', foot: '#fbfaf5', footDk: '#ded8ca',
             mouth: '#231f28', arm: '#fbfaf5', armDk: '#e7e2d6' },
      feet: true, antenna: false, panel: false,
      noArms: true,             // custom arms, so a salute can reach the brim
      customBody: true,
      eyes: HAPPY_EYES, eyeW: 7,
      eyeY: 18, eye1X: 18, eye2X: 39,
      mouthY: 38,
      cheekX: [15, 47], cheekY: 29,
      cheekFaces: { happy: 1, love: 1 },
      actions: ['salute'],
      body: function (ctx, by) {
        var fur = '#fbfaf5', shade = '#e7e2d6', deep = '#d6d0c2';
        /* one silhouette — big beagle head over a chubby body — so no step
           shows at the neck */
        roundedRect(ctx, 12, by - 2, 40, 26, 12, fur);
        roundedRect(ctx, 15, by + 15, 34, 24, 12, fur);
        rect(ctx, 47, by + 1, 3, 20, shade);            // head edge shade
        rect(ctx, 45, by + 30, 3, 7, shade);            // body edge shade
        rect(ctx, 19, by + 38, 26, 2, deep);            // soft underside
      },
      /* white paws with toe seams, stepping with the walk cycle */
      drawLegs: function (ctx, swing, col, by) {
        var paw = '#fbfaf5', pawDk = '#ded8ca';
        var l1 = Math.round(swing * 2), l2 = Math.round(-swing * 2);
        roundedRect(ctx, 16 + l1, by + 37, 12, 8, 4, paw);
        roundedRect(ctx, 36 + l2, by + 37, 12, 8, 4, paw);
        rect(ctx, 18 + l1, by + 43, 4, 1, pawDk);
        rect(ctx, 38 + l2, by + 43, 4, 1, pawDk);
      },
      extraBehind: function (ctx, by) {
        /* stubby tail curling up behind the body */
        roundedRect(ctx, 46, by + 29, 9, 8, 3, '#fbfaf5');
        roundedRect(ctx, 50, by + 25, 6, 8, 3, '#fbfaf5');
        rect(ctx, 52, by + 27, 3, 2, '#e7e2d6');
      },
      extraUnder: function (ctx, by) {
        var ear = '#1f1c24', earLt = '#332e38';
        var scarf = '#d8402f', scarfLt = '#ef6a55', scarfDk = '#a82e22';
        /* Floppy ears in FRONT of the head, hanging past the jaw.  Drawn
           behind it they read as headphones; a beagle's ears fall forward
           over the sides of the face. */
        roundedRect(ctx, 2, by + 1, 11, 27, 5, ear);
        roundedRect(ctx, 51, by + 1, 11, 27, 5, ear);
        rect(ctx, 4, by + 3, 2, 17, earLt);
        rect(ctx, 57, by + 3, 2, 17, earLt);
        /* shadow where the head meets the body, so one white silhouette does
           not read as a snowman */
        rect(ctx, 18, by + 22, 28, 2, '#e7e2d6');
        /* red neckerchief: band, knot, two short tails */
        roundedRect(ctx, 14, by + 27, 36, 5, 2, scarf);
        rect(ctx, 16, by + 27, 32, 2, scarfLt);
        roundedRect(ctx, 28, by + 31, 9, 7, 3, scarf);
        rect(ctx, 30, by + 32, 5, 2, scarfLt);
        rect(ctx, 27, by + 35, 5, 8, scarfDk);
        rect(ctx, 28, by + 36, 3, 6, scarf);
        rect(ctx, 34, by + 35, 5, 8, scarfDk);
        rect(ctx, 35, by + 36, 3, 6, scarf);
      },
      extraOver: function (ctx, by, opts) {
        var fur = '#fbfaf5', shade = '#e7e2d6', ink = '#231f28';
        var muzzle = '#f3eee2';
        /* only the startled eyes are open, so only they get a catchlight */
        if (opts.face === 'surprise') {
          rect(ctx, 20, by + 7, 2, 2, '#fffdf5');
          rect(ctx, 41, by + 7, 2, 2, '#fffdf5');
        }
        /* muzzle and the big black nose */
        roundedRect(ctx, 23, by + 16, 18, 14, 6, muzzle);
        rect(ctx, 23, by + 16, 18, 1, '#e9e1cf');
        roundedRect(ctx, 27, by + 16, 10, 7, 3, ink);
        rect(ctx, 29, by + 17, 3, 2, '#4a4550');
        /* the shared mouth is a flat 6px line; lift its corners into a smile */
        if (opts.mouth !== 'o') {
          rect(ctx, 28, by + 25, 1, 1, ink);
          rect(ctx, 35, by + 25, 1, 1, ink);
        }
        /* ---- scout hat: wide brim, creased crown, leather band ---- */
        var hat = '#4f8f3f', hatDk = '#3b6b2f', hatLt = '#66a852';
        var band = '#6b4a2a';
        roundedRect(ctx, 18, by - 12, 28, 11, 4, hat);   // crown
        rect(ctx, 21, by - 11, 3, 8, hatLt);             // left dent
        rect(ctx, 40, by - 11, 3, 8, hatDk);             // right dent
        rect(ctx, 31, by - 11, 2, 8, hatDk);             // centre crease
        rect(ctx, 18, by - 5, 28, 3, band);              // leather band
        rect(ctx, 24, by - 8, 3, 3, '#ffd166');          // badge
        rect(ctx, 25, by - 9, 1, 1, '#fff3c4');
        roundedRect(ctx, 6, by - 4, 52, 6, 3, hatDk);    // brim
        rect(ctx, 8, by - 4, 48, 2, hatLt);              // brim top light
        rect(ctx, 4, by - 6, 4, 4, hatDk);               // upturned left edge
        rect(ctx, 56, by - 6, 4, 4, hatDk);
        /* ---- arms last, so a saluting paw sits in front of the brim ---- */
        var up = (opts.arm === 'up' || opts.arm === 'wave');
        if (opts.arm === 'salute') {
          rect(ctx, 10, by + 27, 5, 12, fur);            // left arm down
          roundedRect(ctx, 9, by + 36, 7, 6, 3, shade);
          rect(ctx, 14, by + 27, 1, 12, shade);          // seam against the body
          rect(ctx, 47, by + 5, 5, 22, fur);             // right arm up
          roundedRect(ctx, 43, by - 1, 10, 7, 3, fur);   // paw at the brim
          rect(ctx, 43, by - 1, 10, 2, shade);
          rect(ctx, 47, by + 5, 1, 22, shade);           // seam against the head
        } else if (up) {
          rect(ctx, 10, by + 21, 5, 13, fur);
          roundedRect(ctx, 9, by + 17, 7, 6, 3, fur);
          rect(ctx, 14, by + 21, 1, 13, shade);
          rect(ctx, 48, by + 21, 5, 13, fur);
          roundedRect(ctx, 47, by + 17, 7, 6, 3, fur);
          rect(ctx, 48, by + 21, 1, 13, shade);
          rect(ctx, 51, by + 18, 2, 5, shade);
        } else {
          rect(ctx, 11, by + 27, 5, 12, fur);
          roundedRect(ctx, 10, by + 36, 7, 6, 3, shade);
          rect(ctx, 15, by + 27, 1, 12, shade);
          rect(ctx, 47, by + 27, 5, 12, fur);
          roundedRect(ctx, 46, by + 36, 7, 6, 3, shade);
          rect(ctx, 47, by + 27, 1, 12, shade);
        }
      }
    },

    melon: {
      /* Original watermelon slice: dark outline, green rind, white pith, red
         flesh and seeds.  No arms and no legs — a slice should not pretend to
         be a person.  `float: true` is what makes behaviors.js bob it above
         the floor and bounce when it travels; the 6-grid-px gap between the
         rind and the shadow is the resting hover. */
      label: 'Watermelon',
      col: { body: '#ef4b63', bodyDk: '#d63a55', eye: '#2a1733',
             cheek: '#f58fa0', foot: '#3f9b45', footDk: '#2c7a33',
             mouth: '#46152a', arm: '#ef4b63', armDk: '#d63a55' },
      feet: false, antenna: false, panel: false,
      noArms: true,             // a slice has no arms, so no wave pose
      float: true,              // hovers/bounces instead of walking
      customBody: true,
      eyes: CUTE_EYES, eyeW: 8,
      eyeY: 20, eye1X: 20, eye2X: 36,
      mouthY: 33,
      cheekX: [14, 48], cheekY: 27,
      cheekFaces: { happy: 1, love: 1 },
      actions: ['spit'],
      body: function (ctx, by) {
        var flesh = '#ef4b63', fleshDk = '#d63a55';
        var rind = '#3f9b45', rindDk = '#2c7a33', pith = '#f7f7ef';
        var line = '#3b2444';
        var apexY = by - 9, baseY = by + 26, half, y, t;
        /* rind stack first: dark outline, green rind, thin white pith */
        roundedRect(ctx, 2, by + 26, 60, 14, 5, line);
        roundedRect(ctx, 3, by + 27, 58, 11, 4, rind);
        rect(ctx, 5, by + 35, 54, 2, rindDk);
        roundedRect(ctx, 4, by + 24, 56, 6, 3, pith);
        /* flesh triangle: outline row by row, then the fill one pixel in, so
           both slanted edges stay a clean single pixel at every size */
        for (y = apexY; y <= baseY; y++) {
          t = (y - apexY) / (baseY - apexY);
          half = 3 + Math.round(t * 24);
          rect(ctx, 32 - half - 1, y, half * 2 + 2, 1, line);
        }
        for (y = apexY + 1; y < baseY; y++) {
          t = (y - apexY) / (baseY - apexY);
          half = 3 + Math.round(t * 24) - 1;
          if (half < 1) continue;
          rect(ctx, 32 - half, y, half * 2, 1, flesh);
        }
        /* a soft shade down the right flank */
        for (y = apexY + 4; y < baseY - 2; y++) {
          t = (y - apexY) / (baseY - apexY);
          half = 3 + Math.round(t * 24) - 1;
          if (half > 7) rect(ctx, 32 + half - 3, y, 3, 1, fleshDk);
        }
        /* seeds, 2x4 so they survive the picker's 0.7 scale, kept clear of
           the face (eyes x20-44 y20-28, mouth x28-36 y31-37) */
        var seed = '#2a1733', seedHi = '#4a2a55';
        function pip(x, yy) {
          rect(ctx, x, yy, 2, 4, seed);
          rect(ctx, x, yy, 1, 1, seedHi);
        }
        pip(29, by - 5); pip(34, by - 4);
        pip(25, by); pip(39, by + 1);
        pip(17, by + 3); pip(46, by + 6);
        pip(16, by + 12); pip(47, by + 11);
        pip(13, by + 19); pip(50, by + 19);
      },
      extraOver: function (ctx, by, opts) {
        var dark = '#46152a';
        /* eye shine, only where an eye is actually open */
        if (opts.face !== 'happy' && opts.face !== 'blink' &&
            opts.face !== 'love') {
          rect(ctx, 22, by + 10, 2, 2, '#fffdf5');
          rect(ctx, 25, by + 13, 1, 1, '#fffdf5');
          rect(ctx, 38, by + 10, 2, 2, '#fffdf5');
          rect(ctx, 41, by + 13, 1, 1, '#fffdf5');
        }
        /* open smiling mouth with a tongue, drawn over the shared flat mouth:
           wide top lip, tapered chin, then the tongue on the dark interior */
        if (opts.mouth === 'o') {
          roundedRect(ctx, 30, by + 18, 5, 7, 2, dark);
        } else {
          rect(ctx, 28, by + 18, 8, 1, dark);
          rect(ctx, 27, by + 19, 10, 1, dark);
          rect(ctx, 28, by + 20, 8, 1, dark);
          rect(ctx, 29, by + 21, 6, 1, dark);
          rect(ctx, 30, by + 22, 4, 1, dark);
          rect(ctx, 30, by + 20, 4, 2, '#ff8fa3');
          rect(ctx, 26, by + 18, 1, 2, dark);        // lifted corners
          rect(ctx, 37, by + 18, 1, 2, dark);
        }
        /* ---- seed spit, with a puckered mouth ---- */
        if (opts.action === 'spit') {
          roundedRect(ctx, 30, by + 17, 5, 6, 2, dark);
          var seed = '#2a1733';
          rect(ctx, 38, by + 13, 3, 2, seed);
          rect(ctx, 45, by + 9, 3, 2, seed);
          rect(ctx, 52, by + 5, 3, 2, seed);
          rect(ctx, 40, by + 11, 7, 1, '#f7f7ef');
          rect(ctx, 47, by + 7, 7, 1, '#f7f7ef');
          rect(ctx, 54, by + 4, 5, 1, '#f7f7ef');
        }
      }
    }
  };

  /* Draw helper: set fillStyle, then fill a rect. */
  function rect(ctx, x, y, w, h, color) {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  /* Rounded rect: walks the rows and insets the corner rows along a quarter
   * circle, so the radius is honoured at ANY size.
   *
   * The previous implementation punched r x r corner squares out of a filled
   * rect.  Whenever the radius approached half the height the middle band hit
   * zero and the shape collapsed into a plus/cross — that is why the panda's
   * ears were 2px bars, the koala's ear inners were sticks, Skye's helmet was
   * a flat brim and the butterfly wings read as crosses. */
  function roundedRect(ctx, x, y, w, h, r, color) {
    w = Math.round(w); h = Math.round(h);
    if (w <= 0 || h <= 0) return;
    r = Math.max(0, Math.min(Math.round(r), Math.floor(Math.min(w, h) / 2)));
    if (r === 0) { rect(ctx, x, y, w, h, color); return; }
    for (var i = 0; i < h; i++) {
      var inset = 0;
      if (i < r) {
        var d = r - (i + 0.5);
        inset = r - Math.round(Math.sqrt(Math.max(0, r * r - d * d)));
      } else if (i >= h - r) {
        var d2 = r - (h - i - 0.5);
        inset = r - Math.round(Math.sqrt(Math.max(0, r * r - d2 * d2)));
      }
      var rowW = w - inset * 2;
      if (rowW <= 0) continue;
      rect(ctx, x + inset, y + i, rowW, 1, color);
    }
  }

  /* Chassis capsule.  Deliberately keeps the original flat corner bevel so
   * the four ships-with chassis stay pixel-identical. */
  function roundedBody(ctx, x, y, w, h, color) {
    var r = G.corner;
    rect(ctx, x + r, y, w - r * 2, h, color);
    rect(ctx, x, y + r, w, h - r * 2, color);
    rect(ctx, x + r, y + r, w - r * 2, h - r * 2, color);
  }

  /* Mirror wrapper: flips the sprite horizontally. */
  function mirrored(ctx) {
    return {
      fillRect: function (x, y, w, h) {
        ctx.fillStyle = this.fillStyle;
        ctx.fillRect(GRID - x - w, y, w, h);
      }
    };
  }

  /* Scale wrapper: multiplies coordinates by px. */
  function scaled(ctx, px) {
    if (px === 1) return ctx;
    return {
      fillRect: function (x, y, w, h) {
        ctx.fillStyle = this.fillStyle;
        ctx.fillRect(x * px, y * px, w * px, h * px);
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * draw(ctx, opts)
   *   skin     'bot'|'snowman'|'shark'|'capy'
   *   face     'normal'|'blink'|'happy'|'surprise'|'love'
   *   mouth    'normal'|'smile'|'o'
   *   phase    walk-cycle phase 0..1 (drives leg swing + body bob)
   *   bob      extra vertical offset (negative = up), e.g. jump height
   *   facing   -1 to mirror the sprite
   *   arm      'down' | 'up' | 'wave'
   *   wave     wave phase 0..1 (arm bobs while waving)
   *   sway     antenna sway offset
   *   shadow   draw ground shadow (default true)
   * ------------------------------------------------------------------ */
  function draw(ctx, opts) {
    opts = opts || {};
    var skin = SKINS[opts.skin] || SKINS.bot;
    var phase = opts.phase || 0;
    var swing = Math.sin(phase * Math.PI * 2);          // -1..1
    var bob = opts.bob || 0;
    var waveT = opts.wave || 0;

    /* Walk bob: body lifts a touch on each stride, settles between. */
    var bobWalk = -Math.abs(swing) * 1.5;
    var dy = Math.round(bobWalk + bob);

    if (opts.facing === -1) ctx = mirrored(ctx);

    var col = skin.col;

    /* ---- ground shadow (bigger + fainter while airborne) ---- */
    if (opts.shadow !== false) {
      var air = Math.min(1, Math.abs(bob) / 40);
      var sw = Math.round(G.shadowW * (1 - air * 0.4));
      var sh = Math.round(G.shadowH * (1 - air * 0.3));
      rect(ctx, Math.round((GRID - sw) / 2), G.shadowY, sw, sh,
           'rgba(10,20,40,' + (0.22 - air * 0.12).toFixed(2) + ')');
    }

    /* ---- antenna (bot only; drawn first so body overlaps stem base) ---- */
    if (skin.antenna) {
      var sway = Math.round(Math.sin(phase * Math.PI * 2) * 1) + (opts.sway || 0);
      var antX = G.antX + sway;
      rect(ctx, antX, G.antTop + 2, 3, G.antStemH, col.bodyDk);
      rect(ctx, antX + 1, G.antTop + 3, 1, G.antStemH - 1, col.body);
      rect(ctx, G.orbX - 1, G.orbY, G.orbW + 2, G.orbH, C.orbGlow);  // glow
      rect(ctx, G.orbX, G.orbY + 1, G.orbW, G.orbH - 2, C.orb);
      rect(ctx, G.orbX + 1, G.orbY + 1, G.orbW - 2, 2, '#ffd9d9');   // shine
    }

    /* ---- feet / legs (a skin may swap the chassis boots for its own) ---- */
    var by = G.bodyY + dy;
    if (skin.feet) {
      if (skin.drawLegs) skin.drawLegs(ctx, swing, col, by, opts);
      else drawFeet(ctx, swing, col);
    }

    /* ---- skin extras BEHIND the body (ears, wings, tails, stalks) ---- */
    if (skin.extraBehind) skin.extraBehind(ctx, by, opts);

    /* ---- body: the shared chassis, or the skin's own silhouette ---- *
     * A boxy chassis suits blobby animals (panda, koala) but fights ones
     * with a strong shape of their own — an elephant's round body and dome
     * head, a duck's big head on a small body.  `customBody: true` plus a
     * `body(ctx, by, opts)` hook lets a skin draw its own silhouette.
     *
     * The arm anchors are derived from the same bx/bw as the body, so a skin
     * with `bodyInset` gets arms attached to ITS body.  Previously they used
     * the full-width chassis constants, which left the butterfly's arms
     * floating detached out in its wings. */
    var bodyInset = skin.bodyInset || 0;
    var bx = G.bodyX + bodyInset;
    var bw = G.bodyW - bodyInset * 2;
    if (skin.customBody && skin.body) {
      skin.body(ctx, by, opts);
    } else {
      var bodyH = (skin.bodyH !== undefined) ? skin.bodyH
                : (skin.feet ? G.bodyH : G.bodyH + 4); // footless skins reach lower
      if (bob < 0) bodyH += 2;
      roundedBody(ctx, bx, by, bw, bodyH, col.body);
      /* side shade strips */
      rect(ctx, bx, by + 4, 2, bodyH - 10, col.bodyDk);
      rect(ctx, bx + bw - 2, by + 4, 2, bodyH - 10, col.bodyDk);
      /* bottom shade */
      rect(ctx, bx, by + bodyH - 3, bw, 3, col.bodyDk);
    }

    /* ---- skin extras over the body but behind the face ---- */
    if (skin.extraBack) skin.extraBack(ctx, by, opts);

    /* ---- skin extras that sit under the face ---- */
    if (skin.extraUnder) skin.extraUnder(ctx, by, opts);

    /* ---- arms (a skin may hide the chassis arms and draw its own) ---- */
    if (!skin.noArms) drawArms(ctx, by, opts.arm, waveT, col, skin, bx, bw);

    /* ---- face panel (bot only) ---- */
    if (skin.panel) {
      var py = G.panelY + dy;
      rect(ctx, G.panelX - 1, py - 1, G.panelW + 2, G.panelH + 2, C.outlineSoft);
      rect(ctx, G.panelX, py, G.panelW, G.panelH, C.panel);
      rect(ctx, G.panelX + 2, py, G.panelW - 4, 1, 'rgba(255,255,255,0.55)');
    }

    /* ---- face ---- */
    var face = opts.face || skin.defaultFace || 'normal';
    if (skin.customFace && skin.face) {
      /* Costume faces (baby shark): one hook draws the whole face. */
      skin.face(ctx, by, face, opts);
    } else {
    /* ---- eyes ---- */
    var eyeSet = skin.eyes;
    if (face === 'surprise' && skin.eyes === EYES_SMALL) {
      eyeSet = EYES_SMALL;    // surprise falls back to bigger dots
    }
    var eyeShape = eyeSet[face] || eyeSet[opts.face] || eyeSet.normal;
    var ey = (skin.eyeY || G.eyeY) + dy;
    var e1x = skin.eye1X || G.eye1X;
    var e2x = skin.eye2X || G.eye2X;
    drawEye(ctx, e1x, ey, eyeShape, col.eye);
    drawEye(ctx, e2x, ey, eyeShape, col.eye);
    if (face === 'surprise' && skin.panel) {
      rect(ctx, e1x + 1, ey, 2, 1, '#ffffff');
      rect(ctx, e2x + 1, ey, 2, 1, '#ffffff');
    }

    /* ---- cheeks ---- */
    var showCheek = skin.cheekFaces && skin.cheekFaces[face];
    if (showCheek) {
      var cx1 = skin.cheekX ? skin.cheekX[0] : G.cheek1[0];
      var cx2 = skin.cheekX ? skin.cheekX[1] : G.cheek2[0];
      var cyy = (skin.cheekY !== undefined ? skin.cheekY : G.cheek1[1]) + dy;
      rect(ctx, cx1, cyy, 2, 3, col.cheek);
      rect(ctx, cx2, cyy, 2, 3, col.cheek);
    }

    /* ---- mouth ----
     * The anchor honours the skin's own mouthY.  It previously read the global
     * G.mouthY for every skin, so all the per-skin overrides were silently
     * ignored and each mouth drew at y35 regardless. */
    var mouthTop = ((skin.mouthY !== undefined) ? skin.mouthY : G.mouthY) + dy;
    if (opts.skin === 'snowman') {
      /* carrot drawn in extraOver; optional open mouth while jumping */
      if (opts.mouth === 'o') {
        rect(ctx, 31, mouthTop + 2, 6, 3, '#3a2a2a');
      }
    } else if (opts.skin === 'shark') {
      if (opts.mouth === 'o') {
        rect(ctx, 30, mouthTop, 4, 4, '#c95a6e');
        rect(ctx, 31, mouthTop + 1, 2, 2, '#e2778a');
      }
    } else if (opts.skin === 'capy') {
      if (opts.mouth === 'o') {
        rect(ctx, 30, mouthTop, 4, 3, '#3a2a1a');
      }
    } else {
      var mouthShape = MOUTHS[opts.mouth] || MOUTHS.normal;
      var mx = G.mouthX;
      for (var i = 0; i < mouthShape.length; i++) {
        rect(ctx, mx + mouthShape[i][0], mouthTop + mouthShape[i][1], 1, 1, col.mouth);
      }
    }
    } /* end generic face */

    /* ---- skin extras that sit above the face (hats etc) ---- */
    if (skin.extraOver) skin.extraOver(ctx, by, opts);
  }

  function drawEye(ctx, x, y, shape, color) {
    for (var i = 0; i < shape.length; i++) {
      rect(ctx, x + shape[i][0], y + shape[i][1], 1, 1, color);
    }
  }

  function drawFeet(ctx, swing, col) {
    var liftL = Math.max(0, swing) * 2;   // front-foot lift
    var liftR = Math.max(0, -swing) * 2;
    var fwdL = Math.round(swing * 2);
    var fwdR = Math.round(-swing * 2);
    rect(ctx, G.footLX + fwdL, G.feetY - liftL, G.footW, G.feetH, col.foot);
    rect(ctx, G.footLX + fwdL, G.feetY + G.feetH - liftL - 2, G.footW, 2, col.footDk);
    rect(ctx, G.footRX + fwdR, G.feetY - liftR, G.footW, G.feetH, col.foot);
    rect(ctx, G.footRX + fwdR, G.feetY + G.feetH - liftR - 2, G.footW, 2, col.footDk);
  }

  function drawArms(ctx, by, arm, waveT, col, skin, bx, bw) {
    bx = (bx === undefined) ? G.bodyX : bx;
    bw = (bw === undefined) ? G.bodyW : bw;
    var armCol = col.arm || col.body;
    var armDk = col.armDk || col.bodyDk;
    if (arm === 'guard') {
      /* both paws up in front, boxing-guard style */
      rect(ctx, bx - 1, by + 10, 5, 9, armCol);
      rect(ctx, bx - 2, by + 6, 7, 5, armCol);
      rect(ctx, bx + bw - 4, by + 10, 5, 9, armCol);
      rect(ctx, bx + bw - 5, by + 6, 7, 5, armCol);
    } else if (arm === 'punchA' || arm === 'punchB') {
      /* one paw thrust out sideways, the other held in guard */
      if (arm === 'punchA') {
        rect(ctx, 0, by + 12, 10, 5, armCol);
        rect(ctx, 0, by + 10, 6, 9, armCol);          // fist
        rect(ctx, bx + bw - 4, by + 10, 5, 9, armCol);
      } else {
        rect(ctx, 54, by + 12, 10, 5, armCol);
        rect(ctx, 58, by + 10, 6, 9, armCol);
        rect(ctx, bx - 1, by + 10, 5, 9, armCol);
      }
    } else if (arm === 'crane') {
      /* arms swept out wide, crane style */
      rect(ctx, 0, by + 12, 11, 4, armCol);
      rect(ctx, 53, by + 12, 11, 4, armCol);
      rect(ctx, 0, by + 10, 5, 8, armCol);
      rect(ctx, 59, by + 10, 5, 8, armCol);
    } else if (arm === 'salute') {
      /* left arm at the side, right paw snapped up to the brim */
      rect(ctx, bx - 2, by + 8, 4, 12, armCol);
      rect(ctx, bx - 3, by + 18, 6, 4, armCol);
      rect(ctx, bx + bw - 4, by - 6, 4, 20, armCol);
      rect(ctx, bx + bw - 8, by - 9, 9, 5, armCol);
      rect(ctx, bx + bw - 8, by - 9, 9, 2, armDk);
    } else if (arm === 'up' || arm === 'wave') {
      rect(ctx, bx - 2, by - 4, 4, 12, armCol);
      rect(ctx, bx - 3, by - 6, 6, 4, armCol);
      var rx = bx + bw - 2;
      if (arm === 'wave') {
        var tilt = Math.round(Math.sin(waveT * Math.PI * 2) * 2);
        rect(ctx, rx + tilt, by - 8, 4, 14, armCol);
        rect(ctx, rx + tilt - 1, by - 12, 7, 5, armCol);
      } else {
        rect(ctx, rx, by - 4, 4, 12, armCol);
        rect(ctx, rx - 1, by - 6, 6, 4, armCol);
      }
    } else {
      /* Anchored to the body's current y, like every pose above: the absolute
         G.armY left the resting arms hanging in place while the body bobbed up
         to 2px on each stride. */
      var ay = by + (G.armY - G.bodyY);
      rect(ctx, bx - 2, ay, 4, 10, armCol);
      rect(ctx, bx - 3, ay + 8, 5, 3, armDk);
      rect(ctx, bx + bw - 2, ay, 4, 10, armCol);
      rect(ctx, bx + bw - 2, ay + 8, 5, 3, armDk);
    }
  }

  /* Public API */
  global.PBArt = {
    GRID: GRID,
    C: C,
    G: G,
    SKINS: SKINS,
    EYES: EYES,
    MOUTHS: MOUTHS,
    draw: draw,
    mirrored: mirrored,
    scaled: scaled,
    /* Picker order: user-specified top rows, then the rest by age. */
    skinIds: [
      'bot', 'snowman', 'capy',           // row 1
      'elephant', 'shark', 'duck',        // row 2
      'koala', 'panda', 'butterfly',      // row 3
      'skye', 'xbuddy', 'sunflower',      // row 4
      'cat', 'scout', 'melon'             // row 5
    ],
    skinLabel: function (id) {
      return (SKINS[id] && SKINS[id].label) || id;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
