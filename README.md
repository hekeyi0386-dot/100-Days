# 100 Days of Frames

One photograph a day for 100 days, shown as a single personal sky: every day is a star, and the whole
hundred are visible at once. Hover a star and it wakes (a little bloom, its constellation lights up, the
day and date appear); click it to step into that day.

Open `index.html` directly (plain static site, no build step).

## How the sky works
- **Layout** – days grow outward from the centre in a golden-angle spiral (like sunflower seeds), then a short
  relaxation pass keeps photographs from touching. Each day owns a fixed place, so adding a day lights up a
  star and never moves the others.
- **Constellations** – faint vines connect days that rhyme (light, windows, repetition, texture...). They live
  in `config.js` under `constellations`; a day can belong to two of them.
- **Garden** – tiny sprigs grow in the gaps, and a star blooms when you find it.

## Adding days
1. Put the new sketch and photo in the upload folder, named `<n>s Large.jpeg` and `<n>p Large.jpeg`.
2. Run `python3 tools/build_garden.py "S for Sketches；P for Photos"`. It makes the web-sized photo, the
   transparent sketch and a small square thumbnail, and rewrites `data.js`. Existing outputs are kept
   (`--rebuild` to redo everything).
3. Titles and notes: add them to `captions.json` as `{"27": {"title": "...", "caption": "..."}}` and run the
   script again.

## Settings (`config.js`)
`title`, `subtitle`, `line`, `startDate` (Day 1's date; other dates are counted from it), and `constellations`.
