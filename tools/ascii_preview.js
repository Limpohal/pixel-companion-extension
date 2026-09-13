#!/usr/bin/env node
/*
 * ascii_preview.js — render real PBArt frames in Node and print them as
 * ASCII so the sprite geometry can be eyeballed without a browser.
 *
 * Usage: node tools/ascii_preview.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const artPath = path.join(__dirname, '..', 'content', 'art.js');
vm.runInThisContext(fs.readFileSync(artPath, 'utf8'), { filename: 'art.js' });

const GRID = PBArt.GRID;

/* ---- recorder ctx that captures fillRect calls ---- */
function makeCtx() {
  const cells = [];
  for (let y = 0; y < GRID; y++) {
    cells.push(new Array(GRID).fill(null));
  }
  return {
    cells,
    fillRect(x, y, w, h) {
      var color = this.fillStyle;
      x = Math.round(x); y = Math.round(y);
      w = Math.round(w); h = Math.round(h);
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (xx >= 0 && xx < GRID && yy >= 0 && yy < GRID) {
            cells[yy][xx] = color;
          }
        }
      }
    }
  };
}

/* ---- color -> char ---- */
function charFor(c) {
  if (!c) return ' ';
  const solid = {
    '#3ec1d3': 'B', '#2a9db0': 'D', '#fffdf2': 'P', '#16213b': 'E',
    '#ff6b6b': 'r', '#ffb3b3': 'o', '#ffd166': 'F', '#c78f2e': 'K',
    '#ffd9d9': 'h', '#ffffff': 'W'
  };
  if (solid[c]) return solid[c];
  if (c.startsWith('rgba')) return '.';      // shadows / soft outlines
  return '?';
}

function render(opts) {
  const ctx = makeCtx();
  PBArt.draw(ctx, Object.assign({ shadow: true }, opts));
  return ctx.cells.map(row => row.map(charFor).join('')).join('\n');
}

/* ---- frames to inspect ---- */
const frames = [
  { label: 'walk  phase 0.00 (mid-stride L)', opts: { phase: 0.00, face: 'normal', arm: 'down' } },
  { label: 'walk  phase 0.25 (stride R)',     opts: { phase: 0.25, face: 'normal', arm: 'down' } },
  { label: 'walk  phase 0.50 (mid-stride R)', opts: { phase: 0.50, face: 'normal', arm: 'down' } },
  { label: 'idle  face=happy wave',           opts: { phase: 0, face: 'happy', arm: 'wave', wave: 0.3 } },
  { label: 'idle  face=love arm=up',          opts: { phase: 0, face: 'love', arm: 'up' } },
  { label: 'jump  face=surprise mouth=o',     opts: { phase: 0, face: 'surprise', mouth: 'o', arm: 'down' } },
  { label: 'flipped (facing=-1)',             opts: { phase: 0.25, face: 'normal', arm: 'down', facing: -1 } }
];

for (const f of frames) {
  console.log('\n=== ' + f.label + ' ===');
  console.log(render(f.opts));
}

/* ---- bounds check: ensure nothing clips the 64x64 box ---- */
let minX = 64, minY = 64, maxX = -1, maxY = -1;
const check = makeCtx();
PBArt.draw(check, { phase: 0.25, face: 'surprise', arm: 'wave', wave: 0.3 });
for (let y = 0; y < GRID; y++) {
  for (let x = 0; x < GRID; x++) {
    if (check.cells[y][x]) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
}
console.log('\n== bounds: x[' + minX + '..' + maxX + '] y[' + minY + '..' + maxY + '] (grid 64x64) ==');