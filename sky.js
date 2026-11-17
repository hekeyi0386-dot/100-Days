/* 100 Days of Frames — the homepage is one personal sky.
 * Every day is a star. Photographs are the stars; the garden is the thin vine
 * that grows between them. Data comes from data.js (entries) and config.js (settings). */
(() => {
  const $ = (s) => document.querySelector(s);
  const G = window.GARDEN, C = window.GARDEN_CONFIG || {};
  if (!G) return;
  const TOTAL = G.total || 100;
  const NS = "http://www.w3.org/2000/svg";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hash = (a, b = 0) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
  const pad3 = (n) => String(n).padStart(3, "0");
  const svg = (name, attrs, parent) => {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  const byDay = new Map(G.entries.map((e) => [e.day, e]));
  const filled = [...byDay.keys()].sort((a, b) => a - b);
  const coarse = matchMedia("(pointer:coarse)").matches;

  /* ---------- copy ---------- */
  $("#sub").textContent = C.subtitle || "";
  $("#line").textContent = C.line || "";
  $("#meta").innerHTML = `<b>${filled.length}</b> of ${TOTAL} days`;
  const hintEl = $("#hint");
  hintEl.textContent = coarse ? "Tap a star to step into that day" : "Hover a star · click to step into that day";

  function dateOf(day) {
    const e = byDay.get(day);
    let d = null;
    if (e && e.date) { const [y, m, dd] = e.date.split("-").map(Number); d = new Date(y, m - 1, dd); }
    else if (C.startDate) { const [y, m, dd] = C.startDate.split("-").map(Number); d = new Date(y, m - 1, dd + day - 1); }
    return d ? d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
  }

  /* ---------- constellations ---------- */
  const groups = (C.constellations || [])
    .map((g, id) => ({ id, name: g.name, days: g.days.filter((d) => byDay.has(d)).sort((a, b) => a - b) }))
    .filter((g) => g.days.length >= 2);
  const groupsOf = new Map();
  groups.forEach((g) => g.days.forEach((d) => { if (!groupsOf.has(d)) groupsOf.set(d, []); groupsOf.get(d).push(g); }));

  /* ---------- background dust: tiny stars and sparkles ---------- */
  (function dust() {
    const host = $("#dust"), cols = ["#f3cf74", "#e9bd4d", "#9fb0d6", "#b9aee0", "#d6c58a"];
    for (let i = 0; i < 150; i++) {
      const n = document.createElement("i"), sp = i % 9 === 0;
      if (sp) n.className = "sp";
      const size = sp ? 9 + hash(i, 3) * 12 : 1.5 + hash(i, 3) * 2.2;
      n.style.cssText = `left:${(hash(i, 1) * 100).toFixed(2)}%;top:${(hash(i, 2) * 100).toFixed(2)}%;` +
        `${sp ? "--s" : "width"}:${size.toFixed(1)}px;${sp ? "" : `height:${size.toFixed(1)}px;`}` +
        `--c:${cols[Math.floor(hash(i, 4) * cols.length)]};--a:${(0.35 + hash(i, 5) * 0.5).toFixed(2)};` +
        `--t:${(4 + hash(i, 6) * 7).toFixed(1)}s;--dl:-${(hash(i, 7) * 9).toFixed(1)}s`;
      host.appendChild(n);
    }
  })();

  /* ---------- stars ---------- */
  const sky = $("#sky"), linesSvg = $("#lines"), gardenSvg = $("#garden"), bloom = $("#bloom");
  const stars = [], starByDay = new Map();
  for (let day = 1; day <= TOTAL; day++) {
    const e = byDay.get(day) || null, r = (k) => hash(day, k);
    const s = {
      day, e, empty: !e,
      base: e ? 0.82 + 0.18 * r(1) : 0.9,
      size: e ? (0.84 + 0.32 * r(2)) * (day % 7 === 3 ? 1.16 : 1) : 1,
      x: 0, y: 0, ax: 0, ay: 0, d: 0, r: 0,
    };
    const b = document.createElement(e ? "button" : "div");
    b.className = "star " + (e ? "filled" : "empty");
    b.dataset.day = day;
    if (e) b.setAttribute("aria-label", `Day ${day}${e.title ? ", " + e.title : ""}`);
    const orb = document.createElement("span"); orb.className = "orb";
    const face = document.createElement("span"); face.className = "face";
    if (e) {
      const img = document.createElement("img");
      img.src = e.thumb || e.photo; img.alt = ""; img.decoding = "async"; img.draggable = false;
      face.appendChild(img);
    } else {
      const dot = document.createElement("span"); dot.className = "dot"; face.appendChild(dot);
      const hit = document.createElement("span"); hit.className = "hit"; b.appendChild(hit);
    }
    orb.appendChild(face); b.appendChild(orb);
    b.style.setProperty("--o", s.base.toFixed(2));
    b.style.setProperty("--in", (0.15 + day * 0.028).toFixed(2) + "s");
    b.style.setProperty("--dur", (11 + r(3) * 9).toFixed(1) + "s");
    b.style.setProperty("--dl", "-" + (r(4) * 12).toFixed(1) + "s");
    b.style.setProperty("--fx", ((r(5) - 0.5) * 9).toFixed(1) + "px");
    b.style.setProperty("--fy", ((r(6) - 0.5) * 9).toFixed(1) + "px");
    s.el = b; stars.push(s); starByDay.set(day, s);
    sky.appendChild(b);
  }

  /* ---------- layout: a designed field, not a grid ----------
   * Days grow outward from the centre like the seeds of a sunflower (golden-angle spiral),
   * stretched to the shape of the screen and given a slightly uneven outline. Because every
   * day owns a fixed place, adding a new photo only lights up a star; nothing reflows.
   * A short relaxation pass then nudges things apart so no two photographs touch. */
  let W = 0, H = 0, portrait = false, Dbig = 80;
  function rectCircles(r, pad) {
    const h = r.height + pad * 2, w = r.width + pad * 2, rad = Math.max(h, 1) / 2;
    const n = Math.max(1, Math.ceil(w / (rad * 1.2))), out = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      out.push({ x: r.left - pad + rad + Math.max(0, w - 2 * rad) * t, y: r.top - pad + rad, r: rad });
    }
    return out;
  }

  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  function layout() {
    W = innerWidth; H = innerHeight; portrait = H > W * 1.05;
    const mast = $("#masthead").getBoundingClientRect(), meta = $("#meta").getBoundingClientRect(), hint = hintEl.getBoundingClientRect();
    const padX = portrait ? 8 : 30, padBot = portrait ? 76 : 58, padTop = portrait ? mast.bottom + 6 : 18;
    const obst = [];
    if (!portrait) obst.push(...rectCircles(mast, 14), ...rectCircles(meta, 8));
    else obst.push(...rectCircles(meta, 6));
    obst.push(...rectCircles(hint, 8));
    const availW = W - 2 * padX, availH = H - padTop - padBot;
    const cx = padX + availW / 2 + (portrait ? 0 : availW * 0.02), cy = padTop + availH / 2;
    const rx = availW / 2 * 0.97, ry = availH / 2 * 0.97;
    const spacing = Math.sqrt((Math.PI * rx * ry * 0.86) / TOTAL);   // average distance between neighbours
    Dbig = clamp(spacing * 0.9, 28, 130);

    for (const s of stars) {
      s.d = s.empty ? clamp(Dbig * 0.14, 6, 12) : Dbig * s.size;
      s.r = s.d / 2 + (s.empty ? 6 : 3);
      const th = s.day * GOLDEN + 0.6, f = Math.sqrt((s.day - 0.4) / TOTAL);
      const edge = 1 + 0.07 * Math.sin(2 * th + 1.1) + 0.05 * Math.sin(3 * th + 0.4);
      const jit = spacing * 0.2;
      s.ax = cx + Math.cos(th) * rx * f * edge + (hash(s.day, 11) - 0.5) * jit;
      s.ay = cy + Math.sin(th) * ry * f * edge + (hash(s.day, 12) - 0.5) * jit;
      s.x = clamp(s.ax, padX + s.r, W - padX - s.r); s.y = clamp(s.ay, padTop + s.r, H - padBot - s.r);
    }

    const GAP = Math.max(6, spacing * 0.1), N = stars.length;
    for (let it = 0; it < 760; it++) {
      const springs = it < 520, k = springs ? 0.03 : 0;
      for (const s of stars) { s.x += (s.ax - s.x) * k; s.y += (s.ay - s.y) * k; }
      for (let i = 0; i < N; i++) {
        const a = stars[i];
        for (let j = i + 1; j < N; j++) {
          const b = stars[j], dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r + GAP;
          if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.01, push = (min - d) * 0.4, ux = dx / d, uy = dy / d;
          a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
        }
        for (const o of obst) {
          const dx = a.x - o.x, dy = a.y - o.y, min = a.r + o.r, d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.01, push = min - d;
          a.x += (dx / d) * push; a.y += (dy / d) * push;
        }
        a.x = clamp(a.x, padX + a.r, W - padX - a.r); a.y = clamp(a.y, padTop + a.r, H - padBot - a.r);
      }
    }

    for (const s of stars) {
      const st = s.el.style;
      st.left = (s.x - s.d / 2).toFixed(1) + "px"; st.top = (s.y - s.d / 2).toFixed(1) + "px";
      st.setProperty("--d", s.d.toFixed(1) + "px");
      st.setProperty("--depth", (0.35 + (s.d / Dbig) * 0.75).toFixed(2));
      st.setProperty("--halo", (0.14 + 0.2 * hash(s.day, 8)).toFixed(2));
    }
    buildLines(); buildGarden();
    if (hovered) positionBloom(hovered);
  }

  /* ---------- constellation vines ---------- */
  const qp = (a, b, c, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
  function leaf(parent, x, y, ang, len, w) {
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len, mx = (x + ex) / 2, my = (y + ey) / 2;
    const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
    return svg("path", { class: "lf", d: `M${x.toFixed(1)} ${y.toFixed(1)} Q${(mx + nx).toFixed(1)} ${(my + ny).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)} Q${(mx - nx).toFixed(1)} ${(my - ny).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}Z` }, parent);
  }

  function buildLines() {
    linesSvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    linesSvg.textContent = "";
    for (const g of groups) {
      const gEl = svg("g", { class: "grp" }, linesSvg);
      g.el = gEl;
      for (let i = 0; i < g.days.length - 1; i++) {
        const a = starByDay.get(g.days[i]), b = starByDay.get(g.days[i + 1]);
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const bend = len * 0.14 * (hash(a.day + b.day * 3, 2) > 0.5 ? 1 : -1);
        const cx = (a.x + b.x) / 2 - (dy / len) * bend, cy = (a.y + b.y) / 2 + (dx / len) * bend;
        const d = `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
        svg("path", { class: "seg", d }, gEl);
        svg("path", { class: "seg-lit", d, pathLength: 1 }, gEl);
        // tiny leaves along the vine, only visible when the constellation wakes
        for (const t of [0.34, 0.5, 0.66]) {
          if (len < 160 && t !== 0.5) continue;
          const px = qp(a.x, cx, b.x, t), py = qp(a.y, cy, b.y, t);
          const tx = 2 * (1 - t) * (cx - a.x) + 2 * t * (b.x - cx), ty = 2 * (1 - t) * (cy - a.y) + 2 * t * (b.y - cy);
          const ang = Math.atan2(ty, tx), L = 9 + hash(a.day, t * 10) * 4;
          leaf(gEl, px, py, ang - 0.95, L, 3); leaf(gEl, px, py, ang + 0.95, L, 3);
        }
      }
    }
  }

  /* ---------- garden layer: sprigs in the gaps between photographs ---------- */
  function sprig(parent, x, y, h, seed, lean) {
    const g = svg("g", { class: "sprig-g" }, parent);
    g.style.transformOrigin = "50% 100%";
    g.style.setProperty("--sw", (7 + hash(seed, 1) * 5).toFixed(1) + "s");
    g.style.setProperty("--sd", "-" + (hash(seed, 2) * 8).toFixed(1) + "s");
    const cx = x + lean * 0.15, cy = y - h * 0.5, tx = x + lean, ty = y - h;
    svg("path", { d: `M${x.toFixed(1)} ${y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}` }, g);
    const n = 3 + Math.floor(hash(seed, 3) * 3);
    for (let i = 0; i < n; i++) {
      const t = 0.3 + (i / n) * 0.55, px = qp(x, cx, tx, t), py = qp(y, cy, ty, t), side = i % 2 ? 1 : -1;
      leaf(g, px, py, -Math.PI / 2 + side * (0.95 + hash(seed, 10 + i) * 0.3), 9 + hash(seed, 20 + i) * 6, 3.2);
    }
    svg("ellipse", { class: "bd", cx: tx.toFixed(1), cy: (ty - 3).toFixed(1), rx: 2.4, ry: 3.6 }, g);
    return g;
  }

  function buildGarden() {
    gardenSvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    gardenSvg.textContent = "";
    const mast = $("#masthead").getBoundingClientRect(), hint = hintEl.getBoundingClientRect();
    const want = clamp(Math.round((W * H) / 80000), 6, 22), placed = [];
    for (let k = 0; k < 900 && placed.length < want; k++) {
      const x = 24 + hash(k, 41) * (W - 48), y = H * 0.16 + hash(k, 42) * (H * 0.84 - 30);
      const top = y - (34 + hash(placed.length, 51) * 40) - 12;                 // keep the whole sprig clear of the title
      if (x < mast.right + 24 && top < mast.bottom + 10) continue;
      if (Math.abs(x - W / 2) < hint.width / 2 + 20 && y > hint.top - 60) continue;
      if (stars.some((s) => Math.hypot(s.x - x, s.y - y) < s.r + 40)) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < 84)) continue;
      placed.push({ x, y });
    }
    placed.forEach((p, i) => sprig(gardenSvg, p.x, p.y, 34 + hash(i, 51) * 40, i + 7, (hash(i, 52) - 0.5) * 26));
  }

  /* ---------- waking a star ---------- */
  const card = $("#card");
  let hovered = null, active = [];
  const petals = bloom.querySelector(".petals");
  for (let i = 0; i < 8; i++) svg("ellipse", { cx: 50, cy: 10, rx: 6, ry: 11, transform: `rotate(${i * 45} 50 50)` }, petals);
  svg("circle", { cx: 50, cy: 50, r: 41 }, petals);

  function positionBloom(s) {
    const r = s.el.getBoundingClientRect(), size = s.d * 2.55;
    bloom.style.width = bloom.style.height = size + "px";
    bloom.style.left = r.left + r.width / 2 + "px"; bloom.style.top = r.top + r.height / 2 + "px";
  }

  function enter(s) {
    if (hovered === s) return;
    if (hovered) leave();
    hovered = s; sky.classList.add("has-hover");
    s.el.classList.add("on");
    active = groupsOf.get(s.day) || [];
    active.forEach((g) => g.el && g.el.classList.add("active"));
    const kin = new Set(active.flatMap((g) => g.days));
    for (const t of stars) {
      if (t === s) continue;
      if (kin.has(t.day)) { t.el.classList.add("kin"); continue; }
      if (s.empty) continue;                                   // a still-empty star does not dim the sky
      const near = clamp(1 - Math.hypot(t.x - s.x, t.y - s.y) / (s.r * 4.5), 0, 1);
      t.el.style.setProperty("--o", (t.base * (0.9 - 0.4 * near)).toFixed(2));
    }
    if (!s.empty) { positionBloom(s); bloom.classList.add("on"); }
    showCard(s);
    hintEl.classList.add("gone");
  }

  function leave() {
    if (!hovered) return;
    hovered.el.classList.remove("on"); hovered = null; sky.classList.remove("has-hover");
    active.forEach((g) => g.el && g.el.classList.remove("active")); active = [];
    for (const t of stars) { t.el.classList.remove("kin"); t.el.style.setProperty("--o", t.base.toFixed(2)); }
    bloom.classList.remove("on");
    card.classList.remove("show"); card.setAttribute("aria-hidden", "true");
    armIdle();
  }

  function showCard(s) {
    const e = s.e, gs = groupsOf.get(s.day) || [];
    card.querySelector(".c-day").textContent = "DAY " + pad3(s.day);
    card.querySelector(".c-date").textContent = dateOf(s.day);
    card.querySelector(".c-title").textContent = e ? (e.title ? `“${e.title}”` : "") : "Still to come";
    card.querySelector(".c-group").textContent = gs.map((g) => g.name).join(" · ");
    card.setAttribute("aria-hidden", "false");
    const r = s.el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const reach = (s.empty ? s.d * 1.9 : s.d * 1.42) / 2 + 16;
    card.classList.add("show");
    const w = card.offsetWidth, h = card.offsetHeight;
    let x = cx + reach, y = cy - h / 2;
    if (x + w > W - 12) x = cx - reach - w;
    if (x < 12) x = clamp(cx - w / 2, 12, W - w - 12);
    y = clamp(y, 12, H - h - 12);
    card.style.transform = `translate3d(${x.toFixed(0)}px,${y.toFixed(0)}px,0)`;
  }

  sky.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const b = e.target.closest(".star"); if (b) enter(starByDay.get(+b.dataset.day));
  });
  sky.addEventListener("pointerout", (e) => {
    const b = e.target.closest(".star");
    if (b && !b.contains(e.relatedTarget)) leave();
  });
  sky.addEventListener("focusin", (e) => { const b = e.target.closest(".star.filled"); if (b) enter(starByDay.get(+b.dataset.day)); });
  sky.addEventListener("focusout", () => leave());
  sky.addEventListener("click", (e) => {
    const b = e.target.closest(".star.filled"); if (b) openDay(+b.dataset.day, b);
  });

  // very gentle parallax
  let px = 0, py = 0, raf = 0;
  addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    px = (e.clientX / W - 0.5) * 2; py = (e.clientY / H - 0.5) * 2;
    moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
    if (moved > 90) hintEl.classList.add("gone");
    armIdle();
    if (!raf) raf = requestAnimationFrame(() => {
      raf = 0; sky.style.setProperty("--mx", (px * -9).toFixed(2)); sky.style.setProperty("--my", (py * -7).toFixed(2));
    });
  }, { passive: true });

  // hint returns when the visitor goes quiet
  let moved = 0, idleTimer = 0;
  function armIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (detailOpen) return armIdle();
      moved = 0; hintEl.classList.remove("gone");
    }, 10000);
  }
  armIdle();

  /* ---------- one day ---------- */
  const day = $("#day"), panel = day.querySelector(".panel");
  let detailOpen = false, cur = 0;

  function miniMap(dayNo) {
    const m = $("#mini"); m.textContent = "";
    const X = (s) => (s.x / W) * 320, Y = (s) => (s.y / H) * 200;
    const gs = groupsOf.get(dayNo) || [];
    gs.forEach((g) => {
      const pts = g.days.map((d) => starByDay.get(d));
      svg("path", { class: "ml", d: "M" + pts.map((s) => `${X(s).toFixed(1)} ${Y(s).toFixed(1)}`).join("L") }, m);
    });
    for (const s of stars) {
      const c = svg("circle", { class: "md" + (s.empty ? "" : " f") + (s.day === dayNo ? " cur" : ""), cx: X(s).toFixed(1), cy: Y(s).toFixed(1), r: s.day === dayNo ? 6 : s.empty ? 1.6 : 3.2 }, m);
      if (!s.empty) c.addEventListener("click", () => openDay(s.day));
    }
    const s = starByDay.get(dayNo);
    svg("circle", { class: "ring", cx: X(s).toFixed(1), cy: Y(s).toFixed(1), r: 12 }, m);
    $("#d-group").textContent = gs.map((g) => g.name).join(" · ");
  }

  function drawPanelSprig() {
    const sp = day.querySelector(".sprig"); sp.textContent = "";
    sprig(sp, 40, 116, 78, 3, 14); sprig(sp, 84, 118, 56, 9, -12);
  }

  function openDay(n, fromEl) {
    const e = byDay.get(n); if (!e) return;
    const wasOpen = detailOpen; cur = n; detailOpen = true;
    if (hovered) leave();
    const photo = $("#d-photo");
    photo.src = e.thumb || e.photo; photo.alt = e.title || `Day ${n}`;
    const big = new Image(); big.onload = () => { if (cur === n) photo.src = e.photo; }; big.src = e.photo;
    $("#d-sketch").src = e.sketch;
    $("#d-day").textContent = "DAY " + pad3(n);
    $("#d-date").textContent = dateOf(n);
    $("#d-title").textContent = e.title || "";
    $("#d-note").textContent = e.caption || "";
    const i = filled.indexOf(n);
    $("#d-prev").disabled = i <= 0; $("#d-next").disabled = i >= filled.length - 1;
    miniMap(n); drawPanelSprig();
    day.classList.add("show"); day.setAttribute("aria-hidden", "false");
    // the panel unfolds from the star you chose
    const s = starByDay.get(n), r = (fromEl || s.el).getBoundingClientRect(), p = panel.getBoundingClientRect();
    panel.style.setProperty("--ox", (r.left + r.width / 2 - p.left).toFixed(0) + "px");
    panel.style.setProperty("--oy", (r.top + r.height / 2 - p.top).toFixed(0) + "px");
    if (!wasOpen) requestAnimationFrame(() => requestAnimationFrame(() => day.classList.add("open")));
    else day.classList.add("open");
    if (!wasOpen) history.pushState({ day: n }, "", "#day-" + n); else history.replaceState({ day: n }, "", "#day-" + n);
    hintEl.classList.add("gone");
  }

  function hideDay() {
    if (!detailOpen) return;
    detailOpen = false; day.classList.remove("open"); day.setAttribute("aria-hidden", "true");
    setTimeout(() => { if (!detailOpen) day.classList.remove("show"); }, 650);
    armIdle();
  }
  function closeDay() {
    if (!detailOpen) return;
    if (history.state && history.state.day) history.back(); else { history.replaceState(null, "", location.pathname + location.search); hideDay(); }
  }
  const step = (d) => { const i = filled.indexOf(cur) + d; if (filled[i]) openDay(filled[i]); };

  day.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeDay(); });
  $("#d-prev").addEventListener("click", () => step(-1));
  $("#d-next").addEventListener("click", () => step(1));
  addEventListener("keydown", (e) => {
    if (!detailOpen) return;
    if (e.key === "Escape") closeDay(); else if (e.key === "ArrowLeft") step(-1); else if (e.key === "ArrowRight") step(1);
  });
  addEventListener("popstate", () => {
    const m = /^#day-(\d+)$/.exec(location.hash);
    if (m && byDay.has(+m[1])) openDay(+m[1]); else hideDay();
  });

  /* ---------- go ---------- */
  let rz = 0;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(layout, 120); });
  layout();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  const m0 = /^#day-(\d+)$/.exec(location.hash);
  if (m0 && byDay.has(+m0[1])) openDay(+m0[1]);
})();
