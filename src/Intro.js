/* The prelude: a quiet invitation before the garden. It sits in front of the (already growing) garden,
 * which shows through, softly blurred.
 * One button flies you in as a butterfly (Enter or Space too). Under it, as small as a "forgot password" link, a line for anyone who
 * would rather not be a butterfly: it opens a sentence and a link that enters the very same garden as a speck of dust. */
import { butterflySvg } from "./Butterfly.js";
import { hash } from "./utils.js";

export class Intro {
  constructor({ onEnter, startOpen = false }) {
    this.root = document.querySelector("#intro"); this.btn = document.querySelector("#enter"); this.onEnter = onEnter; this.open = true;
    this.alt = document.querySelector("#intro-alt"); this.toggle = document.querySelector("#alt-toggle"); this.dustBtn = document.querySelector("#enter-dust");
    this.root.querySelectorAll(".intro-bf").forEach((el, i) => { el.innerHTML = butterflySvg("in" + i); });
    const dust = this.root.querySelector(".intro-dust"), cols = ["#e8c25e", "#d9b66a", "#c9b27a", "#a9bad6"];
    for (let i = 0; i < 34; i++) {
      const n = document.createElement("i"), s = 2 + hash(i, 3) * 3.4;
      n.style.cssText = `left:${(hash(i, 1) * 100).toFixed(1)}%;top:${(hash(i, 2) * 100).toFixed(1)}%;width:${s.toFixed(1)}px;height:${s.toFixed(1)}px;` +
        `background:${cols[i % cols.length]};--d:${(14 + hash(i, 4) * 16).toFixed(1)}s;--dl:-${(hash(i, 5) * 20).toFixed(1)}s;--a:${(0.25 + hash(i, 6) * 0.45).toFixed(2)}`;
      dust.appendChild(n);
    }
    document.body.classList.add("intro-open");
    this.btn.addEventListener("click", () => this.enter("butterfly"));
    this.toggle.addEventListener("click", () => this.setAlt(!this.alt.classList.contains("open")));
    this.dustBtn.addEventListener("click", () => this.enter("dust"));
    if (startOpen) this.setAlt(true);                                       // someone who chose dust earlier this session finds the way back to it ready
    this.key = (e) => {
      if (!this.open) return;
      if (e.key === "Escape" && this.alt.classList.contains("open")) { this.setAlt(false); this.toggle.focus(); return; }
      if (e.key !== "Enter" && e.key !== " ") return;
      const t = e.target;                                                    // on the quiet links, Enter / Space just press that link
      if (t && t.closest && t.closest("button") && t.closest("button") !== this.btn) return;
      e.preventDefault(); this.enter("butterfly");
    };
    addEventListener("keydown", this.key);
  }

  /* open / close the small explanation; its link becomes reachable by keyboard only while it is visible */
  setAlt(on) {
    this.alt.classList.toggle("open", on);
    this.toggle.setAttribute("aria-expanded", on ? "true" : "false");
    document.querySelector("#alt-panel").setAttribute("aria-hidden", on ? "false" : "true");
    this.dustBtn.tabIndex = on ? 0 : -1;
  }

  enter(mode = "butterfly") {
    if (!this.open) return;
    this.open = false; document.body.classList.remove("intro-open");
    this.root.classList.add("leaving"); this.root.setAttribute("aria-hidden", "true");
    setTimeout(() => { this.root.hidden = true; }, 2000);
    this.onEnter && this.onEnter(mode);
  }

  /* Home: the prelude comes back over the garden; nothing is reloaded and nothing is forgotten */
  show() {
    if (this.open) return;
    this.open = true; this.root.hidden = false; this.root.setAttribute("aria-hidden", "false");
    this.root.querySelectorAll(".intro-card > *").forEach((el) => { el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; });   // let it arrive again
    void this.root.offsetWidth; this.root.classList.remove("leaving");
    document.body.classList.add("intro-open"); this.setAlt(false);
  }

  skip() {                                         // e.g. someone arriving by the link to a single day
    this.open = false; document.body.classList.remove("intro-open"); this.root.hidden = true;
  }
}
