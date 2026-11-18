# Keyi's Garden — 100 days of frames (3D)

A walkable 3D garden: every day is one flower, and its head carries that day's picture. Time becomes space —
day 1 stands at the entrance, day 100 in the deepest part, and the garden grows denser the further you go.
Days that have not happened yet are pale silhouettes waiting to be filled in.

Static site, no build step. Serve the folder (`python3 -m http.server`) and open `index.html`
(ES modules need http, not `file://`).

## The idea
You are a butterfly entering the garden. Every flower holds one day; where you land, the garden wakes in colour.

- **Prelude** – a quiet invitation (`#intro`) sits in front of the garden, which is already growing behind it. One button flies you in
  (a link to a single day, `#day-27`, skips it).
- **You open on the bird's eye**: all 100 days at once, laid out as twelve small constellations (rings, crescents, spirals,
  sunflower-like clusters) along one winding path, joined by faint threads like a star map. Day 1 is on the left, day 100 on the right.
- **A quieter way in: dust.** Under the button, a small, low-contrast line (*Not comfortable with butterflies?*) opens a sentence and a link,
  *Explore as Dust*. The same garden and camera, with a different companion: a tiny soft warm-white speck with a barely-there trace, no wings,
  no landing, no pollen and no trembling (the flower still wakes, glows and turns to colour when you settle on it). The main button always means
  butterfly. The choice (`visitorMode`: `"butterfly"` or `"dust"`) is kept for the browser session in `sessionStorage`
  (`keyis-garden:visitorMode`); `src/Visitor.js` reads and writes it, `src/Dust.js` is the speck, and `GardenScene.setVisitorMode()` applies it.
- **Your cursor is a butterfly** (mouse only). It flutters after the pointer, beats its wings faster while travelling, and lands on the
  flower you hover; the flower answers with a ring of light and a little pollen.
- **Click a flower to land on it.** The camera descends and the day opens in two halves: on the left the flower itself, its head turned into the
  full-colour photograph (solid, not translucent, drawn above everything else, with the flowers that stood in front of it faded away); on the right
  the day's sketch as the panel's main picture, with the date, the note and previous / next. The flower stays awake in colour for as long as you stay on the page, counted top right ("3 of 44 flowers awake") and lit gold on the timeline; **a refresh starts every flower as a black-and-white sketch again** (nothing is stored). "reset" (hover the counter) lets the garden sleep again.
  There is no pollen after a click; only hovering stirs a little.
- **Bird's eye** *(the way in)* – high above, slightly tilted, the whole field at once; every picture face-up. Days still to come are pale hollow silhouettes.
  It is a real place to explore: **scroll / pinch** draws nearer or further (anchored to the pointer, bounded: never so near the composition
  breaks, never so far it is unreadable), **drag / two-finger swipe / arrow keys / Shift+scroll** drift across the field (bounded too).
  Choosing "Bird's eye" again re-frames the whole field.
- **Overview** – standing on a hill: up, pulled back, looking diagonally across the garden.
- **Explore** – on the ground, at the height of the flowers: one day at a time.
One camera eases between designed viewpoints (`CameraController.js`); click any flower from any view to descend into that
day, and "Back to the garden" returns you to the view you left. `Esc` steps back to the bird's eye. Vertical control stays limited:
`Shift`/`Alt` + scroll, or dragging up/down, lifts the camera a little while exploring.

## Controls
- **Scroll / ↑ ↓ / swipe**: walk deeper or back (slow, eased). Mouse only tilts the view a little; drag turns your head.
- **Hover** a flower: it wakes (turns to you, brightens, glows) and shows the day and date.
- **Click / tap**: the camera flies to the flower and the day opens (photo, date, note, sketch, previous / next).
  Esc or "Back to the garden" returns you to where you were. Each day has a link: `#day-27`.
- **Timeline** (bottom): Day 01 ——— Day 100. Lit ticks are the days in view; click one to walk there.

## Code map (`src/`)
| file | job |
|---|---|
| `main.js` | boots the scene, WebGL fallback |
| `GardenScene.js` | assembles everything, hover / click, UI wiring, adaptive resolution |
| `Intro.js` | the prelude page |
| `Butterfly.js`, `Dust.js`, `Pollen.js` | the two possible visitors (butterfly cursor / speck of dust), and the pollen a butterfly stirs up |
| `Visitor.js` | the chosen visitor mode, kept for the session |
| `Visits.js` | which flowers have been awakened during this visit (not remembered across a refresh) |
| `layout.js` | where each day lives: twelve constellations (ring / arc / spiral / cluster) along a winding path, two clearings; terrain height |
| `FlowerField.js` | maps the day data onto `Flower`s, instanced stems / leaves / shadows / seedlings, lazy texture loading |
| `Flower.js` | one flower: stem, leaves, round picture head, hover animation |
| `CameraController.js` | the three views (presets + eased transitions), scroll walking, parallax, drag, fly-to-flower |
| `ViewSwitcher.js` | the Explore / Overview / Bird's eye control |
| `Terrain.js`, `Atmosphere.js` | ground, hills, sky, light, fog, grass, floating motes |
| `DayOverlay.js`, `ProgressIndicator.js` | the day panel and the timeline (HTML, outside the 3D scene) |

Three.js r187 is vendored in `vendor/` (MIT, no npm needed).

## Typography
Two local fonts, both SIL Open Font License, loaded with `@font-face` from `fonts/` (no Google Fonts, no CDN):
- **Lavishly Yours** (`fonts/LavishlyYours-Regular.ttf`, `--display`): the way-in title and button, the top-left signature, the day's title.
- **Comic Neue** (`fonts/ComicNeue-Regular.ttf`, `--body`): everything that is read or used: notes, dates, hints, buttons, the timeline.
Neither has bold, italic or arrow glyphs, so `font-synthesis: none` is set (no faked styles) and the arrows are small inline SVGs.
Text is written in normal capitalisation; there is no `text-transform: uppercase` anywhere.

## Adding days
1. Put the sketch and photo in the upload folder as `<n>s Large.jpeg` and `<n>p Large.jpeg`.
2. `python3 tools/build_garden.py "S for Sketches；P for Photos"` makes the web-sized photo, the transparent sketch
   the two round flower-head textures (`assets/heads/dayNN.webp` ink, `dayNN-color.webp` for awakened flowers), and rewrites `data.js`. Existing outputs are kept (`--rebuild` redoes all).
3. Titles / notes: `captions.json` → `{"27": {"title": "...", "caption": "..."}}`, then run the script again.
4. `python3 tools/bump_version.py` before pushing, so browsers fetch the new files.

Settings (title, `startDate` that dates every day) are in `config.js`.
