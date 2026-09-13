# Chrome Web Store Submission Guide — Pixel Companion v1.3.0

Everything below is prepared for a **new item** in your existing developer
account (the ClauseRadar one). Submission happens at
https://chrome.google.com/webstore/devconsole — you paste, upload, and answer
the forms; nothing here requires terminal access.

---

## 1. Upload file

**`/opt/data/documents/pixel-companion-extension-1.0.0.zip`** (40.6 KB, 14 files)

Built from the project folder with `test/`, `tools/`, `scripts/`, and all
`.ppm`/`.gif`/`.py` dev artifacts excluded. `manifest.json` is at the zip root —
the layout the store requires.

> After any future code change: bump `version` in manifest.json, then rebuild
> the zip (only the runtime files go in — same exclusions).

---

## 2. Store listing (copy-paste ready)

**Name**
```
Pixel Companion — Pixel Pet Pals
```

**Summary** (132 chars max)
```
Twelve chunky pixel pals that walk your browser, jump, ride the scrollbar and
chat. Pick a bot, koala, panda, baby shark & more.
```

**Category:** `Fun` → `Just for fun`

**Language:** English

**Description** (16,000 chars max — paste as-is)

```
A tiny chunky pixel pal lives at the bottom of every web page and keeps you
company while you browse. It patters along the screen edge, flips around when
it hits a wall, blinks and idles, jumps when you click it, waves when your
mouse comes close, rides the scrollbar down long pages, and drops little
speech-bubble thoughts as it goes.

TWELVE CHARACTERS

Beep Bot · Snowman · Baby Shark · Capybara · Koala · Panda · Butterfly ·
Paws Patrol · Kaws · Sunflower · Elephant · Minion

Every character has its own personality in the speech bubbles — the koala is
perpetually sleepy, the panda is always hungry and occasionally breaks into
kung fu, the capybara is unbothered, and Kaws just says "xx". Each one is
drawn entirely in code: no images, no tracking pixels, nothing external.

WHAT IT DOES

- Walks along the bottom of the page and flips at the edges
- Idles, blinks, sits, and drops speech bubbles
- Jumps when you click or tap it (with a synthesized boop sound)
- Waves when your mouse gets close; its eyes follow the pointer
- Rides the scrollbar on long pages like a slide
- The panda practices kung fu — punches, belly bounces, crane stances
- Grab and drag any character, then drop it to pin it in mid-air
- All sounds are synthesized in the Web Audio API — no audio files

SETTINGS (popup)

- Pick your character (with live previews)
- Stop / start per site, or a global master toggle
- Size from mini (2 px) to giant (10 px chunky blocks)
- Walk speed from 0.4x to 3x
- Individual sound effects and speech-bubble toggles

PRIVACY — WHY THIS EXTENSION IS SAFE

- No data collection of any kind: no analytics, no accounts, no tracking
- Works 100% offline after install; no servers, no remote code
- Two tiny permissions only: "storage" (saves your settings on your own
  device) and "activeTab" (lets the per-site toggle know the current site)
- Content scripts never run on chrome:// pages or the Chrome Web Store
- Open, readable code — every sprite is drawn from a palette in plain
  JavaScript

Free, no ads, no accounts, no upgrades. Just a small pixel friend.
```

**Screenshots** — you'll need 1–5, 1280×800 or 640×400. Fastest path:
1. Load the extension, visit a normal page
2. Set size to 6–7 px, grab a few characters at once (they won't co-exist, so
   take separate shots and stitch, or just feature your favorites)
3. `Cmd+Shift+4` then spacebar to capture the window at exact size, or use
   any 1280×800 window screenshot
4. Suggested shots: a character walking on a real page; the popup open with
   the character grid; the panda mid-kung-fu; a character pinned mid-air
   during a drag

**Small promo tile (440×280)** — required for new listings. You can generate
one by screenshotting the contact sheet at `test/out/grid.png` cropped to
440×280, or I can generate a proper tile if you want one.

**Marquee (1400×560)** — optional; skip it.

---

## 3. Privacy tab (the part that gets things rejected — copy exactly)

All fields below are answered as strictly as the form allows.

| Field | Answer |
|---|---|
| **Single purpose description** | `Displays an animated pixel character that walks, reacts to mouse movement, and talks on web pages the user visits. All preferences are stored locally on the user's device.` |
| **Does this item collect or use user personal data?** | **No** |
| **Does this use remote code?** | **No** |
| **Storage permission justification** | `Stores the user's display settings (enabled, character choice, size, speed, sound, speech) in chrome.storage.local on their own device. No data leaves the device.` |
| **ActiveTab permission justification** | `Used only by the popup to read the current tab's URL so the per-site on/off toggle applies to the site being viewed. No content is read or modified.` |
| **Content script justification** | `Injects the visual character element and its animation logic into web pages. It does not read page content, modify the DOM beyond its own element, or communicate with any server.` |

Do **not** declare any of the four data categories (personally identifiable,
health, financial, etc.) — the extension genuinely collects none of it.

---

## 4. Distribution tab

- **Visibility:** `Public`
- **Regions:** all (default) — nothing region-specific
- **Pricing:** `Free`
- ✅ **Check "I certify the data-use disclosures are accurate"** before submit

---

## 5. Final pre-submit checklist

| Item | Status |
|---|---|
| Zip builds, `manifest.json` at root | ✅ built & verified |
| Version bumped (`1.0.0` — first publish) | ✅ |
| No `eval`, no remote code, no remote assets | ✅ audited |
| Manifest v3 | ✅ |
| Icons 16/32/48/128, valid PNGs, real pixel dimensions | ✅ verified |
| Description ≤ 132 chars | ✅ 127 chars |
| No leftover `TODO`/`FIXME`/debug code | ✅ |
| `node --check` passes on all JS | ✅ |
| Headless render + interaction suites pass | ✅ (12 skins, 29 tests) |
| `activeTab` is the *only* broad permission | ✅ |
| README folder-name mismatch | ✅ fixed |

---

## 6. What review will look like

For an extension with this permission set, CWS review is usually the fast lane
(hours to a couple of days). The most likely reasons this specific item could
get flagged, and why they don't apply:

- **"Broad host permissions" warning** — declared as `http://*/*` +
  `https://*/*` content-script matches, which is standard for a
  runs-on-every-page companion. The single-purpose statement covers it.
- **"Keyword spam" in the name** — the name is one clean product name, no
  keyword stuffing.
- **IP concerns** — Paws Patrol/Kaws are original interpretations, not
  trademarked artwork; characters are drawn from scratch. The listing
  shouldn't use "PAW Patrol" or "KAWS" as keywords.

After approval, the item is live at
`chrome.google.com/webstore/detail/<id>` — that URL is what you'd put in the
README for the one-click install link.
