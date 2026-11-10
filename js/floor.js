// Floor: the 90s disco — lit checkerboard floor in perspective, the crowd,
// disco ball, light beams, and the big screen on the back wall.
window.Floor = (function () {
  const Z0 = 700, D = 700, SB = Z0 / (D + Z0);       // perspective: scale = Z0 / (z + Z0)
  const ROWS = 5, ROWZ = 125, COLW = 145, TILE = 100, SPR = 1.2, NPC_MIN = 28, SLOT = 12000;
  const HUES = [322, 187, 54, 100, 28, 275];
  const LIT = HUES.map((h) => `hsl(${h},100%,60%)`), DIM = HUES.map((h) => `hsl(${h},85%,17%)`);
  const BEAMS = ['255,46,147', '0,229,255', '255,230,0', '125,255,58', '181,77,255'];

  let cv, ctx, cw = 0, ch = 0, dpr = 1, base = 1, hor = 0, front = 0, backY = 0;
  let cam = 0, camTarget = null, camMax = 300, drag = null, hover = null, focus = null;
  const real = new Map();
  let npcs = [], order = [], meId = null;
  let items = [], forced = null, forcedUntil = 0, screenRect = { x: 0, y: 0, w: 0, h: 0 };
  const api = { onPick: null, onScreen: null, overlay: null };

  const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const hash3 = (a, b, c) => { let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 362437)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return (n ^ (n >>> 16)) >>> 0; };
  const mod = (a, n) => ((a % n) + n) % n;
  const wallX = (x) => cw / 2 + (x - cam) * base * SB;

  // ---------- crowd ----------
  function prep(d) {
    d.h = hashStr(d.id); d.phase = d.h % 8; d.mirror = !!(d.h & 16);
    if (d.x === undefined) { d.x = 0; d.z = 300; }
    return d;
  }
  function loadSprite(d) {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = Rig.W; c.height = Rig.H;
      c.getContext('2d').drawImage(im, 0, 0, Rig.W, Rig.H);
      d.parts = Rig.partsFromCanvas(c);
    };
    if (DD.api) im.crossOrigin = 'anonymous';
    im.src = DD.img(d);
  }
  function relayout() {
    const list = [...real.values()].sort((a, b) => a.ts - b.ts);
    const need = Math.max(0, NPC_MIN - list.length);
    while (npcs.length < need) { const n = prep(Rig.npc(npcs.length)); n.parts = Rig.partsFromCanvas(n.canvas); npcs.push(n); }
    const all = list.concat(npcs.slice(0, need));
    all.forEach((d, i) => {   // fill columns from the centre outwards
      const c = Math.floor(i / ROWS), row = [2, 0, 4, 1, 3][(i + c * 2) % ROWS];
      const cs = c === 0 ? 0 : (c % 2 ? (c + 1) / 2 : -c / 2);
      d.x = cs * COLW + (row % 2 ? COLW / 2 : 0) + ((d.h % 1000) / 1000 - 0.5) * 44;
      d.z = 75 + row * ROWZ + (((d.h >>> 10) % 1000) / 1000 - 0.5) * 50;
    });
    order = all.sort((a, b) => b.z - a.z);
    camMax = Math.max(320, Math.ceil(Math.ceil(all.length / ROWS) / 2) * COLW + 60);
  }
  function upsert(d) {
    const old = real.get(d.id);
    if (old) {
      const reload = old.v !== d.v;
      Object.assign(old, d);
      if (reload) loadSprite(old);
    } else { real.set(d.id, prep(d)); loadSprite(d); }
    relayout();
  }
  function set(list) { real.clear(); for (const d of list) { real.set(d.id, prep(d)); loadSprite(d); } relayout(); }
  function remove(id) { real.delete(id); relayout(); }
  const get = (id) => real.get(id) || npcs.find((n) => n.id === id);

  // ---------- geometry ----------
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = window.innerWidth; ch = window.innerHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    base = Math.min(0.33 * ch / 230, cw / 560);
    front = ch * 1.06; backY = ch * 0.58;
    hor = (backY - front * SB) / (1 - SB);
  }
  const scaleAt = (z) => Z0 / (z + Z0);

  // ---------- drawing ----------
  function drawWall(beat, t) {
    const g = ctx.createLinearGradient(0, 0, 0, backY);
    g.addColorStop(0, '#07011a'); g.addColorStop(1, '#2c0a4a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, backY + 1);

    // wall-to-wall equaliser
    const pf = base * SB, bw = 44, step = Math.floor(beat * 2), fr = beat * 2 - step, seg = Math.max(6, ch * 0.016);
    const i0 = Math.floor((cam - cw / 2 / pf) / bw), i1 = Math.ceil((cam + cw / 2 / pf) / bw);
    for (let i = i0; i <= i1; i++) {
      const v = (0.12 + 0.88 * (hash3(i, 7, step) % 1000) / 1000) * (1 - fr * 0.55);
      const n = Math.round(v * backY * 0.62 / seg), x = wallX(i * bw) + 1.5, w = bw * pf - 3;
      for (let k = 0; k < n; k++) {
        const q = k * seg / (backY * 0.62);
        ctx.fillStyle = q > 0.75 ? 'rgba(255,46,90,.5)' : q > 0.5 ? 'rgba(255,230,0,.4)' : 'rgba(60,255,120,.3)';
        ctx.fillRect(x, backY - (k + 1) * seg, w, seg - 2);
      }
    }
    // neon signs
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = Math.round(ch * 0.085);
    const sign = (txt, x, col, flick) => {
      ctx.font = `italic 900 ${fs}px "Arial Black", "PingFang SC", sans-serif`;
      ctx.globalAlpha = flick ? 0.35 : 1;
      ctx.shadowColor = col; ctx.shadowBlur = 22; ctx.lineWidth = 3; ctx.strokeStyle = col;
      ctx.strokeText(txt, wallX(x), backY * 0.3); ctx.fillStyle = '#fff'; ctx.fillText(txt, wallX(x), backY * 0.3);
    };
    sign('DISCO', -760, '#ff2e93', hash3(1, 2, Math.floor(t * 9)) % 17 === 0);
    sign('蹦迪', 760, '#00e5ff', hash3(3, 4, Math.floor(t * 9)) % 23 === 0);
    ctx.restore();
  }

  function wrap(text, maxW, maxLines) {
    // break between CJK characters or between Latin words; never start a line with punctuation
    const toks = []; let word = '';
    for (const chr of text) {
      if (chr.charCodeAt(0) > 0x2e7f) { if (word) { toks.push(word); word = ''; } toks.push(chr); }
      else if (chr === ' ') { toks.push(word + ' '); word = ''; }
      else word += chr;
    }
    if (word) toks.push(word);
    const lines = []; let cur = '';
    for (const tk of toks) {
      if (ctx.measureText((cur + tk).trimEnd()).width > maxW && cur && !'，。！？、；：,.!?)）】》”’~…'.includes(tk[0])) { lines.push(cur.trimEnd()); cur = tk; } else cur += tk;
    }
    cur = cur.trimEnd();
    if (cur) lines.push(cur);
    return lines.length <= maxLines ? lines : null;
  }

  function drawScreen(beat, t) {
    const sw = Math.min(cw * 0.94, ch * 0.64), sh = sw * 0.46, x = wallX(0) - sw / 2, y = ch * 0.115;
    screenRect = { x, y, w: sw, h: sh };
    const now = Date.now();
    let item = null, prog = (now % SLOT) / SLOT;
    if (forced && now < forcedUntil) { item = forced; prog = 1 - (forcedUntil - now) / SLOT; }
    else if (items.length) { const i = Math.floor(now / SLOT) % (items.length + 1); item = i < items.length ? items[i] : null; }

    // speakers
    const pw = ch * 0.085, ph = ch * 0.3, kick = 1 + 0.12 * Math.pow(1 - (beat % 1), 3);
    for (const sx of [x - pw - 14, x + sw + 14]) {
      ctx.fillStyle = '#0b0b12'; ctx.fillRect(sx, backY - ph, pw, ph);
      ctx.strokeStyle = '#3a3a55'; ctx.lineWidth = 2; ctx.strokeRect(sx, backY - ph, pw, ph);
      for (const [fy, fr] of [[0.28, 0.3], [0.7, 0.4]]) {
        ctx.beginPath(); ctx.arc(sx + pw / 2, backY - ph + ph * fy, pw * fr * kick, 0, 7); ctx.fillStyle = '#23233a'; ctx.fill();
        ctx.beginPath(); ctx.arc(sx + pw / 2, backY - ph + ph * fy, pw * fr * 0.4 * kick, 0, 7); ctx.fillStyle = '#55557a'; ctx.fill();
      }
    }
    // frame
    ctx.fillStyle = '#1a1a26'; ctx.fillRect(x - 8, y - 8, sw + 16, sh + 16);
    ctx.strokeStyle = `hsl(${(beat * 40) % 360},100%,60%)`; ctx.lineWidth = 3; ctx.strokeRect(x - 8, y - 8, sw + 16, sh + 16);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, sw, sh); ctx.clip();
    ctx.fillStyle = '#06021a'; ctx.fillRect(x, y, sw, sh);
    ctx.textBaseline = 'middle';

    if (item) {
      const d = item.dancerId && real.get(item.dancerId);
      let tx = x + sw * 0.06, tw = sw * 0.88;
      if (d && d.parts) {
        const g = ctx.createRadialGradient(x + sw * 0.17, y + sh * 0.6, 4, x + sw * 0.17, y + sh * 0.6, sh * 0.7);
        g.addColorStop(0, 'rgba(255,46,147,.55)'); g.addColorStop(1, 'rgba(255,46,147,0)');
        ctx.fillStyle = g; ctx.fillRect(x, y, sw * 0.4, sh);
        Rig.draw(ctx, d.parts, Rig.poseAt(d.move, beat + d.phase, d.mirror), x + sw * 0.17, y + sh * 0.97, sh * 0.82 / Rig.H);
        tx = x + sw * 0.34; tw = sw * 0.62;
      }
      ctx.textAlign = 'left';
      ctx.font = `900 ${Math.round(sh * 0.1)}px "PingFang SC", sans-serif`;
      ctx.fillStyle = '#00e5ff';
      ctx.fillText(T('scrHolding', { name: I18N.name(item.name) }), tx, y + sh * 0.13, tw);
      let size = sh * 0.26, lines = null;
      for (; size > sh * 0.09; size *= 0.88) {
        ctx.font = `900 ${Math.round(size)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        lines = wrap(item.text, tw, Math.max(1, Math.floor(sh * 0.62 / (size * 1.2))));
        if (lines) break;
      }
      lines = lines || [item.text];
      const lh = size * 1.2, y0 = y + sh * 0.55 - (lines.length - 1) * lh / 2, off = Math.max(2, size * 0.07);
      lines.forEach((ln, i) => {
        ctx.fillStyle = '#ff2e93'; ctx.fillText(ln, tx + off, y0 + i * lh + off);
        ctx.fillStyle = `hsl(${(beat * 30 + i * 40) % 360},100%,${beat % 1 < 0.5 ? 72 : 62}%)`; ctx.fillText(ln, tx, y0 + i * lh);
      });
      ctx.fillStyle = '#ffe600'; ctx.fillRect(x, y + sh - 5, sw * (1 - prog), 5);
    } else {
      ctx.textAlign = 'center';
      const word = 'DISCO DOODLE', fs = sw * 0.105;
      ctx.font = `italic 900 ${Math.round(fs)}px "Arial Black", sans-serif`;
      const full = ctx.measureText(word).width; let px = x + sw / 2 - full / 2;
      ctx.textAlign = 'left';
      [...word].forEach((c, i) => {
        const yy = y + sh * 0.36 + Math.sin(beat * Math.PI + i * 0.6) * sh * 0.05;
        ctx.fillStyle = '#6a00ff'; ctx.fillText(c, px + 3, yy + 3);
        ctx.fillStyle = `hsl(${(i * 30 + t * 90) % 360},100%,62%)`; ctx.fillText(c, px, yy);
        px += ctx.measureText(c).width;
      });
      ctx.textAlign = 'center';
      ctx.font = `900 ${Math.round(sh * 0.14)}px "PingFang SC", sans-serif`;
      if (beat % 2 < 1.4) { ctx.fillStyle = '#ffe600'; ctx.fillText(T('scrCta'), x + sw / 2, y + sh * 0.68, sw * 0.94); }
      ctx.font = `700 ${Math.round(sh * 0.085)}px "PingFang SC", sans-serif`;
      ctx.fillStyle = '#7dff3a'; ctx.fillText(T('scrSub'), x + sw / 2, y + sh * 0.88, sw * 0.9);
    }
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    for (let yy = y; yy < y + sh; yy += 3) ctx.fillRect(x, yy, sw, 1);
    ctx.restore();
  }

  function drawBall(t) {
    const bx = wallX(0), by = ch * 0.052, r = ch * 0.036;
    ctx.strokeStyle = '#888'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, by - r); ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.arc(bx, by, r, 0, 7); ctx.clip();
    const g = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.3, 1, bx, by, r);
    g.addColorStop(0, '#f4f4ff'); g.addColorStop(1, '#4a4a70');
    ctx.fillStyle = g; ctx.fillRect(bx - r, by - r, r * 2, r * 2);
    const n = 8, q = (r * 2) / n, sh = Math.floor(t * 6);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a = (hash3(i + sh, j, 5) % 100) / 100;
      ctx.fillStyle = a > 0.82 ? 'rgba(255,255,255,.95)' : `rgba(${a > 0.5 ? '120,200,255' : '20,10,60'},${0.25 + a * 0.3})`;
      ctx.fillRect(bx - r + i * q + 0.5, by - r + j * q + 0.5, q - 1, q - 1);
    }
    ctx.restore();
  }

  function drawFloor(beat) {
    ctx.fillStyle = '#08010f'; ctx.fillRect(0, backY, cw, ch - backY);
    const b = Math.floor(beat), pf = base * SB, cx = cw / 2, G = 3;
    const i0 = Math.floor((cam - cx / pf) / TILE) - 1, i1 = Math.ceil((cam + cx / pf) / TILE);
    for (let j = D / TILE - 1; j >= 0; j--) {
      const s0 = scaleAt(j * TILE + G), s1 = scaleAt((j + 1) * TILE - G);
      const y0 = hor + (front - hor) * s0, y1 = hor + (front - hor) * s1;
      for (let i = i0; i <= i1; i++) {
        const xa = i * TILE + G - cam, xb = (i + 1) * TILE - G - cam;
        const ax = cx + xa * base * s0, bx = cx + xb * base * s0;
        if (bx < 0 && cx + xb * base * s1 < 0) continue;
        if (ax > cw && cx + xa * base * s1 > cw) continue;
        const k = mod(i * 3 + j * 5 + Math.floor(b / 4), 6);
        ctx.fillStyle = hash3(i, j, b) % 3 === 0 ? LIT[k] : DIM[k];
        ctx.beginPath(); ctx.moveTo(ax, y0); ctx.lineTo(bx, y0); ctx.lineTo(cx + xb * base * s1, y1); ctx.lineTo(cx + xa * base * s1, y1); ctx.fill();
      }
    }
    const g = ctx.createLinearGradient(0, backY, 0, backY + ch * 0.12);
    g.addColorStop(0, 'rgba(8,1,15,.85)'); g.addColorStop(1, 'rgba(8,1,15,0)');
    ctx.fillStyle = g; ctx.fillRect(0, backY, cw, ch * 0.12);
  }

  function tag(text, x, y, col) {
    ctx.font = '900 13px "PingFang SC", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.fillRect(x - w / 2, y - 10, w, 20);
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.strokeRect(x - w / 2, y - 10, w, 20);
    ctx.fillStyle = col; ctx.fillText(text, x, y + 1);
  }

  function drawCrowd(beat, now) {
    for (const d of order) {
      const s = scaleAt(d.z), sc = base * s * SPR;
      const x = cw / 2 + (d.x - cam) * base * s, y = hor + (front - hor) * s;
      d.sx = x; d.sy = y; d.sc = sc;
      if (x < -120 * sc || x > cw + 120 * sc) continue;
      const isFocus = focus && focus.id === d.id && now < focus.until;
      if (isFocus) {
        ctx.strokeStyle = '#ffe600'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, y, (46 + 8 * Math.sin(beat * 6.28)) * sc, 13 * sc, 0, 0, 7); ctx.stroke();
        const g = ctx.createLinearGradient(0, y - 320 * sc, 0, y);
        g.addColorStop(0, 'rgba(255,240,150,0)'); g.addColorStop(1, 'rgba(255,240,150,.35)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 12 * sc, y - 320 * sc); ctx.lineTo(x + 12 * sc, y - 320 * sc); ctx.lineTo(x + 50 * sc, y); ctx.lineTo(x - 50 * sc, y); ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.ellipse(x, y, 34 * sc, 8 * sc, 0, 0, 7); ctx.fill();
      Rig.draw(ctx, d.parts, Rig.poseAt(d.move, beat + d.phase, d.mirror), x, y, sc);
      const top = y - 205 * sc;
      if (d.id === meId) {
        const bob = Math.abs(Math.sin(beat * Math.PI)) * 6;
        ctx.fillStyle = '#ffe600'; ctx.beginPath(); ctx.moveTo(x - 8, top - 12 - bob); ctx.lineTo(x + 8, top - 12 - bob); ctx.lineTo(x, top - bob); ctx.fill();
        tag(T('meTag'), x, top - 24 - bob, '#ffe600');
      } else if (isFocus || hover === d) tag(I18N.name(d.name), x, top - 6, isFocus ? '#ffe600' : '#00e5ff');
    }
  }

  function drawLights(beat, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const ox = cw * (0.08 + 0.21 * i), a = Math.sin(t * 0.7 + i * 1.7) * 0.55, len = ch * 1.15, hw = 0.075;
      const ex = ox + Math.sin(a) * len, ey = Math.cos(a) * len;
      const g = ctx.createLinearGradient(ox, 0, ex, ey);
      g.addColorStop(0, `rgba(${BEAMS[i]},.34)`); g.addColorStop(1, `rgba(${BEAMS[i]},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ox, -4);
      ctx.lineTo(ox + Math.sin(a - hw) * len, Math.cos(a - hw) * len); ctx.lineTo(ox + Math.sin(a + hw) * len, Math.cos(a + hw) * len); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    for (let i = 0; i < 34; i++) {
      const a = t * 0.35 + i * 1.9;
      const x = cw * (0.5 + 0.56 * Math.sin(a + i)), y = ch * (0.5 + 0.48 * Math.sin(a * 0.73 + i * 2.1));
      ctx.beginPath(); ctx.ellipse(x, y, 5 + (i % 4) * 2.5, 3 + (i % 3) * 2, 0, 0, 7); ctx.fill();
    }
    ctx.restore();
    const g = ctx.createLinearGradient(0, ch * 0.82, 0, ch);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.6)');
    ctx.fillStyle = g; ctx.fillRect(0, ch * 0.82, cw, ch * 0.18);
  }

  function frame() {
    requestAnimationFrame(frame);
    const beat = Beat.beat(), t = performance.now() / 1000, now = Date.now();
    if (camTarget !== null) { cam += (camTarget - cam) * 0.09; if (Math.abs(camTarget - cam) < 1) camTarget = null; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawWall(beat, t); drawScreen(beat, t); drawBall(t); drawFloor(beat); drawCrowd(beat, now); drawLights(beat, t);
    if (api.overlay) api.overlay(beat);
  }

  // ---------- interaction ----------
  function hit(x, y) {
    for (let i = order.length - 1; i >= 0; i--) {
      const d = order[i];
      if (d.sc && Math.abs(x - d.sx) < 40 * d.sc && y < d.sy + 4 && y > d.sy - 196 * d.sc) return d;
    }
    return null;
  }
  const clampCam = (v) => Math.max(-camMax, Math.min(camMax, v));
  function focusOn(id, ms) {
    const d = get(id);
    if (!d) return false;
    camTarget = clampCam(d.x); focus = { id, until: Date.now() + (ms || 7000) };
    return true;
  }

  function init(canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    resize(); addEventListener('resize', resize);
    relayout();
    cv.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, cam, moved: false };
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    });
    cv.addEventListener('pointermove', (e) => {
      if (drag) {
        const dx = e.clientX - drag.x;
        if (Math.abs(dx) > 6) drag.moved = true;
        if (drag.moved) { cam = clampCam(drag.cam - dx / (base * 0.75)); camTarget = null; }
      } else if (e.pointerType === 'mouse') {
        hover = hit(e.clientX, e.clientY);
        const r = screenRect, onScr = e.clientX > r.x && e.clientX < r.x + r.w && e.clientY > r.y && e.clientY < r.y + r.h;
        cv.classList.toggle('pick', !!hover || onScr);
      }
    });
    const up = (e) => {
      const was = drag; drag = null;
      if (!was || was.moved || e.type === 'pointercancel') return;
      const x = e.clientX, y = e.clientY, r = screenRect;
      if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) { if (api.onScreen) api.onScreen(); return; }
      const d = hit(x, y);
      if (d && api.onPick) api.onPick(d);
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); cam = clampCam(cam + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.9); camTarget = null; }, { passive: false });
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') camTarget = clampCam((camTarget === null ? cam : camTarget) - 240);
      if (e.key === 'ArrowRight') camTarget = clampCam((camTarget === null ? cam : camTarget) + 240);
    });
    requestAnimationFrame(frame);
  }

  return Object.assign(api, {
    init, set, upsert, remove, get, focusOn,
    setMe: (id) => { meId = id; },
    setScreen: (list) => { items = list.slice(-8); },
    pushScreen: (item) => { items.push(item); items = items.slice(-8); forced = item; forcedUntil = Date.now() + SLOT; },
    search: (q) => { q = q.trim().toLowerCase(); return q ? order.filter((d) => I18N.name(d.name).toLowerCase().includes(q)).slice(0, 12) : []; },
    count: () => ({ real: real.size, total: order.length }),
  });
})();
