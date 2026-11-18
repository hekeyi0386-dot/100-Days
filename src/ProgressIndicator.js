/* A quiet timeline instead of the big scrollbar:  Day 01 ———— Day 100.
 * The days you can currently see glow, a marker follows the day you are standing near,
 * and clicking a tick walks you there. */
import { pad2, pad3 } from "./utils.js";

export class ProgressIndicator {
  constructor(total, filledDays, onPick) {
    this.total = total; this.root = document.querySelector("#timeline");
    this.track = this.root.querySelector(".tl-track"); this.label = this.root.querySelector(".tl-now"); this.marker = this.root.querySelector(".tl-marker");
    this.ticks = []; this.big = document.querySelector("#nowday");
    const has = new Set(filledDays);
    for (let d = 1; d <= total; d++) {
      const b = document.createElement("button");
      b.className = "tick" + (has.has(d) ? " full" : ""); b.title = "Day " + pad3(d); b.setAttribute("aria-label", "Walk to day " + d);
      b.addEventListener("click", () => onPick(d));
      this.track.appendChild(b); this.ticks.push(b);
    }
    this.root.querySelector(".tl-start").textContent = "Day 01"; this.root.querySelector(".tl-end").textContent = "Day " + String(total).padStart(2, "0");
    this.last = { day: -1, lo: -1, hi: -1 };
  }

  setVisited(set) { this.ticks.forEach((t, i) => t.classList.toggle("visited", set.has(i + 1))); }

  update(day, lo, hi, hoverDay, all) {
    if (all !== this.last.all) { this.last.all = all; this.last.day = -1; }
    if (all) { this.big.innerHTML = "ALL " + this.total + " <i>DAYS</i>"; this.label.textContent = ""; }
    else if (day !== this.last.day) {
      this.last.day = day; this.label.textContent = "Day " + pad2(day);
      this.big.innerHTML = "DAY " + pad3(day) + " <i>/ " + this.total + "</i>";
      this.marker.style.left = ((day - 0.5) / this.total) * 100 + "%";
    }
    if (lo !== this.last.lo || hi !== this.last.hi) {
      this.last.lo = lo; this.last.hi = hi;
      this.ticks.forEach((t, i) => t.classList.toggle("view", i + 1 >= lo && i + 1 <= hi));
    }
    if (hoverDay !== this.last.hover) {
      if (this.last.hover) this.ticks[this.last.hover - 1].classList.remove("hover");
      if (hoverDay) this.ticks[hoverDay - 1].classList.add("hover");
      this.last.hover = hoverDay;
    }
  }
}
