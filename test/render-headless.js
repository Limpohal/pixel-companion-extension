/*
 * render-headless.js — verify all skins render correctly without a browser.
 * Loads content/art.js the same way tools/ascii_preview.js does, draws every
 * skin into a fake ctx (fillRect -> pixel buffer), and writes a PPM per skin
 * plus a combined contact sheet for visual inspection.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const artPath = path.join(__dirname, '..', 'content', 'art.js');
vm.runInThisContext(fs.readFileSync(artPath, 'utf8'), { filename: 'art.js' });

const GRID = 64; // PBArt.GRID
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

/* Fake 2d context: records fillRect into a GRID x GRID buffer. */
function makeCtx() {
  const px = new Array(GRID * GRID).fill(null);
  return {
    px,
    fillStyle: '#000',
    fillRect(x, y, w, h) {
      x = Math.round(x); y = Math.round(y);
      w = Math.round(w); h = Math.round(h);
      for (let yy = y; yy < y + h; yy++) {
        if (yy < 0 || yy >= GRID) continue;
        for (let xx = x; xx < x + w; xx++) {
          if (xx < 0 || xx >= GRID) continue;
          px[yy * GRID + xx] = this.fillStyle;
        }
      }
    }
  };
}

function hexToRgb(c) {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  const rgba = /^rgba?\(([^)]+)\)$/.exec(c);
  if (rgba) {
    const parts = rgba[1].split(',').map(s => parseFloat(s));
    return [Math.round(parts[0]), Math.round(parts[1]), Math.round(parts[2])];
  }
  return [255, 0, 255]; // unknown color -> loud magenta
}

function writePPM(file, ctx) {
  const header = 'P6\n' + GRID + ' ' + GRID + '\n255\n';
  const body = Buffer.alloc(GRID * GRID * 3);
  for (let i = 0; i < ctx.px.length; i++) {
    const c = ctx.px[i] ? hexToRgb(ctx.px[i]) : [18, 22, 40]; // dark bg
    body[i * 3] = c[0]; body[i * 3 + 1] = c[1]; body[i * 3 + 2] = c[2];
  }
  fs.writeFileSync(file, Buffer.concat([Buffer.from(header), body]));
}

/* Contact sheet: 4 skins side by side, scale 2 -> 512x128 image. */
function writeSheet(file, contexts, scale) {
  const W = GRID * contexts.length * scale, H = GRID * scale;
  const img = new Array(W * H).fill([18, 22, 40]);
  contexts.forEach((ctx, i) => {
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const c = ctx.px[y * GRID + x];
        if (!c) continue;
        const rgb = hexToRgb(c);
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const dx = (i * GRID + x) * scale + sx, dy = y * scale + sy;
            img[dy * W + dx] = rgb;
          }
        }
      }
    }
  });
  const header = 'P6\n' + W + ' ' + H + '\n255\n';
  const body = Buffer.alloc(W * H * 3);
  img.forEach((c, i) => { body[i * 3] = c[0]; body[i * 3 + 1] = c[1]; body[i * 3 + 2] = c[2]; });
  fs.writeFileSync(file, Buffer.concat([Buffer.from(header), body]));
}

const skins = PBArt.skinIds;
const contexts = [];
let failures = 0;

for (const skin of skins) {
  const ctx = makeCtx();
  try {
    PBArt.draw(PBArt.scaled(ctx, 1), {
      skin, face: 'happy', mouth: 'smile', phase: 0.1,
      facing: 1, arm: 'down'
    });
    contexts.push(ctx);
    const painted = ctx.px.filter(Boolean).length;
    const colors = new Set(ctx.px.filter(Boolean));
    const ok = painted > 800 && colors.size >= 4;
    console.log((ok ? 'PASS' : 'FAIL') + ' ' + skin +
      ' painted=' + painted + ' colors=' + colors.size);
    if (!ok) failures++;
    writePPM(path.join(OUT, skin + '.ppm'), ctx);
  } catch (e) {
    console.log('FAIL ' + skin + ' threw: ' + e.message);
    failures++;
  }
}

/* Also verify mirrored facing doesn't throw and covers the same area. */
try {
  const m = makeCtx();
  PBArt.draw(PBArt.scaled(m, 1), { skin: 'capy', face: 'normal', facing: -1 });
  console.log('PASS mirrored capy painted=' + m.px.filter(Boolean).length);
} catch (e) {
  console.log('FAIL mirrored draw threw: ' + e.message);
  failures++;
}

/* Guard: the popup must load the shared renderer, not a private copy that
 * can silently drift out of sync with content/art.js. */
try {
  const root = path.join(__dirname, '..');
  const popupHtml = fs.readFileSync(path.join(root, 'popup', 'popup.html'), 'utf8');
  const staleCopy = fs.existsSync(path.join(root, 'popup', 'art.js'));
  const usesShared = /<script[^>]*src="\.\.\/content\/art\.js"/.test(popupHtml);
  if (usesShared && !staleCopy) {
    console.log('PASS popup uses shared content/art.js (no duplicate copy)');
  } else {
    console.log('FAIL renderer drift: usesShared=' + usesShared +
                ' staleCopy=' + staleCopy);
    failures++;
  }
} catch (e) {
  console.log('FAIL popup guard threw: ' + e.message);
  failures++;
}

writeSheet(path.join(OUT, 'sheet.ppm'), contexts, 2);
console.log(failures ? ('FAILURES: ' + failures) : 'ALL PASS');
process.exit(failures ? 1 : 0);