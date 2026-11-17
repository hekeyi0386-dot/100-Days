# Keyi's Garden — 100 days of frames (3D)

A walkable 3D garden: every day is one flower, and its head carries that day's picture. Time becomes space —
day 1 stands at the entrance, day 100 in the deepest part, and the garden grows denser the further you go.
Days that have not happened yet are pale silhouettes waiting to be filled in.

Static site, no build step. Serve the folder (`python3 -m http.server`) and open `index.html`
(ES modules need http, not `file://`).

## Three ways of looking (bottom-left, or keys 1 / 2 / 3)
- **Explore** – on the ground, at the height of the flowers: one day at a time.
- **Overview** – standing on a hill: up, pulled back, looking diagonally across the field.
- **Bird's eye** – high above, slightly tilted, the whole field at once: day 1 on the left, day 100 on the right, every
  picture face-up like a seed head. Days still to come are pale hollow silhouettes. Scroll zooms a little, drag slides the field.
One camera eases between three designed viewpoints (`CameraController.js`); click any flower from any view to descend into that
day, and "Back to the garden" returns you to the view you left. `Esc` steps back to the ground. Vertical control stays limited:
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
| `layout.js` | where each day lives: time → depth along a winding path, dense clusters, open clearings; terrain height |
| `FlowerField.js` | maps the day data onto `Flower`s, instanced stems / leaves / shadows / seedlings, lazy texture loading |
| `Flower.js` | one flower: stem, leaves, round picture head, hover animation |
| `CameraController.js` | the three views (presets + eased transitions), scroll walking, parallax, drag, fly-to-flower |
| `ViewSwitcher.js` | the Explore / Overview / Bird's eye control |
| `Terrain.js`, `Atmosphere.js` | ground, hills, sky, light, fog, grass, floating motes |
| `DayOverlay.js`, `ProgressIndicator.js` | the day panel and the timeline (HTML, outside the 3D scene) |

Three.js r187 is vendored in `vendor/` (MIT, no npm needed).

## Adding days
1. Put the sketch and photo in the upload folder as `<n>s Large.jpeg` and `<n>p Large.jpeg`.
2. `python3 tools/build_garden.py "S for Sketches；P for Photos"` makes the web-sized photo, the transparent sketch
   and the round flower-head texture (`assets/heads/`), and rewrites `data.js`. Existing outputs are kept (`--rebuild` redoes all).
3. Titles / notes: `captions.json` → `{"27": {"title": "...", "caption": "..."}}`, then run the script again.
4. `python3 tools/bump_version.py` before pushing, so browsers fetch the new files.

Settings (title, `startDate` that dates every day) are in `config.js`.
