import { GardenScene } from "./GardenScene.js";

const data = window.GARDEN, config = window.GARDEN_CONFIG || {};
const fail = (why) => { document.body.classList.add("no-gl"); document.querySelector("#nogl p").textContent = why; };

function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

if (!data) fail("The garden's data could not be loaded.");
else if (!hasWebGL()) fail("This browser cannot draw the 3D garden (WebGL is off). Try Chrome, Safari or Firefox.");
else {
  try {
    const garden = new GardenScene({ canvas: document.querySelector("#gl"), data, config });
    garden.start();
    document.body.classList.add("ready");
    window.__garden = garden;                       // handy for debugging in the console
  } catch (err) { console.error(err); fail("Something went wrong while growing the garden: " + err.message); }
}
