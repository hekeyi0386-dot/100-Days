/* The day panel: a readable HTML overlay on top of the 3D scene (not a gimmick floating in space).
 * The sketch is its main picture. The photograph lives on the left, in the flower itself. */
import { pad3 } from "./utils.js";

export class DayOverlay {
  constructor() {
    const $ = (s) => document.querySelector(s);
    this.root = $("#day");
    this.el = { day: $("#d-day"), date: $("#d-date"), title: $("#d-title"), note: $("#d-note"), sketch: $("#d-sketch"), prev: $("#d-prev"), next: $("#d-next") };
    this.onClose = this.onPrev = this.onNext = null; this.token = 0;
    this.root.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) this.onClose && this.onClose(); });
    this.el.prev.addEventListener("click", () => this.onPrev && this.onPrev());
    this.el.next.addEventListener("click", () => this.onNext && this.onNext());
    this.isOpen = false;
  }

  show({ entry, date, hasPrev, hasNext }) {
    const { el } = this, token = ++this.token;
    el.day.textContent = "Day " + pad3(entry.day);
    el.date.textContent = date || ""; el.date.hidden = !date;
    el.title.textContent = entry.title || ""; el.title.hidden = !entry.title;
    el.note.textContent = entry.caption || ""; el.note.hidden = !entry.caption;
    el.prev.disabled = !hasPrev; el.next.disabled = !hasNext;
    this.swapSketch(entry, token);
    this.root.classList.add("show"); this.root.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.add("open")));
    this.isOpen = true;
  }

  /* Replace the picture from a clean slate: hidden and unstyled by the previous one, then shown only once the new
   * one is decoded. A late answer for an older day (token mismatch) is ignored, and the fade-in always starts from 0. */
  swapSketch(entry, token) {
    const img = this.el.sketch;
    img.classList.remove("ready");
    img.alt = `Sketch for day ${entry.day}${entry.title ? ": " + entry.title : ""}`;
    img.removeAttribute("src");
    void img.offsetWidth;                                                  // commit the hidden state before the next picture arrives
    const reveal = () => { if (token === this.token) img.classList.add("ready"); };
    img.src = entry.sketch;
    (img.decode ? img.decode() : Promise.resolve()).then(reveal, reveal);
  }

  hide() {
    this.isOpen = false; this.token++;
    this.root.classList.remove("open"); this.root.setAttribute("aria-hidden", "true");
    setTimeout(() => { if (!this.isOpen) this.root.classList.remove("show"); }, 700);
  }
}
