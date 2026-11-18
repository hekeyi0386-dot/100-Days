/* Which flowers the visitor has awakened into colour during this visit.
 * Deliberately not remembered: a refresh is a new visit, and every flower is a black-and-white sketch again. */
const OLD_KEY = "keyis-garden:visited:v1";

export class Visits {
  constructor() {
    this.set = new Set();
    this.onChange = null;
    try { localStorage.removeItem(OLD_KEY); } catch { /* an earlier version stored the trail here; forget it */ }
  }
  has(day) { return this.set.has(day); }
  get size() { return this.set.size; }
  add(day) { if (this.set.has(day)) return false; this.set.add(day); this.onChange && this.onChange(); return true; }
  clear() { this.set.clear(); this.onChange && this.onChange(); }
}
