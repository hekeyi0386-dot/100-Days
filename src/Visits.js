/* Which flowers the visitor has awakened. Kept for the session and in localStorage, so a returning
 * visitor finds their trail of colour still there. */
const KEY = "keyis-garden:visited:v1";

export class Visits {
  constructor() {
    this.set = new Set();
    try { const raw = JSON.parse(localStorage.getItem(KEY) || "[]"); if (Array.isArray(raw)) raw.forEach((d) => Number.isInteger(d) && this.set.add(d)); } catch { /* private mode: session only */ }
    this.onChange = null;
  }
  has(day) { return this.set.has(day); }
  get size() { return this.set.size; }
  add(day) { if (this.set.has(day)) return false; this.set.add(day); this.save(); this.onChange && this.onChange(); return true; }
  clear() { this.set.clear(); this.save(); this.onChange && this.onChange(); }
  save() { try { localStorage.setItem(KEY, JSON.stringify([...this.set])); } catch { /* ignore */ } }
}
