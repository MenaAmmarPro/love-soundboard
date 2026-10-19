# Our Soundboard — Love for Mena

An inside-joke **soundboard**: a grid of pads, each playing a sound
**synthesised live** in the browser with the Web Audio API. Tap, stack and
**record** little sequences, replay them, and make your own pads. Part of the
**Love for Mena** collection.

**Live:** https://menaammarpro.github.io/love-soundboard/

## What it does

- A grid of **pads**; tap one to hear its sound.
- Each pad is a live **oscillator** — frequency (40–4000 Hz), waveform
  (sine / square / sawtooth / triangle) and duration (0.05–2 s). **No audio
  files at all.**
- **Add / rename / delete** pads, pick a pitch, length, waveform and colour.
- A **sequence recorder**: press **Record**, tap pads, then **Play** it back —
  with an optional **Loop**.
- Five pad colours (white-forward), a **colours** on/off toggle.
- Everything is stored on the device only — no tracking, no network calls.
- Installable PWA with offline support.

## How it works

Every sound is a short oscillator + gain envelope, so nothing is downloaded.
Tap a pad to play it; turn on **Edit pads** to open a pad in the editor.

Data lives in `localStorage` under `mena-soundboard`:
`{ pads: [{ id, name, freq, wave, dur, color }], seq: [{ padId, at }], loop, colours }`.
Change the starter pads in `defaultPads()` at the top of `js/app.js`.

Pure logic (pitch/duration clamping, pad editing, id generation, sequence
recording, encode/decode) is exposed on `window.MenaSoundboard` and covered by
`test/harness.js`:

```powershell
node test/harness.js
```

## Files

- `index.html` — the page
- `css/theme.css` — shared love-theme (copied from `_love-theme/`)
- `css/app.css` — page-specific styles
- `js/theme-main.js`, `js/effects.js` — shared behaviour/effects
- `js/app.js` — soundboard logic (`window.MenaSoundboard`)
- `tools/make-icons.js` — dependency-free icon generator
- `manifest.webmanifest`, `sw.js` — PWA
- `assets/` — favicon and icons

## Run locally

```powershell
py -m http.server 8000
```

Then visit http://localhost:8000.

## Deploy

Static site, deployed with GitHub Pages from `main`.

## License

Creative Commons BY-NC-ND 4.0 — see [`LICENSE`](LICENSE).
© 2026 Ammar (MenaAmmarPro). Made with care for Mena.
