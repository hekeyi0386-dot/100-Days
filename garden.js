/* Keyi's Garden: the mouse is a little "visitor" strolling a black-and-white garden.
 * Everything is drawn procedurally on a canvas; one flower per day, its head is that day's sketch. */
(() => {
  const $ = (s) => document.querySelector(s);
  const G = window.GARDEN;
  const TOTAL = G.total;
  const SLOT = 300; // 相邻两天在世界里的间距
  const START = 440; // 第 1 天的 x
  const WORLD = START * 2 + SLOT * TOTAL;

  const cvs = $("#scene");
  const ctx = cvs.getContext("2d");
  let W = 0, H = 0, U = 1;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cvs.width = W * dpr; cvs.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    U = Math.max(0.55, Math.min(1.25, H / 900));
  }
  addEventListener("resize", resize);
  resize();

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const hash = (a, b = 0) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

  /* ---------- 花 ---------- */
  const byDay = new Map(G.entries.map((e) => [e.day, e]));
  const flowers = [];
  for (let i = 0; i < TOTAL; i++) {
    const r = (k) => hash(i + 1, k);
    const e = byDay.get(i + 1) || null;
    const leaves = [];
    const n = e ? 2 + Math.floor(r(7) * 2) : 1;
    for (let k = 0; k < n; k++) {
      leaves.push({ t: 0.22 + (k + r(10 + k) * 0.6) * (0.5 / n), side: k % 2 ? 1 : -1, len: 34 + r(20 + k) * 30, ang: 0.85 + r(30 + k) * 0.35 });
    }
    flowers.push({
      i, day: i + 1, e, leaves,
      x: START + i * SLOT + (r(1) - 0.5) * 110,
      d: r(2),
      h: e ? 230 + r(3) * 110 : 62 + r(3) * 38,
      lean: (r(4) - 0.5) * 70,
      phase: r(5) * 6.28,
      tilt: (r(6) - 0.5) * 0.5,
      bloom: 0, hover: 0, grow: 0,
      head: null, readyAt: 0,
      hx: 0, hy: 0, hr: 0,
    });
    if (e) loadHead(flowers[i]);
  }
  const order = flowers.slice().sort((a, b) => a.d - b.d);

  // 素描 -> 圆形、边缘羽化的花头
  function loadHead(f) {
    const img = new Image();
    img.onload = () => {
      const S = 512, c = document.createElement("canvas");
      c.width = c.height = S;
      const g = c.getContext("2d");
      const m = Math.min(img.width, img.height);
      g.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
      g.globalCompositeOperation = "destination-in";
      const gr = g.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S * 0.5);
      gr.addColorStop(0, "rgba(0,0,0,1)");
      gr.addColorStop(0.6, "rgba(0,0,0,.85)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
      f.head = c; f.readyAt = performance.now();
    };
    img.src = f.e.sketch;
    f.e._pre = new Image(); f.e._pre.src = f.e.photo; // 预加载照片
  }

  /* ---------- 状态 ---------- */
  let mx = innerWidth * 0.3, my = innerHeight * 0.8, inside = false, moved = 0;
  let px = mx, py = my, vx = 0, dir = 1, stepT = 0;
  let camX = 0, camTarget = null, wind = 0.6;
  let hovered = null, modalOpen = false;
  const prints = [];
  const motes = Array.from({ length: 38 }, (_, i) => ({
    x: hash(i, 1) * 2000, y: hash(i, 2), r: 1.5 + hash(i, 3) * 4, sp: 6 + hash(i, 4) * 14, ph: hash(i, 5) * 6.28, par: 0.2 + hash(i, 6) * 0.9, dark: hash(i, 7) > 0.8,
  }));

  /* ---------- 背景 ---------- */
  function hill(par, base, amp, seed, c0, c1) {
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 12; x += 12) {
      const wx = x + camX * par;
      const y = base - amp * (0.55 * Math.sin(wx * 0.004 + seed) + 0.3 * Math.sin(wx * 0.0097 + seed * 2) + 0.15 * Math.sin(wx * 0.021 + seed * 3));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath();
    const g = ctx.createLinearGradient(0, base - amp, 0, base + amp * 1.6);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    ctx.fillStyle = g; ctx.fill();
  }

  function drawBack(t) {
    const hz = H * 0.5;
    let g = ctx.createLinearGradient(0, 0, 0, hz + 40);
    g.addColorStop(0, "#f9f9f7"); g.addColorStop(0.6, "#ececea"); g.addColorStop(1, "#dededc");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz + 40);

    const sx = W * 0.72 - camX * 0.03, sy = H * 0.2;
    g = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.55);
    g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(0.25, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.07);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,.0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, H * 0.07, 0, 7); ctx.fill();

    hill(0.08, hz - 60, 70, 1.3, "#e3e3e0", "#ebebe9");
    hill(0.18, hz - 25, 46, 4.1, "#d4d4d1", "#e1e1de");
    hill(0.35, hz + 5, 28, 7.7, "#c6c6c3", "#d3d3d0");

    // 地面
    g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, "#d6d6d3"); g.addColorStop(0.5, "#c9c9c6"); g.addColorStop(1, "#b2b2af");
    ctx.fillStyle = g; ctx.fillRect(0, hz + 14, W, H);
    // 地平线雾
    g = ctx.createLinearGradient(0, hz - 70, 0, hz + 90);
    g.addColorStop(0, "rgba(246,246,244,0)"); g.addColorStop(0.5, "rgba(246,246,244,.6)"); g.addColorStop(1, "rgba(246,246,244,0)");
    ctx.fillStyle = g; ctx.fillRect(0, hz - 70, W, 160);
  }

  function drawGrass(t) {
    const cell = 46, c0 = Math.floor(camX / cell) - 1, c1 = Math.ceil((camX + W) / cell) + 1;
    ctx.lineCap = "round";
    for (let c = c0; c <= c1; c++) {
      if (hash(c, 11) < 0.3) continue;
      const dd = hash(c, 10), y = H * (0.56 + 0.4 * dd), sc = U * (0.5 + 0.7 * dd);
      const x = c * cell + hash(c, 9) * cell - camX;
      ctx.strokeStyle = `rgba(35,35,35,${0.16 + 0.22 * dd})`;
      ctx.lineWidth = 1.1 * sc + 0.3;
      for (let k = 0; k < 4; k++) {
        const len = (10 + hash(c, 20 + k) * 16) * sc, lean = (hash(c, 30 + k) - 0.5) * 14 * sc;
        const sw = Math.sin(t * 0.0012 + c + k) * 3 * sc * wind;
        ctx.beginPath(); ctx.moveTo(x + k * 3 * sc, y);
        ctx.quadraticCurveTo(x + k * 3 * sc + lean * 0.3, y - len * 0.6, x + k * 3 * sc + lean + sw, y - len);
        ctx.stroke();
      }
    }
  }

  function drawPrints(t) {
    for (let i = prints.length - 1; i >= 0; i--) {
      const p = prints[i], a = 1 - (t - p.t) / 3200;
      if (a <= 0) { prints.splice(i, 1); continue; }
      ctx.fillStyle = `rgba(30,30,30,${a * 0.22})`;
      ctx.beginPath(); ctx.ellipse(p.x - camX, p.y, 3.4 * p.s, 1.7 * p.s, 0, 0, 7); ctx.fill();
    }
  }

  /* ---------- 花的绘制 ---------- */
  function geom(f, t, pwx) {
    const s = U * (0.68 + 0.5 * f.d);
    const rx = f.x - camX, ry = H * (0.6 + 0.3 * f.d);
    const ge = ease(f.grow);
    const hh = f.h * s * ge * (0.94 + 0.08 * f.bloom);
    const sway = Math.sin(t * 0.0009 + f.phase) * (5 + 5 * wind) * s * ge + Math.sin(t * 0.0023 + f.phase * 2) * 1.5 * s;
    const toward = clamp((pwx - f.x) * 0.06, -26, 26) * f.bloom * s;
    const hx = rx + f.lean * s * ge + sway + toward, hy = ry - hh;
    return { s, rx, ry, hh, ge, hx, hy, cx: rx + sway * 0.1, cy: ry - hh * 0.6 };
  }
  const qp = (a, b, c, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;

  function drawFlower(f, t, pwx) {
    const q = geom(f, t, pwx);
    const { s, rx, ry, hx, hy, cx, cy } = q;
    f.hr = 0;
    if (q.ge <= 0.01 || rx < -260 || rx > W + 260) return;
    const a = Math.min(1, 0.6 + 0.4 * f.d + 0.25 * f.bloom);
    ctx.globalAlpha = a;

    // 根部阴影
    let g = ctx.createRadialGradient(rx, ry, 0, rx, ry, 34 * s);
    g.addColorStop(0, "rgba(20,20,20,.32)"); g.addColorStop(1, "rgba(20,20,20,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(rx, ry, 34 * s, 9 * s, 0, 0, 7); ctx.fill();

    // 茎
    g = ctx.createLinearGradient(rx, ry, hx, hy);
    g.addColorStop(0, "#161616"); g.addColorStop(1, "#4d4d4b");
    ctx.strokeStyle = g; ctx.lineWidth = (f.e ? 2.8 : 2) * s + 0.4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.quadraticCurveTo(cx, cy, hx, hy); ctx.stroke();

    // 叶
    for (const L of f.leaves) {
      if (q.ge < L.t) continue;
      const lg = ease((q.ge - L.t) / 0.4);
      const sx = qp(rx, cx, hx, L.t), sy = qp(ry, cy, hy, L.t);
      const ang = -Math.PI / 2 + L.side * L.ang * (1 - 0.25 * f.bloom) + Math.sin(t * 0.0013 + f.phase + L.t * 5) * 0.06 * wind;
      const len = L.len * s * lg, ex = sx + Math.cos(ang) * len, ey = sy + Math.sin(ang) * len;
      const mx_ = (sx + ex) / 2, my_ = (sy + ey) / 2, nx = -Math.sin(ang) * len * 0.27, ny = Math.cos(ang) * len * 0.27;
      const lgr = ctx.createLinearGradient(sx, sy, ex, ey);
      lgr.addColorStop(0, "#1c1c1c"); lgr.addColorStop(1, "#9a9a98");
      ctx.fillStyle = lgr; ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(mx_ + nx, my_ + ny, ex, ey);
      ctx.quadraticCurveTo(mx_ - nx, my_ - ny, sx, sy); ctx.fill();
    }

    if (!f.e || !f.head) {
      // 还没开的花苞
      const bs = (1 + 0.25 * f.bloom) * s;
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(Math.atan2(hx - cx, -(hy - cy)));
      const bg = ctx.createLinearGradient(0, 10 * bs, 0, -12 * bs);
      bg.addColorStop(0, "#1c1c1c"); bg.addColorStop(1, "#8c8c8a");
      ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, -9 * bs, 6.5 * bs, 11 * bs, 0, 0, 7); ctx.fill();
      ctx.restore();
      f.hx = hx; f.hy = hy - 8 * s; f.hr = 28 * s;
      ctx.globalAlpha = 1; return;
    }

    // 花头
    const born = ease((t - f.readyAt) / 1400);
    const headIn = ease((q.ge - 0.5) / 0.5) * born;
    if (headIn <= 0.01) { ctx.globalAlpha = 1; return; }
    const R = 100 * s * (0.9 + 0.14 * f.bloom + 0.06 * f.hover) * (0.25 + 0.75 * headIn);
    const rot = Math.atan2(hx - cx, -(hy - cy)) * 0.8 + f.tilt * 0.3 + Math.sin(t * 0.0006 + f.phase) * 0.03;

    g = ctx.createRadialGradient(hx, hy, R * 0.2, hx, hy, R * 1.55);
    const ha = (0.55 + 0.35 * f.bloom + 0.1 * f.hover) * headIn;
    g.addColorStop(0, `rgba(255,255,255,${ha})`); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, R * 1.55, 0, 7); ctx.fill();

    ctx.save(); ctx.translate(hx, hy); ctx.rotate(rot);
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = Math.min(1, a * headIn + 0.05);
    ctx.drawImage(f.head, -R, -R, R * 2, R * 2);
    ctx.globalCompositeOperation = "source-over";
    // 苏醒时绽开的几圈弧线，呼应洋葱的年轮
    if (f.bloom > 0.02) {
      ctx.lineCap = "round";
      for (let k = 0; k < 3; k++) {
        const rr = R * (1.02 + 0.1 * k) * (0.9 + 0.1 * f.bloom), a0 = t * 0.0003 * (k % 2 ? -1 : 1) + k * 2;
        ctx.strokeStyle = `rgba(28,28,28,${0.34 * f.bloom * (1 - k * 0.25)})`;
        ctx.lineWidth = 1.3 * s;
        ctx.beginPath(); ctx.arc(0, 0, rr, a0, a0 + Math.PI * (0.55 - 0.1 * k)); ctx.stroke();
      }
    }
    ctx.restore();
    f.hx = hx; f.hy = hy; f.hr = R * 0.9;
    ctx.globalAlpha = 1;
  }

  /* ---------- 人 ---------- */
  function drawPerson(t) {
    const pd = clamp((py - H * 0.6) / (H * 0.3), 0, 1);
    const sc = U * (0.68 + 0.5 * pd);
    const moving = clamp(Math.abs(vx) / 2.2, 0, 1);
    const stride = Math.sin(t * 0.012) * moving;
    const bob = Math.abs(stride) * 2.5 * sc;

    ctx.save(); ctx.translate(px, py);
    // 灯光：人走到哪里，哪里亮一点
    let g = ctx.createRadialGradient(0, -60 * sc, 0, 0, -60 * sc, 190 * sc);
    g.addColorStop(0, "rgba(255,255,255,.5)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -60 * sc, 190 * sc, 0, 7); ctx.fill();
    // 影子
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, 26 * sc);
    g.addColorStop(0, "rgba(10,10,10,.42)"); g.addColorStop(1, "rgba(10,10,10,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 26 * sc, 7 * sc, 0, 0, 7); ctx.fill();

    ctx.translate(0, -bob); ctx.scale(sc, sc);
    ctx.transform(1, 0, clamp(-vx * 0.014, -0.3, 0.3), 1, 0, 0);
    // 脚
    ctx.fillStyle = "#151515";
    ctx.beginPath(); ctx.ellipse(-7 + stride * 5, bob / sc - 1, 5, 2.4, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7 - stride * 5, bob / sc - 1, 5, 2.4, 0, 0, 7); ctx.fill();
    // 挎包（在朝向的一侧）
    ctx.fillStyle = "#6a6a68"; ctx.beginPath(); ctx.ellipse(dir * 13, -34, 5, 7.5, dir * 0.2, 0, 7); ctx.fill();
    // 外套
    const sw = stride * 3;
    g = ctx.createLinearGradient(0, -78, 0, 0);
    g.addColorStop(0, "#222"); g.addColorStop(1, "#4f4f4d");
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(-10, -70);
    ctx.bezierCurveTo(-14, -40, -19 + sw, -14, -23 + sw, 0);
    ctx.lineTo(23 + sw, 0);
    ctx.bezierCurveTo(19 + sw, -14, 14, -40, 10, -70);
    ctx.bezierCurveTo(6, -77, -6, -77, -10, -70); ctx.fill();
    // 头
    ctx.fillStyle = "#1b1b1b"; ctx.beginPath(); ctx.arc(0, -85, 8.5, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.beginPath(); ctx.arc(-2.5 + dir * 1.5, -88, 3.2, 0, 7); ctx.fill();
    ctx.restore();
  }

  /* ---------- 更新 ---------- */
  function update(dt, t) {
    wind = 0.6 + 0.4 * Math.sin(t * 0.0003);

    // 人缓缓走向鼠标
    if (!modalOpen) {
      const k = 1 - Math.exp(-dt / 230), ox = px;
      px += (mx - px) * k;
      py += (clamp(my, H * 0.62, H * 0.93) - py) * k;
      vx = (px - ox) / dt * 16;
      if (Math.abs(vx) > 0.35) dir += (Math.sign(vx) - dir) * 0.2;
      if (Math.abs(vx) > 0.6 && t - stepT > 170) {
        stepT = t;
        prints.push({ x: px + camX, y: py + (prints.length % 2 ? 3 : -3), t, s: U * (0.68 + 0.5 * clamp((py - H * 0.6) / (H * 0.3), 0, 1)) });
        if (prints.length > 40) prints.shift();
      }
      // near left/right edge -> scroll
      if (inside && camTarget === null) {
        const ex = mx / W; let v = 0;
        if (ex > 0.74) v = (ex - 0.74) / 0.26; else if (ex < 0.26) v = -(0.26 - ex) / 0.26;
        camX += v * Math.abs(v) * 0.6 * dt;
      }
    } else vx *= 0.9;
    if (camTarget !== null) {
      camX += (camTarget - camX) * (1 - Math.exp(-dt / 260));
      if (Math.abs(camTarget - camX) < 1) camTarget = null;
    }
    camX = clamp(camX, 0, WORLD - W);

    const pwx = px + camX, pd = clamp((py - H * 0.6) / (H * 0.3), 0, 1);
    for (const f of flowers) {
      const near = clamp(1 - Math.hypot((pwx - f.x) / 280, (pd - f.d) * 1.3), 0, 1);
      f.bloom += (near - f.bloom) * (1 - Math.exp(-dt / 320));
      f.hover += ((f === hovered ? 1 : 0) - f.hover) * (1 - Math.exp(-dt / 160));
      f.grow = clamp((t - 300 - f.i * 45) / 1900, 0, 1);
    }
    return pwx;
  }

  /* ---------- 主循环 ---------- */
  let last = performance.now();
  function frame(t) {
    const dt = clamp(t - last, 1, 50); last = t;
    const pwx = update(dt, t);

    ctx.clearRect(0, 0, W, H);
    drawBack(t); drawGrass(t); drawPrints(t);
    let personDone = false;
    for (const f of order) {
      if (!personDone && H * (0.6 + 0.3 * f.d) > py) { drawPerson(t); personDone = true; }
      drawFlower(f, t, pwx);
    }
    if (!personDone) drawPerson(t);
    drawMotes(t, dt);

    // 悬停检测（用上一帧的花头位置）
    if (!modalOpen) {
      const h = hitTest(mx, my);
      if (h !== hovered) { hovered = h; updateTip(); }
    }
    cursorEl.style.transform = `translate(${mx}px,${my}px)`;
    tipEl.style.transform = `translate(${mx + 18}px,${my + 20}px)`;

    updateBar(pwx);
    requestAnimationFrame(frame);
  }

  function drawMotes(t, dt) {
    for (const m of motes) {
      m.y -= m.sp * dt / 1000 / H; if (m.y < -0.05) m.y = 1.05;
      const x = ((m.x - camX * m.par + Math.sin(t * 0.0004 + m.ph) * 30) % (W + 60) + W + 60) % (W + 60) - 30;
      const y = m.y * H, r = m.r * U * 2.2;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, m.dark ? "rgba(30,30,30,.22)" : "rgba(255,255,255,.7)"); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }

  function hitTest(x, y) {
    for (let k = order.length - 1; k >= 0; k--) {
      const f = order[k];
      if (f.hr && Math.hypot(x - f.hx, y - f.hy) < f.hr) return f;
    }
    return null;
  }

  /* ---------- HUD ---------- */
  const cursorEl = $("#cursor"), tipEl = $("#tip"), introEl = $("#intro");
  const pad = (n) => String(n).padStart(2, "0");
  function updateTip() {
    const f = hovered;
    cursorEl.classList.toggle("hot", !!(f && f.e));
    if (!f) { tipEl.classList.remove("show"); return; }
    tipEl.textContent = !f.e ? `Day ${pad(f.day)} · not yet` : f.e.title ? `Day ${pad(f.day)} · ${f.e.title}` : `Day ${pad(f.day)}`;
    tipEl.classList.add("show");
  }

  const ticksEl = $("#ticks");
  const tickBtns = flowers.map((f) => {
    const b = document.createElement("button");
    b.title = `Day ${pad(f.day)}`; if (f.e) b.classList.add("full");
    b.addEventListener("click", () => { camTarget = clamp(f.x - W * 0.5, 0, WORLD - W); });
    ticksEl.appendChild(b); return b;
  });
  // The bar reacts live: the days nearest the visitor (or the pointer, when it is over the bar) swell like a dock.
  const labelEl = document.createElement("div");
  labelEl.className = "tick-label"; ticksEl.appendChild(labelEl);
  let focusF = 0, barPointer = null, labelIdx = -1;
  const kPrev = new Array(TOTAL).fill(-1);
  ticksEl.addEventListener("pointermove", (e) => {
    const r0 = tickBtns[0].getBoundingClientRect(), r1 = tickBtns[TOTAL - 1].getBoundingClientRect();
    barPointer = clamp((e.clientX - (r0.left + r0.width / 2)) / ((r1.left - r0.left) / (TOTAL - 1)), 0, TOTAL - 1);
  });
  ticksEl.addEventListener("pointerleave", () => { barPointer = null; });
  function updateBar(pwx) {
    const target = barPointer !== null ? barPointer : clamp((pwx - START) / SLOT, 0, TOTAL - 1);
    focusF += (target - focusF) * 0.18;
    for (let i = 0; i < TOTAL; i++) {
      const d = i - focusF, k = Math.exp(-(d * d) / 6);
      if (Math.abs(k - kPrev[i]) > 0.01) { kPrev[i] = k; tickBtns[i].style.setProperty("--k", k.toFixed(2)); }
    }
    const idx = Math.round(focusF);
    if (idx !== labelIdx) {
      labelIdx = idx;
      const f = flowers[idx], b = tickBtns[idx];
      labelEl.textContent = `Day ${pad(f.day)}` + (f.e && f.e.title ? ` · ${f.e.title}` : "") + (f.e ? "" : " · not yet");
      labelEl.classList.toggle("empty", !f.e);
      labelEl.style.left = (b.offsetLeft + b.offsetWidth / 2) + "px";
    }
  }

  /* ---------- 输入 ---------- */
  function point(e) {
    if (modalOpen) return;
    const dx = e.clientX - mx, dy = e.clientY - my;
    mx = e.clientX; my = e.clientY; inside = true;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 60) introEl.classList.add("gone");
    armIdle();
  }
  // Mouse idle for a while -> the hint fades back in; any activity hides it again.
  const IDLE_MS = 10000;
  let idleTimer = 0;
  function armIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (modalOpen) return armIdle();
      moved = 0; introEl.classList.remove("gone");
    }, IDLE_MS);
  }
  armIdle();
  addEventListener("pointermove", point);
  addEventListener("pointerdown", point);
  document.addEventListener("pointerleave", () => { inside = false; });
  document.documentElement.addEventListener("mouseleave", () => { inside = false; });
  cvs.addEventListener("click", (e) => {
    const f = hitTest(e.clientX, e.clientY);
    if (f && f.e) openDay(f.day);
  });
  // passive:false + preventDefault stops the trackpad two-finger swipe from triggering browser back/forward
  addEventListener("wheel", (e) => {
    e.preventDefault();
    if (modalOpen) return;
    armIdle(); camTarget = null; camX = clamp(camX + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.9, 0, WORLD - W);
  }, { passive: false });

  /* ---------- 弹窗 ---------- */
  const modal = $("#modal");
  const filled = G.entries.map((e) => e.day).sort((a, b) => a - b);
  let cur = 0;
  function openDay(day) {
    const e = byDay.get(day); if (!e) return;
    cur = day;
    const sk = $("#m-sketch"), ph = $("#m-photo");
    sk.src = e.sketch; ph.src = e.photo;
    $("#m-day").textContent = `Day ${pad(day)}`;
    $("#m-title").textContent = e.title || "";
    $("#m-title").hidden = !e.title;
    $("#m-caption").textContent = e.caption || "";
    $("#m-caption").hidden = !e.caption;
    const idx = filled.indexOf(day);
    $("#m-prev").disabled = idx <= 0; $("#m-next").disabled = idx >= filled.length - 1;
    modalOpen = true; hovered = null; updateTip(); introEl.classList.add("gone");
    cursorEl.style.opacity = 0; tipEl.classList.remove("show");
    modal.classList.add("open"); modal.setAttribute("aria-hidden", "false");
  }
  function closeModal() {
    armIdle(); modalOpen = false; modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true");
    cursorEl.style.opacity = "";
  }
  function step(d) { const i = filled.indexOf(cur) + d; if (filled[i]) openDay(filled[i]); }
  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
  $("#m-prev").addEventListener("click", () => step(-1));
  $("#m-next").addEventListener("click", () => step(1));
  addEventListener("keydown", (e) => {
    if (modalOpen) {
      if (e.key === "Escape") closeModal();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      armIdle(); camTarget = clamp((camTarget ?? camX) + (e.key === "ArrowRight" ? 1 : -1) * SLOT * 2, 0, WORLD - W);
    }
  });

  requestAnimationFrame(frame);
})();
