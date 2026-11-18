/* Who the visitor is. Butterfly is the way in; dust is a quieter alternative. The choice lives for the browser session
 * (sessionStorage), and is the only thing the rest of the garden needs to know: same garden, same camera, a different companion. */
const KEY = "keyis-garden:visitorMode";
export const MODES = ["butterfly", "dust"];

export function readVisitorMode() {
  try { const m = sessionStorage.getItem(KEY); return MODES.includes(m) ? m : "butterfly"; } catch { return "butterfly"; }
}
export function writeVisitorMode(mode) {
  try { sessionStorage.setItem(KEY, mode); } catch { /* private mode: it simply lasts until the page closes */ }
}
