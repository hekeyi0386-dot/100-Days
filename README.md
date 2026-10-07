# 100 Days Garden

One photo + one sketch per day, grown into a flower. Your mouse is a little visitor: move it to walk around, get close and a flower wakes up, click it to see the sketch, the photo and a one-line note.

Open `index.html` directly (plain static site, no build step).

## Adding a day

1. Put the sketch and the photo in `assets/` (long side ≤ 1200px, webp/jpg). Sketches are best as black lines on a transparent background; white backgrounds work too.
2. Add an entry to `entries` in `data.js`:

```js
{ day: 3, title: "Title", sketch: "assets/day03-sketch.webp", photo: "assets/day03-photo.webp", caption: "One sentence" }
```

## Controls
- Move the mouse: the visitor follows; while the mouse is moving near the left/right edge the garden scrolls (it stops as soon as the mouse stops). Wheel / trackpad or ←/→ also work
- Click a flower: open details (←/→ switch between open flowers, Esc closes)
- Bottom ticks: the 100 days, click to jump
