/* The day panel: a readable HTML overlay on top of the 3D scene (not a gimmick floating in space). */
import { pad3 } from "./utils.js";

export class DayOverlay {
  constructor() {
    const $ = (s) => document.querySelector(s);
    this.root = $("#day");
    this.el = { day: $("#d-day"), date: $("#d-date"), title: $("#d-title"), note: $("#d-note"), photo: $("#d-photo"), sketch: $("#d-sketch"), prev: $("#d-prev"), next: $("#d-next") };
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
    el.photo.alt = entry.title || `Day ${entry.day}`;
    el.photo.classList.remove("ready");
    const img = new Image();                       // fade the photo in once it has arrived
    img.onload = () => { if (token === this.token) { el.photo.src = entry.photo; el.photo.classList.add("ready"); } };
    img.src = entry.photo;
    el.sketch.src = entry.sketch;
    el.prev.disabled = !hasPrev; el.next.disabled = !hasNext;
    this.root.classList.add("show"); this.root.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.add("open")));
    this.isOpen = true;
  }

  hide() {
    this.isOpen = false; this.token++;
    this.root.classList.remove("open"); this.root.setAttribute("aria-hidden", "true");
    setTimeout(() => { if (!this.isOpen) this.root.classList.remove("show"); }, 700);
  }
}
