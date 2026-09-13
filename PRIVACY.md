# Privacy Policy — Pixel Companion

_Last updated: 2026-09-13_

## Short version

Pixel Companion collects **no user data**. Everything it does happens locally
in your browser. There is nothing to delete, export, or opt out of.

## What the extension does

Displays an animated pixel character that walks along the bottom of web
pages, reacts to mouse movement and clicks, and can show speech bubbles and
play synthesized sounds.

## What data is collected

**None.** The extension has:

- No analytics or telemetry
- No user accounts
- No advertising
- No tracking of any kind
- No network requests — it works entirely offline after install

## Permissions and why they exist

| Permission | Why |
|---|---|
| `storage` | Saves your settings (character choice, size, speed, sound/speech toggles) in `chrome.storage.local` — on your own device only. |
| `activeTab` | Lets the settings popup read the current tab's URL so the per-site on/off toggle works. No browsing history is read or stored. |

Content scripts run on web pages (`http`/`https`) to show the character.
They never run on `chrome://` pages or the Chrome Web Store, never read page
content, and never communicate with any server.

## Settings data

Your preferences (character, size, speed, toggles) are stored locally on your
device and never transmitted. Removing the extension removes that data.

## Changes

If this privacy policy changes, the updated version will be posted at this
URL with a new "last updated" date.

## Contact

Questions? [Open an issue](https://github.com/Limpohal/pixel-companion-extension/issues).
