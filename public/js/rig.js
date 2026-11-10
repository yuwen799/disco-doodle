// Rig: turns any 128x192 drawing into a paper-puppet that can dance.
// Every painted pixel is handed to the nearest "bone" (head, torso, arms, legs),
// so whatever you draw — hats, signs, wings — moves with that body part.
window.Rig = (function () {
  const W = 128, H = 192, GROUND = 184;

  // rest pose joints (A-pose, facing us; "L" = left side of the canvas)
  const J = {
    hip: [64, 108], neck: [64, 50],
    shL: [46, 60], elL: [32, 85], haL: [22, 110],
    shR: [82, 60], elR: [96, 85], haR: [106, 110],
    hpL: [56, 110], knL: [53, 144], ftL: [51, 178],
    hpR: [72, 110], knR: [75, 144], ftR: [77, 178],
  };
  // n: name, p: FK parent (-1 root), pv: pivot, a-b: bone, r: bone thickness,
  // jr: joint cap radius, ov: part that shares the joint cap
  const P = (n, p, pv, a, b, r, jr, ov) => ({ n, p, pv: J[pv], a, b, r, jr, ov: ov === undefined ? p : ov });
  const PARTS = [
    P('torso', -1, 'hip', [64, 62], [64, 100], 16, 0, -1),
    P('head', 0, 'neck', [64, 22], [64, 36], 17, 6),
    P('uArmL', 0, 'shL', J.shL, J.elL, 6, 7),
    P('lArmL', 2, 'elL', J.elL, J.haL, 6, 6),
    P('uArmR', 0, 'shR', J.shR, J.elR, 6, 7),
    P('lArmR', 4, 'elR', J.elR, J.haR, 6, 6),
    P('uLegL', -1, 'hpL', J.hpL, J.knL, 8, 8, 0),
    P('lLegL', 6, 'knL', J.knL, J.ftL, 7, 7),
    P('uLegR', -1, 'hpR', J.hpR, J.knR, 8, 8, 0),
    P('lLegR', 8, 'knR', J.knR, J.ftR, 7, 7),
  ];
  const ORDER = [7, 9, 6, 8, 0, 1, 2, 4, 3, 5];

  function distSeg(px, py, a, b) {
    const vx = b[0] - a[0], vy = b[1] - a[1], wx = px - a[0], wy = py - a[1];
    const l2 = vx * vx + vy * vy;
    let t = l2 ? (wx * vx + wy * vy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = wx - t * vx, dy = wy - t * vy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ImageData(128x192) -> [{c: canvas, ox, oy} | null] per part
  function buildParts(img) {
    const d = img.data, n = PARTS.length;
    const masks = new Uint16Array(W * H);
    const bb = PARTS.map(() => [W, H, -1, -1]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (d[i * 4 + 3] === 0) continue;
      const px = x + 0.5, py = y + 0.5;
      let best = 0, bd = 1e9;
      for (let k = 0; k < n; k++) {
        const dd = distSeg(px, py, PARTS[k].a, PARTS[k].b) - PARTS[k].r;
        if (dd < bd) { bd = dd; best = k; }
      }
      let m = 1 << best;
      for (let k = 1; k < n; k++) {
        const q = PARTS[k];
        if (best !== k && best !== q.ov) continue;
        const dx = px - q.pv[0], dy = py - q.pv[1];
        if (dx * dx + dy * dy <= q.jr * q.jr) m |= (1 << k) | (1 << q.ov);
      }
      masks[i] = m;
      for (let k = 0; k < n; k++) if (m & (1 << k)) {
        const b = bb[k];
        if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
      }
    }
    return PARTS.map((_, k) => {
      const b = bb[k];
      if (b[2] < 0) return null;
      const w = b[2] - b[0] + 1, h = b[3] - b[1] + 1, bit = 1 << k;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const cx = c.getContext('2d'), out = cx.createImageData(w, h), o = out.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const si = (y + b[1]) * W + x + b[0];
        if (!(masks[si] & bit)) continue;
        const s4 = si * 4, o4 = (y * w + x) * 4;
        o[o4] = d[s4]; o[o4 + 1] = d[s4 + 1]; o[o4 + 2] = d[s4 + 2]; o[o4 + 3] = d[s4 + 3];
      }
      cx.putImageData(out, 0, 0);
      return { c, ox: b[0], oy: b[1] };
    });
  }
  function partsFromCanvas(canvas) {
    return buildParts(canvas.getContext('2d').getImageData(0, 0, W, H));
  }

  // ---------- dance moves ----------
  // Pose keys (right side mirrored, so aL == aR is symmetric):
  //  aL/aR upper arm: -0.5 hangs down, 0 rest, 1.06 horizontal, 2.6 straight up
  //  fL/fR forearm (relative), lL/lR thigh (+ = outward), kL/kR knee (- = shin tucks in)
  //  t torso lean, h head tilt, x hip slide, r whole-body tilt, sx paper flip
  const KEYS = ['aL', 'fL', 'aR', 'fR', 'lL', 'kL', 'lR', 'kR', 't', 'h', 'x', 'r'];
  const flip = (k) => ({ aL: k.aR, fL: k.fR, aR: k.aL, fR: k.fL, lL: k.lR, kL: k.kR, lR: k.lL, kR: k.kL, t: -(k.t || 0), h: -(k.h || 0), x: -(k.x || 0), r: -(k.r || 0), sx: k.sx });
  const both = (k) => [k, flip(k)];
  const MOVES = {
    bounce: { name: '蹦蹦跳', step: 1, b: 1, hop: 9, k: [
      { aL: 0.5, fL: 1.7, aR: 0.5, fR: 1.7, h: 0.08 }, { aL: 1.5, fL: 1.2, aR: 1.5, fR: 1.2, h: -0.08 }] },
    point: { name: '指天指地', step: 1, b: 0.7, k: [
      { aR: 2.25, fR: 0.1, aL: 0.55, fL: -2.1, t: -0.1, x: 5, h: -0.12, lL: 0.12 },
      { aR: -0.95, fR: -0.25, aL: 0.55, fL: -2.1, t: 0.12, x: -5, h: 0.14, lR: 0.12 }] },
    wave: { name: '挥手摇摆', step: 1, b: 0.6, k: both({ aL: 2.0, fL: 0.25, aR: 3.0, fR: -0.25, t: -0.12, h: -0.12, x: -6 }) },
    twist: { name: '扭扭舞', step: 1, b: 0.5, k: both({ lL: 0.3, kL: -0.6, lR: -0.22, kR: 0.15, t: -0.14, h: 0.1, aL: 0.25, fL: 1.3, aR: -0.3, fR: 1.7, x: -4 }) },
    robot: { name: '机器人', step: 1, b: 0, hold: 0.72, k: [
      { aL: 1.06, fL: 1.57, aR: 1.06, fR: -1.57, h: 0.28 },
      { aL: 1.06, fL: -1.57, aR: 1.06, fR: 1.57, h: -0.28 },
      { aL: -0.5, fL: 1.57, aR: 1.06, fR: 0, t: 0.14, lR: 0.3 },
      { aL: 1.06, fL: 0, aR: -0.5, fR: 1.57, t: -0.14, lL: 0.3 }] },
    jack: { name: '开合跳', step: 1, b: 0.3, hop: 7, k: [
      { aL: 2.3, aR: 2.3, fL: 0.2, fR: 0.2, lL: 0.42, lR: 0.42 }, { aL: -0.3, aR: -0.3, lL: -0.06, lR: -0.06 }] },
    run: { name: '原地踏步', step: 1, b: 0, k: both({ lL: 0.75, kL: -1.5, aR: 0.2, fR: 1.9, aL: -0.4, fL: 0.5, t: 0.07, h: -0.05 }) },
    pump: { name: '左右举手', step: 1, b: 0.8, k: both({ aL: 2.5, fL: 0.1, aR: -0.2, fR: 0.9, t: -0.08, x: -4, h: -0.1 }) },
    sway: { name: '慢摇', step: 2, b: 0.35, hold: 0.1, k: both({ t: 0.2, h: 0.18, x: 9, aL: -0.35, fL: 0.25, aR: 0.25, fR: 0.4, lL: 0.12, lR: -0.06 }) },
    spin: { name: '转圈圈', step: 2, b: 0.5, hold: 0.5, k: [
      { sx: 1, aL: 1.3, aR: 1.3, fL: 0.5, fR: 0.5 }, { sx: -1, aL: 1.9, aR: 0.6, fL: 0.3, fR: 0.8, t: 0.06 }] },
  };
  const MOVE_IDS = Object.keys(MOVES);
  const REST = { aL: 0, fL: 0, aR: 0, fR: 0, lL: 0, kL: 0, lR: 0, kR: 0, t: 0, h: 0, x: 0, r: 0, j: 0, sx: 1 };

  function poseAt(id, beat, mirror) {
    const m = MOVES[id] || MOVES.bounce, n = m.k.length;
    const u = beat / m.step, i = Math.floor(u), f = u - i;
    const A = m.k[((i % n) + n) % n], B = m.k[(((i + 1) % n) + n) % n];
    const hold = m.hold === undefined ? 0.45 : m.hold;
    let e = f < hold ? 0 : (f - hold) / (1 - hold);
    e = e * e * (3 - 2 * e);
    const o = {};
    for (const key of KEYS) { const a = A[key] || 0, b = B[key] || 0; o[key] = a + (b - a) * e; }
    const sa = A.sx === undefined ? 1 : A.sx, sb = B.sx === undefined ? 1 : B.sx;
    o.sx = sa + (sb - sa) * e;
    const bb = (0.5 + 0.5 * Math.cos(beat * 2 * Math.PI)) * (m.b || 0);
    o.lL += 0.1 * bb; o.kL -= 0.28 * bb; o.lR += 0.1 * bb; o.kR -= 0.28 * bb;
    o.j = m.hop ? m.hop * Math.abs(Math.sin(Math.PI * beat)) : 0;
    if (mirror) { const q = flip(o); q.j = o.j; return q; }
    return o;
  }

  // ---------- forward kinematics + drawing ----------
  const mul = (a, b) => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const rot = (p, th) => {
    const c = Math.cos(th), s = Math.sin(th);
    return [c, s, -s, c, p[0] - c * p[0] + s * p[1], p[1] - s * p[0] - c * p[1]];
  };
  const GROUND_PTS = [[7, J.ftL], [9, J.ftR], [6, J.knL], [8, J.knR]];

  // (x, y) is the spot on the floor under the dancer; s = pixels per sprite pixel
  function draw(ctx, parts, o, x, y, s) {
    if (!parts) return;
    const root = mul([1, 0, 0, 1, o.x, 0], rot(J.hip, o.r));
    const ang = [o.t, o.h, o.aL, o.fL, -o.aR, -o.fR, o.lL, o.kL, -o.lR, -o.kR];
    const M = new Array(10);
    for (let k = 0; k < 10; k++) {
      const q = PARTS[k];
      M[k] = mul(q.p < 0 ? root : M[q.p], rot(q.pv, ang[k]));
    }
    let low = -1e9; // keep the lowest foot/knee planted on the floor
    for (const [k, pt] of GROUND_PTS) {
      const m = M[k], yy = m[1] * pt[0] + m[3] * pt[1] + m[5];
      if (yy > low) low = yy;
    }
    const dy = J.ftL[1] - low - o.j;
    ctx.save();
    ctx.translate(x, y); ctx.scale(s * o.sx, s); ctx.translate(-W / 2, -GROUND + dy);
    for (const k of ORDER) {
      const p = parts[k];
      if (!p) continue;
      const m = M[k];
      ctx.save(); ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.drawImage(p.c, p.ox, p.oy);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------- the default mannequin (and the NPC crowd) ----------
  const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  function paint(opt) {
    opt = Object.assign({ skin: '#f1d6ad', top: '#ffffff', shorts: '#2f6fdd', shoes: '#f1d6ad', line: '#2a1a2e' }, opt);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const cx = c.getContext('2d'), img = cx.createImageData(W, H), d = img.data;
    const cap = (a, b, r, col) => {
      const [R, G, B] = hex(col);
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0]) + r));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - r)), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1]) + r));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (distSeg(x + 0.5, y + 0.5, a, b) > r) continue;
        const i = (y * W + x) * 4; d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = 255;
      }
    };
    const layer = (shapes) => {
      for (const s of shapes) cap(s[0], s[1], s[2] + 1.3, opt.line);
      for (const s of shapes) cap(s[0], s[1], s[2], s[3]);
    };
    const dot = (x, y, col, w = 1, h = 1) => cap([x + 0.5, y + 0.5], [x + w - 0.5, y + h - 0.5], 0.6, col);
    const sk = opt.skin, arm = opt.sleeves ? opt.top : sk, leg = opt.pants ? opt.shorts : sk;

    layer([
      [J.hpL, J.knL, 6, leg], [J.knL, J.ftL, 5.5, leg], [J.hpR, J.knR, 6, leg], [J.knR, J.ftR, 5.5, leg],
      [[51, 180], [45, 181], 3.6, opt.shoes], [[77, 180], [83, 181], 3.6, opt.shoes],
      [J.shL, J.elL, 5, arm], [J.elL, J.haL, 4.5, arm], [J.shR, J.elR, 5, arm], [J.elR, J.haR, 4.5, arm],
      [J.haL, J.haL, 5, sk], [J.haR, J.haR, 5, sk],
      [[64, 44], [64, 54], 4.5, sk],
      [[50, 60], [78, 60], 6, sk], [[64, 64], [64, 98], 14, sk], [[57, 104], [71, 104], 8, sk],
    ]);
    if (opt.hair === 'afro') layer([[[64, 24], [64, 24], 22, opt.hairCol]]);
    if (opt.hair === 'long') layer([[[64, 22], [64, 24], 18, opt.hairCol], [[47, 26], [45, 54], 4.5, opt.hairCol], [[81, 26], [83, 54], 4.5, opt.hairCol]]);
    layer([[[64, 28], [64, 28], 15, sk]]);
    // shorts + tank top
    layer([
      [[56, 105], [72, 105], 9, opt.shorts],
      [J.hpL, mix(J.hpL, J.knL, 0.42), 7.4, opt.shorts], [J.hpR, mix(J.hpR, J.knR, 0.42), 7.4, opt.shorts],
    ]);
    layer([
      [[64, 67], [64, 96], 14.6, opt.top],
      [[55, 55], [56, 64], 2.6, opt.top], [[73, 55], [72, 64], 2.6, opt.top],
    ]);
    cap([64, 53], [64, 55], 6, sk); // scoop neck
    if (opt.stripe) for (let y = 70; y < 98; y += 6) cap([52, y], [76, y], 1.2, opt.stripe);
    if (opt.hair === 'short') layer([[[53, 17], [75, 17], 6, opt.hairCol]]);
    if (opt.hair === 'mohawk') layer([[[64, 4], [64, 18], 3, opt.hairCol]]);
    if (opt.hair === 'band') cap([50, 19], [78, 19], 2, opt.hairCol);
    // face
    if (opt.shades) { cap([54, 28], [61, 28], 3, '#111111'); cap([67, 28], [74, 28], 3, '#111111'); cap([61, 27], [67, 27], 0.8, '#111111'); }
    else { dot(57, 27, opt.line, 2, 2); dot(69, 27, opt.line, 2, 2); }
    dot(60, 35, opt.line, 8, 1); dot(59, 34, opt.line); dot(68, 34, opt.line);
    cx.putImageData(img, 0, 0);
    return c;
  }

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const NPC_NAMES = ['阿珍', '阿强', '迪斯科王', '小芳', '霹雳虎', '莉莉', '大卫', '露西', '阿飞', '玛丽', '龙哥', '雯雯', 'Tony', '红姐', '小马', '安娜', '阿杰', '琳达', '老K', '蓉蓉', 'Jacky', '美玲', '阿Ben', '燕子', '喇叭裤小王', '卷毛', '曼丽', '阿辉'];
  const NPC_NAMES_EN = ['Jenny', 'Johnny', 'Disco King', 'Fanny', 'Tiger', 'Lily', 'David', 'Lucy', 'Ace', 'Mary', 'Big Lou', 'Wendy', 'Tony', 'Ruby', 'Pony', 'Anna', 'Jay', 'Linda', 'Old K', 'Rosie', 'Jacky', 'Mei', 'Ben', 'Robin', 'Bell-bottom Bill', 'Curly', 'Molly', 'Ray'];
  const NPC_MSGS_EN = ['Dancing till sunrise', 'Who stepped on my bell-bottoms?', 'DJ, one more!', 'Need a dance partner', 'Check out my hair', 'All night long', 'Fresh perm, do not touch', 'Meet me in the middle', "Don't stop the music", 'Go draw yourself too'];
  const NPC_MSGS = ['今晚不醉不归', '谁踩我喇叭裤了', 'DJ 再来一首！', '找舞伴，会迪斯科的来', '我的发型帅不帅', '跳到天亮', '新烫的头，别碰', '舞池中央见', '音乐不要停', '你也来画一个嘛'];
  function npc(i) {
    const r = rng(i * 7919 + 13), pick = (a) => a[Math.floor(r() * a.length)];
    const neon = ['#ff2e93', '#00e5ff', '#ffe600', '#7dff3a', '#ff7a00', '#b54dff', '#ffffff', '#ff3b30', '#1f1f2e'];
    const canvas = paint({
      skin: pick(['#f6d7b0', '#e9b98a', '#c68642', '#8d5524', '#f1d6ad', '#ffd9c4']),
      top: pick(neon), shorts: pick(neon), shoes: pick(['#ffffff', '#111111', '#ff2e93', '#ffe600']),
      hair: pick(['afro', 'long', 'short', 'mohawk', 'band', 'short', 'afro']),
      hairCol: pick(['#1b1b1b', '#4a2a12', '#ffd23f', '#ff5fa2', '#7b3ff2', '#d9d9d9']),
      shades: r() < 0.35, sleeves: r() < 0.3, pants: r() < 0.45, stripe: r() < 0.3 ? pick(neon) : null,
    });
    const mi = Math.floor(r() * NPC_MSGS.length), zh = () => I18N.lang === 'zh';
    return {
      id: 'npc' + i, npc: true, move: pick(MOVE_IDS), likes: 0, ts: 0, canvas,
      get name() { return (zh() ? NPC_NAMES : NPC_NAMES_EN)[i % NPC_NAMES.length]; },
      get msg() { return (zh() ? NPC_MSGS : NPC_MSGS_EN)[mi]; },
    };
  }

  return { W, H, GROUND, MOVES, MOVE_IDS, REST, buildParts, partsFromCanvas, poseAt, draw, paint, npc, rng };
})();
