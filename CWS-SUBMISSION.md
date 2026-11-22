# Chrome Web Store Submission Guide — Pixel Companion v1.1.0

Everything below is prepared for a **new item** in your existing developer
account (the ClauseRadar one). Submission happens at
https://chrome.google.com/webstore/devconsole — you paste, upload, and answer
the forms; nothing here requires terminal access.

---

## 1. Upload file

**`pixel-companion-extension-1.1.0.zip`** (built from this folder — 14 runtime files)

Built from the project folder with `test/`, `tools/`, `scripts/`, and all
`.ppm`/`.gif`/`.py` dev artifacts excluded. `manifest.json` is at the zip root —
the layout the store requires.

> After any future code change: bump `version` in manifest.json, update this
> guide's title to match, then rebuild the zip (only the runtime files go in —
> same exclusions).

---

## 2. Store listing (copy-paste ready)

**Name** (must equal `name` in manifest.json — the store shows the manifest's)
```
Pixel Companion
```

**Summary** (132 chars max)
```
Fifteen chunky pixel pals that walk your browser, boing, ride the scrollbar and
chat. Pick a bot, koala, panda, baby shark & more.
```

**Category:** `Fun` → `Just for fun`

**Language:** English

**Description** (16,000 chars max — paste as-is)

```
A tiny chunky pixel pal lives at the bottom of every web page and keeps you
company while you browse. It patters along the screen edge, flips around when
it hits a wall, blinks and idles, squashes and boings when you poke it, turns
to face your cursor and waves when you hover, rides the scrollbar down long
pages, and drops little speech-bubble thoughts as it goes.

FIFTEEN CHARACTERS

Beep Bot · Snowman · Baby Shark · Capybara · Koala · Panda · Butterfly ·
Aviator Pup · X-Buddy · Sunflower · Elephant · Minion · Oyen · Scout Pup ·
Watermelon

Every character has its own personality in the speech bubbles — the koala is
perpetually sleepy, the panda is always hungry and occasionally breaks into
kung fu, the capybara is unbothered, X-Buddy just says "xx", Scout Pup salutes
at everything, and Oyen the ginger cat is permanently unimpressed. Each one is
drawn entirely in code: no images, no tracking pixels, nothing external.

WHAT IT DOES

- Walks along the bottom of the page and flips at the edges
- Idles, blinks, sits, and drops speech bubbles
- Squashes and boings when you click or tap it (synthesized sound, no files)
- Turns to face your cursor when it comes near; waves when you hover over it
- Rides the scrollbar on long pages like a slide
- Four of them have their own routine: the panda's kung fu, Oyen's big
  stretch, Scout Pup's salute and the watermelon's seed spit
- The watermelon is limbless: it hovers above the floor and bounces along
  instead of walking
- Grab and drag any character, then drop it to pin it in mid-air
- All sounds are synthesized in the Web Audio API — no audio files

SETTINGS (popup)

- Pick your character (with live previews), or hit "Surprise me" and let the
  picker roll to a random pal
- Stop / start per site, or a global master toggle
- Size from mini (2 px) to giant (10 px chunky blocks)
- Walk speed from 0.4x to 3x
- Individual sound effects and speech-bubble toggles
- Light, dark or follow-system look — the popup and speech bubbles both match

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

**Screenshots** — you'll need 1–5, 1280×800 or 640×400.

`assets/shot-0-roster.png` is a ready-made 1280×800 showing all fifteen
characters (rendered from `content/art.js`, so it can never drift from the
sprite data). Upload it as screenshot #1.

To regenerate the store art after a character change, open
`tools/store-art.html?shot=roster` (`promo`, `marquee`) in a browser at the
asset's exact size (1280×800, 440×280, 1400×560) and screenshot it.

For the rest, fastest path:
1. Load the extension, visit a normal page
2. Set size to 6–7 px, grab a few characters at once (they won't co-exist, so
   take separate shots and stitch, or just feature your favorites)
3. `Cmd+Shift+4` then spacebar to capture the window at exact size, or use
   any 1280×800 window screenshot
4. Suggested shots: a character walking on a real page; the popup open with
   the character grid; the panda mid-kung-fu; Scout Pup saluting mid-hop;
   the watermelon mid-seed-spit

**Small promo tile (440×280)** — required for new listings.
`assets/promo-tile-440x280.png` is already generated.

**Marquee (1400×560)** — optional; `assets/marquee-tile-1400x560.png` is
already generated.

---

## 3. Privacy tab (the part that gets things rejected — copy exactly)

All fields below are answered as strictly as the form allows.

| Field | Answer |
|---|---|
| **Single purpose description** | `Displays an animated pixel character that walks, reacts to mouse movement, and talks on web pages the user visits. All preferences are stored locally on the user's device.` |
| **Does this item collect or use user personal data?** | **No** |
| **Does this use remote code?** | **No** |
| **Storage permission justification** | `Stores the user's display settings (enabled, character choice, size, speed, sound, speech, theme) in chrome.storage.local on their own device. No data leaves the device.` |
| **ActiveTab permission justification** | `Used only by the popup to read the current tab's URL so the per-site on/off toggle applies to the site being viewed. No content is read or modified.` |
| **Content script justification** | `Injects the visual character element and its animation logic into web pages. It does not read page content, modify the DOM beyond its own element, or communicate with any server.` |

Do **not** declare any of the four data categories (personally identifiable,
health, financial, etc.) — the extension genuinely collects none of it.

**Privacy policy URL** — the form may still ask for one even with "no data
collected". Use the public repo copy:
`https://github.com/Limpohal/pixel-companion-extension/blob/master/PRIVACY.md`


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
| Version bumped (`1.1.0` — adds Scout Pup + Watermelon) | ✅ |
| No `eval`, no remote code, no remote assets | ✅ audited |
| Manifest v3 | ✅ |
| Icons 16/32/48/128, valid PNGs, real pixel dimensions | ✅ verified |
| Summary ≤ 132 chars | ✅ 130 chars |
| Manifest `description` ≤ 132 chars | ✅ 129 chars |
| No leftover `TODO`/`FIXME`/debug code | ✅ |
| `node --check` passes on all JS | ✅ |
| Headless render + boot + interaction suites pass | ✅ (15 skins, 1200 poses, 81 interaction + 21 boot assertions) |
| Pre-submit audit (manifest, runtime set, zip hashes, safety, docs) | ✅ 64 checks |
| Stress + cost suite | ✅ 60k frames / 300 toggle cycles, no leaks; sprite draw 0.07 ms avg |
| Popup fits Chrome's 600 px popup cap | ✅ 591 px |
| Real-Chrome smoke page | ✅ 60 fps at size 10 / speed 3, flat heap, no console errors, no external requests |
| 1280×800 roster screenshot ready | ✅ `assets/shot-0-roster.png` |
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
- **IP concerns** — the listing uses exactly the fifteen labels the extension
  ships (`PBArt.skinIds` in `content/art.js`); the two that once carried
  third-party-sounding working names were renamed to Aviator Pup and X-Buddy
  in `394d39e`, so don't reintroduce "PAW Patrol", "KAWS" or similar as
  keywords. Every character is drawn from scratch, not traced or copied.
  Scout Pup is an original beagle scout — it is deliberately *not* named
  "Snoopy", and its sprite is not traced from the Peanuts character; the same
  goes for the Watermelon and for Oyen, which is an original ginger tabby
  inspired by the fat-cat archetype rather than a Garfield clone. Don't
  relabel any of them after a licensed character.
  One label is a known, deliberate exception: the duck's display label is
  "Minion" (its id stays `duck`). The owner reviewed the trademark question
  and chose to keep it — see the comment above `label:` in `content/art.js`.
  Don't "correct" it without asking.

After approval, the item is live at
`chrome.google.com/webstore/detail/<id>` — that URL is what you'd put in the
README for the one-click install link.
