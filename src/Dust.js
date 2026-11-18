/* The other way to visit: a speck of dust. A very small, soft, warm-white point that follows the pointer a little
 * lazily, wanders a hair off line (as if it weighed nothing) and leaves the faintest trace while it travels.
 * Same interface as the Butterfly: update(dt, pointer, perch, active). No wings, no landing: over a flower it only glows a little more. */
export class Dust {
  constructor() {
    this.el = document.querySelector("#speck");
    this.el.textContent = "";
    // the trace first (largest delay, smallest and faintest), the speck itself last so it is drawn on top
    this.dots = [{ r: 3.6, rate: 2.6, a: 0.10 }, { r: 4.6, rate: 4.2, a: 0.17 }, { r: 5.6, rate: 7, a: 0.26 }, { r: 4.8, rate: 12, a: 1, core: true }].map((d) => {
      const wrap = document.createElement("span"), dot = document.createElement("i");
      wrap.className = "sp" + (d.core ? " core" : ""); dot.style.width = dot.style.height = d.r * 2 + "px"; dot.style.margin = -d.r + "px 0 0 " + -d.r + "px";
      wrap.appendChild(dot); this.el.appendChild(wrap);
      return { ...d, wrap, x: 0, y: 0 };
    });
    this.t = Math.random() * 20; this.shown = false; this.mounted = false; this.speed = 0;
    this.enabled = matchMedia("(pointer:fine)").matches;                    // there is no pointer to follow on a touch screen
  }

  /* switch the speck on or off (the other mode's cursor takes its place) */
  mount(on) {
    this.mounted = !!on && this.enabled;
    document.body.classList.toggle("has-speck", this.mounted);
    if (!this.mounted) { this.shown = false; this.el.classList.remove("on", "near"); }
  }

  update(dt, pointer, perch, active) {
    if (!this.mounted) return;
    const show = !!pointer && active;
    if (show !== this.shown) {
      this.shown = show; this.el.classList.toggle("on", show);
      if (show) for (const d of this.dots) { d.x = pointer.x; d.y = pointer.y; }
    }
    if (!show) return;
    this.t += dt;
    // a barely perceptible wander: two slow, unrelated waves
    const wx = Math.sin(this.t * 0.9) * 1.5 + Math.sin(this.t * 0.37 + 1.3) * 1.2, wy = Math.cos(this.t * 0.7) * 1.5 + Math.sin(this.t * 0.43 + 0.4) * 1.1;
    let tx = pointer.x + wx, ty = pointer.y + wy, speed = 0;
    for (let i = this.dots.length - 1; i >= 0; i--) {                       // the speck follows the pointer; each trace follows the one in front
      const d = this.dots[i], px = d.x, py = d.y, k = 1 - Math.exp(-d.rate * dt);
      d.x += (tx - d.x) * k; d.y += (ty - d.y) * k;
      if (d.core) speed = Math.hypot(d.x - px, d.y - py) / Math.max(dt, 1e-3);
      d.wrap.style.transform = `translate3d(${d.x.toFixed(1)}px,${d.y.toFixed(1)}px,0)`;
      tx = d.x; ty = d.y;
    }
    this.speed += (speed - this.speed) * Math.min(1, dt * 8);
    const trail = Math.min(1, Math.max(0, (this.speed - 40) / 420));       // the trace only shows while it is really moving
    for (const d of this.dots) if (!d.core) d.wrap.style.opacity = (d.a * trail).toFixed(3);
    this.el.classList.toggle("near", !!perch);                              // over a flower it brightens a little, that is all
  }
}
