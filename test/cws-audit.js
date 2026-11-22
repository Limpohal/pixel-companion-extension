/*
 * cws-audit.js — pre-submission audit for the packaged extension.
 *
 * Checks the things that get a Chrome Web Store upload rejected or that silently
 * diverge from the docs:
 *   1. manifest validity and required fields;
 *   2. the runtime file set — every reference exists, nothing extra ships;
 *   3. the zip: same 14 files as the working tree, no dev artifacts, hashes match;
 *   4. static safety — no eval / remote code / network / debug leftovers;
 *   5. icons and store assets have the real pixel dimensions the store expects;
 *   6. docs consistency — character labels, version strings, permission lists,
 *      image links, and the CWS copy-paste strings.
 *
 * Run: node test/cws-audit.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHIPPED_EXT = ['.js', '.html', '.css', '.json'];
let pass = 0, fail = 0;
const problems = [];

function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else {
    fail++;
    problems.push(label + (detail ? '  -> ' + detail : ''));
    console.log('  FAIL ' + label + (detail ? '  -> ' + detail : ''));
  }
}

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

function pngSize(rel) {
  const b = fs.readFileSync(path.join(ROOT, rel));
  if (b.slice(1, 4).toString() !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/* ---------------------------------------------------------------- *
 * 1. manifest
 * ---------------------------------------------------------------- */
console.log('\nMANIFEST');
const manifest = JSON.parse(read('manifest.json'));
ok('manifest parses as JSON', true);
ok('manifest_version is 3', manifest.manifest_version === 3, manifest.manifest_version);
ok('name present and <= 45 chars',
   typeof manifest.name === 'string' && manifest.name.length > 0 && manifest.name.length <= 45,
   String(manifest.name).length);
ok('version is a valid 1-4 part dotted number',
   /^\d+(\.\d+){0,3}$/.test(String(manifest.version)), manifest.version);
ok('description <= 132 chars',
   typeof manifest.description === 'string' && manifest.description.length <= 132,
   String(manifest.description).length);
const allowedPerms = ['storage', 'activeTab'];
const extraPerms = (manifest.permissions || []).filter(p => allowedPerms.indexOf(p) === -1);
ok('permissions stay within storage + activeTab', extraPerms.length === 0, extraPerms.join());
ok('no host_permissions key (content_scripts matches are enough)',
   !manifest.host_permissions, JSON.stringify(manifest.host_permissions));
ok('no update_url / externally_connectable / remote CSP',
   !manifest.update_url && !manifest.externally_connectable &&
   !manifest.content_security_policy, 'unexpected manifest key');
ok('action.default_popup set', !!(manifest.action && manifest.action.default_popup),
   JSON.stringify(manifest.action));

const cs = (manifest.content_scripts || [])[0] || {};
ok('one content script entry, http/https only',
   (manifest.content_scripts || []).length === 1 &&
   cs.matches && cs.matches.length === 2 &&
   cs.matches.every(m => /^(http|https):\/\/\*\/\*$/.test(m)),
   JSON.stringify(cs.matches));
ok('content script runs at document_idle', cs.run_at === 'document_idle', cs.run_at);
const loadOrder = ['art.js', 'character.js', 'synth.js', 'speech.js', 'behaviors.js', 'content.js'];
ok('content scripts load in dependency order',
   cs.js && cs.js.length === 6 &&
   cs.js.every((f, i) => path.basename(f) === loadOrder[i]),
   JSON.stringify(cs.js));

/* ---------------------------------------------------------------- *
 * 2. runtime file set
 * ---------------------------------------------------------------- */
console.log('\nRUNTIME FILE SET');
const runtime = new Set(['manifest.json']);
for (const p of Object.values(manifest.icons || {})) runtime.add(p);
for (const p of Object.values((manifest.action && manifest.action.default_icon) || {})) runtime.add(p);
if (manifest.action && manifest.action.default_popup) runtime.add(manifest.action.default_popup);
for (const js of cs.js || []) runtime.add(js);

/* popup.html references: local scripts and stylesheets */
const popupHtml = read(manifest.action.default_popup);
for (const m of popupHtml.matchAll(/<(?:script|link)[^>]*(?:src|href)="([^"]+)"/g)) {
  const ref = path.normalize(path.join(path.dirname(manifest.action.default_popup), m[1]));
  runtime.add(ref);
}
for (const f of runtime) {
  ok('referenced file exists: ' + f, exists(f));
}
ok('runtime file count is exactly 14', runtime.size === 14, runtime.size + ': ' +
   [...runtime].sort().join(', '));

