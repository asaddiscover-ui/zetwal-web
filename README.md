# Zetwal AI — "The Room In Your Hand"

Marketing site for Zetwal AI. The hero is a scroll-scrubbed cinematic film: one
continuous forward push that starts in a professional recording studio at 2am,
travels down the mixing console, folds the room in on itself, compresses it into
a slab of light, and resolves into a phone running the app.

**Live:** _(add the Vercel URL once deployed)_

## How the film works

The film is **not a `<video>` tag**. It is a sequence of 301 JPEG frames drawn to
a canvas, with the frame index driven by scroll position. Video elements cannot
be scrubbed reliably across browsers — seeking is asynchronous, keyframe-bound,
and stutters badly under scroll — so the frames are decoded ahead of the playhead
and blitted directly.

Key implementation details, all measured rather than assumed:

- **Lerped playhead.** Scroll sets a target frame; the displayed frame eases
  toward it at `0.14`/frame. This is what makes it feel like film rather than a
  slideshow bound to the scroll wheel.
- **Decode-ahead window, not `createImageBitmap`.** Benchmarked on this footage:
  `createImageBitmap` costs ~8.8ms/frame plus ~4.1ms first-blit, while blitting a
  preloaded `<img>` costs ~0ms. Since every frame is preloaded, `img.decode()`
  keeps the window warm without paying for a second decoded copy.
- **Precomputed luminance.** The header flips dark/light against the footage
  behind it. Sampling the live canvas with `getImageData` forces a GPU→CPU
  readback every time, so each frame's top-strip luminance is computed once at
  load and the scroll path is a pure array lookup.
- **DPR capped to the source width.** Backing the canvas at more pixels than the
  1280px frames contain buys no detail and costs real fill.

Measured result: **p95 frame time 22ms**, one frame over 50ms across a full-page
scroll (down from p95 41.8ms on the first build).

## Cache policy

`vercel.json` sets this deliberately (the file carries no comments — Vercel's
schema rejects unknown keys, including `//`):

- `zetwal-film/frames/*` → `immutable, max-age=1y`. The frames never change once
  deployed and each build gets its own URL, so a repeat visit must not re-fetch
  20MB.
- `/` → `max-age=0, must-revalidate`. Otherwise a redeploy never reaches anyone
  who has already visited.

## Layout

```
index.html               the entire site — no build step, no framework
server.js                zero-dependency local dev server
vercel.json              edge cache headers for the frame sequence
zetwal-film/frames/      301 JPEGs at 1280px — the film (committed, ~20MB)
zetwal-film/assets/      raw clips, keyframes, encoded masters (gitignored, ~108MB)
```

The `assets/` directory holds the negatives: the five source clips, their first
and last frames, the junction comparison sheets, and the encoded masters. It is
deliberately not committed. To rebuild the frame sequence from those masters:

```bash
ffmpeg -i zetwal-film/assets/master.mp4 \
  -vf "select='not(mod(n\,2))',scale=1280:-2" -vsync vfr -q:v 4 \
  zetwal-film/frames/f_%04d.jpg
```

If the frame count changes, update `FRAME_COUNT` in `index.html`.

## Local development

```bash
node server.js 3000
```

Then open <http://localhost:3000>. HTML always revalidates so edits appear on
reload; frames are cached so reloads stay fast. The server supports Range
requests, so `/zetwal-film/assets/master.mp4` can be scrubbed directly in a tab.

**Dev contract:** append `?jump=<scrollY>` to land on an exact frame with no
scroll animation — `?jump=4050` is the fold. The page sets `window.__ready` once
settled, which is what the screenshot harness waits on.

## A note on the app interface

The phone UI shown in the film's final chapter and in the "The App" section is a
**stylised representation, not the real Zetwal interface** — it was generated
alongside the rest of the footage. The on-page device carries a visible
disclaimer to that effect. Replace both with real screenshots before treating
this as a product-accurate page.

## Credits

Film generated with Seedance 2.0 via Higgsfield, chained shot-to-shot so each
clip begins on the literal last frame of the previous one. Every junction was
SSIM-gated and then verified by eye — SSIM under-reads badly on film grain, and
two seams scored below the automated threshold while being visually seamless.
