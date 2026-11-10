// Editor: an MS-Paint-ish pixel canvas layered over the default mannequin,
// with a live "try the dance" preview of the puppet being drawn.
window.Editor = (function () {
  const $ = (id) => document.getElementById(id);
  const W = Rig.W, H = Rig.H;
  const PAL = [
    '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#804000', '#004040', '#0080ff', '#8000ff', '#f6d7b0', '#e9b98a', '#c68642', '#8d5524',
    '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff8040', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ffff80', '#ffb3d9', '#b54dff',
  ];
  const TOOLS = [['pencil', '✏️'], ['spray', '💨'], ['fill', '🪣'], ['eraser', '🧽'], ['pick', '💉']];
  const SIZES = [1, 2, 4, 8];

  let ink, ictx, base, pv, pctx, comp, cctx;
  let tool = 'pencil', size = 2, color = '#ff0080', move = 'bounce';
  let undo = [], parts = null, dirty = true, lastBuild = 0, running = false, sprayTimer = null;
  let down = false, lx = 0, ly = 0, cbs = {}, editing = false;

  const spans = {};
  for (const s of SIZES) {
    const c = (s - 1) / 2, rows = [];
    for (let j = 0; j < s; j++) {
      let a = -1, b = -1;
      for (let i = 0; i < s; i++) if ((i - c) * (i - c) + (j - c) * (j - c) <= (s / 2) * (s / 2)) { if (a < 0) a = i; b = i; }
      if (a >= 0) rows.push([a, j, b - a + 1]);
    }
    spans[s] = rows;
  }

  function stamp(x, y) {
    const o = Math.floor(size / 2);
    for (const [a, j, len] of spans[size]) {
      if (tool === 'eraser') ictx.clearRect(x - o + a, y - o + j, len, 1);
      else ictx.fillRect(x - o + a, y - o + j, len, 1);
    }
  }
  function line(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      stamp(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function spray() {
    const rad = size * 1.5 + 4;
    for (let i = 0; i < size * 3 + 8; i++) {
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * rad;
      ictx.fillRect(Math.round(lx + Math.cos(a) * r), Math.round(ly + Math.sin(a) * r), 1, 1);
    }
    dirty = true;
  }
  function composite() {
    cctx.clearRect(0, 0, W, H);
    if ($('showBase').checked) cctx.drawImage(base, 0, 0);
    cctx.drawImage(ink, 0, 0);
    return comp;
  }
  function fill(x, y) {
    const src = composite().getContext('2d').getImageData(0, 0, W, H).data;
    const out = ictx.getImageData(0, 0, W, H), o = out.data;
    const i0 = (y * W + x) * 4, T = [src[i0], src[i0 + 1], src[i0 + 2], src[i0 + 3]];
    const R = parseInt(color.slice(1, 3), 16), G = parseInt(color.slice(3, 5), 16), B = parseInt(color.slice(5, 7), 16);
    if (T[3] === 255 && T[0] === R && T[1] === G && T[2] === B) return;
    const seen = new Uint8Array(W * H), stack = [y * W + x];
    while (stack.length) {
      const p = stack.pop();
      if (seen[p]) continue;
      const q = p * 4;
      if (src[q] !== T[0] || src[q + 1] !== T[1] || src[q + 2] !== T[2] || src[q + 3] !== T[3]) continue;
      seen[p] = 1;
      o[q] = R; o[q + 1] = G; o[q + 2] = B; o[q + 3] = 255;
      const px = p % W;
      if (px > 0) stack.push(p - 1);
      if (px < W - 1) stack.push(p + 1);
      if (p >= W) stack.push(p - W);
      if (p < W * (H - 1)) stack.push(p + W);
    }
    ictx.putImageData(out, 0, 0);
  }
  function pushUndo() { undo.push(ictx.getImageData(0, 0, W, H)); if (undo.length > 40) undo.shift(); }
  function doUndo() { const u = undo.pop(); if (u) { ictx.putImageData(u, 0, 0); dirty = true; } }

  function setColor(c) { color = c; $('cur').style.background = c; ictx.fillStyle = c; }
  function mark(box, key, val) { for (const b of box.children) b.classList.toggle('on', b.dataset[key] === String(val)); }
  function setTool(t) { tool = t; mark($('tools'), 't', t); }
  function setSize(s) { size = s; mark($('sizes'), 's', s); }
  function setMove(m) { move = Rig.MOVES[m] ? m : 'bounce'; mark($('moves'), 'm', move); }

  function at(e) {
    const r = ink.getBoundingClientRect();
    return [Math.floor((e.clientX - r.left) / r.width * W), Math.floor((e.clientY - r.top) / r.height * H)];
  }
  function onDown(e) {
    e.preventDefault();
    const [x, y] = at(e);
    if (tool === 'pick') {
      const d = composite().getContext('2d').getImageData(x, y, 1, 1).data;
      if (d[3]) setColor('#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
      setTool('pencil');
      return;
    }
    pushUndo();
    ictx.fillStyle = color;
    if (tool === 'fill') { if (x >= 0 && y >= 0 && x < W && y < H) fill(x, y); dirty = true; return; }
    down = true; lx = x; ly = y;
    try { ink.setPointerCapture(e.pointerId); } catch (_) {}
    if (tool === 'spray') { spray(); sprayTimer = setInterval(spray, 30); }
    else { stamp(x, y); dirty = true; }
  }
  function onMove(e) {
    if (!down) return;
    const [x, y] = at(e);
    if (tool !== 'spray') { line(lx, ly, x, y); dirty = true; }
    lx = x; ly = y;
  }
  function onUp() { down = false; clearInterval(sprayTimer); }

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const now = performance.now();
    if (dirty && now - lastBuild > 120) { parts = Rig.partsFromCanvas(composite()); dirty = false; lastBuild = now; }
    const beat = Beat.beat(), w = pv.width, h = pv.height;
    pctx.fillStyle = '#12021f'; pctx.fillRect(0, 0, w, h);
    const cols = ['#ff2e93', '#00e5ff', '#ffe600', '#7dff3a'];
    for (let i = 0; i < 5; i++) {
      pctx.globalAlpha = (i + Math.floor(beat)) % 2 ? 0.75 : 0.3;
      pctx.fillStyle = cols[(i + Math.floor(beat / 2)) % 4];
      pctx.fillRect(i * 30 + 1, h - 22, 28, 20);
    }
    pctx.globalAlpha = 1;
    Rig.draw(pctx, parts, Rig.poseAt(move, beat, false), w / 2, h - 10, 1);
  }

  function init(callbacks) {
    cbs = callbacks;
    ink = $('ink'); ictx = ink.getContext('2d'); base = $('base'); pv = $('preview'); pctx = pv.getContext('2d');
    pctx.imageSmoothingEnabled = false;
    comp = document.createElement('canvas'); comp.width = W; comp.height = H; cctx = comp.getContext('2d');
    base.getContext('2d').drawImage(Rig.paint(), 0, 0);

    for (const [t, icon] of TOOLS) {
      const b = document.createElement('button'); b.textContent = icon; b.dataset.t = t;
      b.onclick = () => setTool(t); $('tools').appendChild(b);
    }
    for (const s of SIZES) {
      const b = document.createElement('button'), i = document.createElement('i'); b.dataset.s = s; b.title = s + 'px';
      i.style.width = i.style.height = Math.max(2, s * 1.6) + 'px'; b.appendChild(i);
      b.onclick = () => setSize(s); $('sizes').appendChild(b);
    }
    for (const c of PAL) {
      const b = document.createElement('button'); b.style.background = c; b.title = c;
      b.onclick = () => { setColor(c); if (tool === 'eraser' || tool === 'pick') setTool('pencil'); };
      $('palette').appendChild(b);
    }
    for (const m of Rig.MOVE_IDS) {
      const b = document.createElement('button'); b.dataset.m = m;
      b.onclick = () => setMove(m); $('moves').appendChild(b);
    }
    setTool('pencil'); setSize(2); setColor(color); setMove('bounce'); relabel();

    ink.addEventListener('pointerdown', onDown);
    ink.addEventListener('pointermove', onMove);
    ink.addEventListener('pointerup', onUp);
    ink.addEventListener('pointercancel', onUp);
    $('bUndo').onclick = doUndo;
    $('bClear').onclick = () => { pushUndo(); ictx.clearRect(0, 0, W, H); dirty = true; };
    $('showBase').onchange = () => { base.style.visibility = $('showBase').checked ? 'visible' : 'hidden'; dirty = true; };
    $('bGo').onclick = () => cbs.onGo(data());
    $('bWatch').onclick = () => cbs.onWatch();
    $('edClose').onclick = () => cbs.onWatch();
    addEventListener('keydown', (e) => {
      if (running && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && e.target.tagName !== 'INPUT') { e.preventDefault(); doUndo(); }
    });
  }

  function relabel() {   // (re)apply every label that depends on the language
    for (const b of $('tools').children) b.title = T('t_' + b.dataset.t);
    for (const b of $('moves').children) b.textContent = T('mv_' + b.dataset.m);
    $('bGo').textContent = T(editing ? 'goEdit' : 'go');
  }

  function data() {
    return { img: composite().toDataURL('image/png'), name: $('name').value, msg: $('msg').value, move };
  }

  // existing = {id, v, name, msg, move} when re-drawing your own dancer
  function open(existing) {
    $('editor').hidden = false;
    if (existing) {
      $('name').value = existing.name === '无名舞者' ? '' : existing.name; $('msg').value = existing.msg || ''; setMove(existing.move);
      const im = new Image();
      im.onload = () => {
        undo = []; ictx.clearRect(0, 0, W, H); ictx.drawImage(im, 0, 0, W, H);
        $('showBase').checked = false; base.style.visibility = 'hidden'; dirty = true;
      };
      if (DD.api) im.crossOrigin = 'anonymous';
      im.src = DD.img(existing);
    }
    editing = !!existing; relabel();
    dirty = true;
    if (!running) { running = true; loop(); }
  }
  function close() { $('editor').hidden = true; running = false; onUp(); }

  return { init, open, close, relabel };
})();