/* ---------------------------------------------------------------- *
 * 3. zip
 * ---------------------------------------------------------------- */
console.log('\nZIP');
const zipName = `pixel-companion-extension-${manifest.version}.zip`;
const zipPath = path.join(ROOT, zipName);
ok('zip named to match the manifest version exists', exists(zipName), zipName);
let entries = [];
if (exists(zipName)) {
  entries = execFileSync('unzip', ['-Z1', zipName], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean).filter(e => !e.endsWith('/'));
  const entrySet = new Set(entries);
  ok('zip contains exactly the 14 runtime files', entries.length === 14, entries.length);
  const missing = [...runtime].filter(f => !entrySet.has(f));
  const extra = entries.filter(f => !runtime.has(f));
  ok('zip has no missing runtime files', missing.length === 0, missing.join());
  ok('zip has no dev artifacts (test/, tools/, assets/, docs)', extra.length === 0, extra.join());
  ok('manifest.json sits at the zip root', entrySet.has('manifest.json'));

  /* hash every entry against the working tree */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pbc-audit-'));
  execFileSync('unzip', ['-qq', zipPath, '-d', tmp]);
  const crypto = require('crypto');
  const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const diffs = entries.filter(f => sha(path.join(ROOT, f)) !== sha(path.join(tmp, f)));
  ok('every zip entry matches the working tree byte-for-byte', diffs.length === 0, diffs.join());
  ok('zip has no __MACOSX / .DS_Store entries',
     !entries.some(f => /(__MACOSX|\.DS_Store)/.test(f)));
  fs.rmSync(tmp, { recursive: true, force: true });
}

/* ---------------------------------------------------------------- *
 * 4. static safety of shipped code
 * ---------------------------------------------------------------- */
