/* The visitor is a butterfly. A small, quiet butterfly follows the pointer with a little lag,
 * beats its wings faster while it travels and slowly when it rests, and lands on the flower it visits.
 * (Mouse only: on touch screens there is no pointer to follow.) */
// ids are made unique per copy: a gradient defined inside a hidden element would not paint the others
export const butterflySvg = (id) => `
<svg viewBox="0 0 64 52" aria-hidden="true">
  <defs>
    <linearGradient id="${id}w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4b4f5e"/><stop offset=".62" stop-color="#7d8190"/><stop offset="1" stop-color="#d9d6ca"/></linearGradient>
    <linearGradient id="${id}l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6a6e7c"/><stop offset="1" stop-color="#e7e3d6"/></linearGradient>
  </defs>
  <g class="wing wl"><g>
    <path d="M32 24 C24 4 6 2 3 14 C1 24 14 30 32 28 Z" fill="url(#${id}w)" opacity=".92"/>
    <path d="M32 28 C18 29 10 38 15 46 C20 51 29 42 32 31 Z" fill="url(#${id}l)" opacity=".9"/>
    <path d="M31 25 C22 14 12 11 6 15 M31 27 C21 24 12 22 5 18" stroke="#fff" stroke-opacity=".35" fill="none" stroke-width=".7"/>
  </g></g>
  <g class="wing wr"><g transform="translate(64 0) scale(-1 1)">
    <path d="M32 24 C24 4 6 2 3 14 C1 24 14 30 32 28 Z" fill="url(#${id}w)" opacity=".92"/>
    <path d="M32 28 C18 29 10 38 15 46 C20 51 29 42 32 31 Z" fill="url(#${id}l)" opacity=".9"/>
    <path d="M31 25 C22 14 12 11 6 15 M31 27 C21 24 12 22 5 18" stroke="#fff" stroke-opacity=".35" fill="none" stroke-width=".7"/>
  </g></g>
  <path d="M32 18 C33.2 24 33.2 34 32 42" stroke="#3b3f4c" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  <path d="M32 18 C30 11 26 8 23 8 M32 18 C34 11 38 8 41 8" stroke="#3b3f4c" stroke-width=".9" stroke-linecap="round" fill="none"/>
</svg>`;

export class Butterfly {
  constructor() {
    this.el = document.querySelector("#butterfly"); this.el.innerHTML = butterflySvg("cur");
    this.x = innerWidth / 2; this.y = innerHeight / 2; this.vx = 0; this.vy = 0; this.rot = 0; this.t = 0;
    this.shown = false; this.enabled = matchMedia("(pointer:fine)").matches;
    document.body.classList.toggle("has-butterfly", this.enabled);
  }

  /* pointer: {x,y} in px or null; perch: {x,y} where the hovered flower's rim is, or null */
  update(dt, pointer, perch, active) {
    if (!this.enabled) return;
    const show = !!pointer && active;
    if (show !== this.shown) { this.shown = show; this.el.classList.toggle("on", show); if (show) { this.x = pointer.x; this.y = pointer.y; } }
    if (!show) return;
    this.t += dt;
    const tx = perch ? perch.x : pointer.x, ty = perch ? perch.y : pointer.y;
    const k = 1 - Math.exp(-(perch ? 6 : 13) * dt);                       // quick to follow, slower to settle on a flower
    const px = this.x, py = this.y;
    this.x += (tx - this.x) * k; this.y += (ty - this.y) * k;
    this.vx = (this.x - px) / dt; this.vy = (this.y - py) / dt;
    const speed = Math.hypot(this.vx, this.vy), moving = speed > 40;
    const bob = perch ? Math.sin(this.t * 2.2) * 1.2 : Math.sin(this.t * 3.1) * 4 * (moving ? 0.4 : 1);
    this.rot += ((Math.max(-0.5, Math.min(0.5, this.vx * 0.0011))) - this.rot) * Math.min(1, dt * 7);
    this.el.style.transform = `translate3d(${(this.x - 17).toFixed(1)}px,${(this.y - 15 + bob).toFixed(1)}px,0) rotate(${this.rot.toFixed(3)}rad)`;
    // wings: slow and wide at rest, quick when travelling, nearly still when perched
    const flap = perch ? 1.7 : moving ? 0.22 + 0.5 / (1 + speed * 0.004) : 0.9;
    this.el.style.setProperty("--flap", flap.toFixed(2) + "s");
    this.el.classList.toggle("perched", !!perch);
  }
}
