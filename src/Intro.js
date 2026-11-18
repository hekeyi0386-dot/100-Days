/* The prelude: a quiet invitation before the garden. It sits in front of the (already growing) garden,
 * which shows through, softly blurred. One button; Enter or Space also works. */
import { butterflySvg } from "./Butterfly.js";
import { hash } from "./utils.js";

export class Intro {
  constructor({ onEnter }) {
    this.root = document.querySelector("#intro"); this.btn = document.querySelector("#enter"); this.onEnter = onEnter; this.open = true;
    this.root.querySelectorAll(".intro-bf").forEach((el, i) => { el.innerHTML = butterflySvg("in" + i); });
    const dust = this.root.querySelector(".intro-dust"), cols = ["#e4bd5a", "#c9b27a", "#9fb0d6", "#b9aee0"];
    for (let i = 0; i < 34; i++) {
      const n = document.createElement("i"), s = 2 + hash(i, 3) * 3.4;
      n.style.cssText = `left:${(hash(i, 1) * 100).toFixed(1)}%;top:${(hash(i, 2) * 100).toFixed(1)}%;width:${s.toFixed(1)}px;height:${s.toFixed(1)}px;` +
        `background:${cols[i % cols.length]};--d:${(14 + hash(i, 4) * 16).toFixed(1)}s;--dl:-${(hash(i, 5) * 20).toFixed(1)}s;--a:${(0.25 + hash(i, 6) * 0.45).toFixed(2)}`;
      dust.appendChild(n);
    }
    document.body.classList.add("intro-open");
    this.btn.addEventListener("click", () => this.enter());
    this.key = (e) => { if (this.open && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); this.enter(); } };
    addEventListener("keydown", this.key);
  }

  enter() {
    if (!this.open) return;
    this.open = false; document.body.classList.remove("intro-open");
    this.root.classList.add("leaving"); this.root.setAttribute("aria-hidden", "true");
    setTimeout(() => { this.root.hidden = true; }, 2000);
    this.onEnter && this.onEnter();
  }

  skip() {                                         // e.g. someone arriving by the link to a single day
    this.open = false; document.body.classList.remove("intro-open"); this.root.hidden = true;
  }
}