console.log('\nSTATIC SAFETY');
const shipped = [...runtime].filter(f => SHIPPED_EXT.indexOf(path.extname(f)) !== -1);
function codeLines(rel) {
  return read(rel).split('\n').map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') ||
               t.startsWith('<!--'));
    });
}
const bad = [];
for (const rel of shipped) {
  for (const { line, n } of codeLines(rel)) {
    if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(line)) bad.push(`${rel}:${n} eval/Function`);
    if (/set(Timeout|Interval)\s*\(\s*['"]/.test(line)) bad.push(`${rel}:${n} string timer`);
    if (/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource)\s*\(/.test(line)) bad.push(`${rel}:${n} network API`);
    if (/\bimportScripts\s*\(|\bimport\s*\(/.test(line)) bad.push(`${rel}:${n} dynamic import`);
    if (/console\.(log|debug|warn|error|info)\s*\(/.test(line)) bad.push(`${rel}:${n} console.*`);
    if (/\bdebugger\b/.test(line)) bad.push(`${rel}:${n} debugger`);
    if (/\b(TODO|FIXME|XXX)\b/.test(line)) bad.push(`${rel}:${n} TODO/FIXME`);
  }
}
ok('no eval / Function / string timers / network APIs / console / debugger / TODOs',
   bad.length === 0, bad.slice(0, 6).join(' | '));

const external = [];
for (const rel of shipped) {
  for (const { line, n } of codeLines(rel)) {
    /* the manifest's host match pattern is not an external URL */
    if (/https?:\/\/(?!\*\/)[A-Za-z0-9.-]/.test(line)) external.push(`${rel}:${n}`);
  }
}
ok('no absolute external URLs in shipped code', external.length === 0, external.join());

ok('popup has no inline <script> blocks',
   !/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(popupHtml));
ok('popup has no inline event handlers (onclick=, onload=, ...)',
   !/\son[a-z]+\s*=/i.test(popupHtml));
ok('popup has no remote stylesheet/script refs',
   !/(src|href)="(https?:)?\/\//i.test(popupHtml));

/* popup wiring: every element popup.js looks up must exist, and the popup
   must use the shared sprite renderer rather than a drifting copy */
const popupJs = read('popup/popup.js');
const htmlIds = new Set([...popupHtml.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const lookedUp = [...popupJs.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)].map(m => m[1]);
const missingIds = [...new Set(lookedUp)].filter(id => !htmlIds.has(id));
ok('every getElementById in popup.js has a matching id in popup.html',
   missingIds.length === 0, missingIds.join());
ok('popup uses the shared content/art.js renderer',
   /<script[^>]*src="\.\.\/content\/art\.js"/.test(popupHtml) && !exists('popup/art.js'));

/* CSS: balanced blocks and every custom property used is defined */
const popupCss = read('popup/popup.css');
const opens = (popupCss.match(/{/g) || []).length;
const closes = (popupCss.match(/}/g) || []).length;
const defined = new Set([...popupCss.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1]));
const used = new Set([...popupCss.matchAll(/var\((--[a-z0-9-]+)\)/gi)].map(m => m[1]));
const undefinedVars = [...used].filter(v => !defined.has(v));
ok('popup.css braces balanced', opens === closes, opens + ' open / ' + closes + ' close');
ok('every CSS custom property used is defined', undefinedVars.length === 0,
   undefinedVars.join());

/* ---------------------------------------------------------------- *
 * 5. icons and store assets
 * ---------------------------------------------------------------- */
console.log('\nICONS + STORE ASSETS');
for (const [size, rel] of Object.entries(manifest.icons || {})) {
  const dim = pngSize(rel);
  ok(`icon ${size} is a real ${size}x${size} PNG`,
     dim && dim.w === Number(size) && dim.h === Number(size),
     dim ? `${dim.w}x${dim.h}` : 'unreadable');
}
const shots = [
  ['assets/store-icon-128.png', 128, 128],
  ['assets/shot-0-roster.png', 1280, 800],
  ['assets/promo-tile-440x280.png', 440, 280],
  ['assets/marquee-tile-1400x560.png', 1400, 560]
];
for (const [rel, w, h] of shots) {
  const dim = exists(rel) ? pngSize(rel) : null;
  ok(`store asset ${path.basename(rel)} is ${w}x${h}`,
     dim && dim.w === w && dim.h === h, dim ? `${dim.w}x${dim.h}` : 'missing');
}

/* ---------------------------------------------------------------- *
 * 6. docs consistency
 * ---------------------------------------------------------------- */
console.log('\nDOCS');
const art = read('content/art.js');
const labels = [...art.matchAll(/label:\s*'([^']+)'/g)].map(m => m[1]);
const skinBlock = art.slice(art.indexOf('skinIds: ['), art.indexOf('],', art.indexOf('skinIds: [')));
const ids = [...skinBlock.matchAll(/'([a-z]+)'/g)].map(m => m[1]);
ok('fifteen skins with labels', labels.length === 15 && ids.length === 15,
   `${labels.length} labels / ${ids.length} ids`);

const readme = read('README.md');
const cws = read('CWS-SUBMISSION.md');
const privacy = read('PRIVACY.md');
const missingReadme = labels.filter(l => readme.indexOf(l) === -1);
const missingCws = labels.filter(l => cws.indexOf(l) === -1);
ok('README lists every skin label', missingReadme.length === 0, missingReadme.join());
ok('CWS listing lists every skin label', missingCws.length === 0, missingCws.join());
ok('no retired characters mentioned anywhere',
   !/\bfrog\b|\bdragon\b|\btwelve characters\b/i.test(readme + cws));
ok('README says fifteen characters',
   /fifteen/i.test(readme) || /15 characters/i.test(readme));

ok('manifest version appears in the CWS guide title and zip name',
   cws.indexOf('v' + manifest.version) !== -1 &&
   cws.indexOf(zipName) !== -1, manifest.version);
ok('CWS guide declares the 14 runtime files', /14 runtime files/.test(cws));
ok('CWS guide permission justification names storage and activeTab',
   cws.indexOf('storage') !== -1 && cws.indexOf('activeTab') !== -1);
ok('privacy policy names storage and activeTab',
   privacy.indexOf('storage') !== -1 && privacy.indexOf('activeTab') !== -1);
ok('privacy policy claims no data collection',
   /no user data|No data collection/i.test(privacy));

/* README image references resolve — markdown images AND raw <img> tags, since
   the screenshot gallery uses <img src="..."> and a moved asset broke it once */
const mdImgs = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1]);
const htmlImgs = [...readme.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1]);
const imgRefs = mdImgs.concat(htmlImgs).filter(r => !/^(https?:)?\/\//.test(r));
const missingImgs = imgRefs.filter(r => !exists(r));
ok('every README image link resolves (markdown + <img>)', missingImgs.length === 0,
   missingImgs.join());
ok('LICENSE is present and MIT', exists('LICENSE') && /MIT/i.test(read('LICENSE')));
ok('version in manifest matches the zip name',
   zipName === `pixel-companion-extension-${manifest.version}.zip`);

/* ---------------------------------------------------------------- *
 * summary
 * ---------------------------------------------------------------- */
console.log('\n' + pass + ' checks passed, ' + fail + ' failed');
if (fail) {
  console.log('\nProblems:');
  for (const p of problems) console.log(' - ' + p);
}
process.exit(fail ? 1 : 0);
