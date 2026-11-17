/* Three quiet words in a corner: Explore · Overview · Bird's eye.  (keys 1 / 2 / 3)
 * It only reports a choice; the camera decides how to travel. */
export const VIEW_LABELS = { walk: "Explore", overview: "Overview", top: "Bird’s eye" };

export class ViewSwitcher {
  constructor(onPick) {
    this.root = document.querySelector("#views");
    this.buttons = [...this.root.querySelectorAll("button")];
    this.buttons.forEach((b) => b.addEventListener("click", () => onPick(b.dataset.view)));
    addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const v = { 1: "walk", 2: "overview", 3: "top" }[e.key];
      if (v) onPick(v);
    });
  }
  setActive(name) {
    this.buttons.forEach((b) => { const on = b.dataset.view === name; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
  }
}
