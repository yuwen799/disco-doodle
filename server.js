// 来蹦迪 DISCO DOODLE — zero-dependency server.
// Stores dancers (128x192 PNG + a little metadata), the big-screen queue,
// and pushes live updates to everyone on the floor over SSE.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3090;
const HOST = process.env.HOST || '0.0.0.0';
const PUB = path.join(__dirname, 'public');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const IMG = path.join(DATA, 'img');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const TRUST_PROXY = !!process.env.TRUST_PROXY;
const MAX_ON_FLOOR = 150;
const SCREEN_KEEP = 8;
const SPRITE_W = 128, SPRITE_H = 192;

fs.mkdirSync(IMG, { recursive: true });

const load = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return d; } };
let dancers = load('dancers.json', []);
let screen = load('screen.json', []);

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    for (const [f, v] of [['dancers.json', dancers], ['screen.json', screen]]) {
      const p = path.join(DATA, f);
      fs.writeFileSync(p + '.tmp', JSON.stringify(v));
      fs.renameSync(p + '.tmp', p);
    }
  }, 200);
}

// ---------- helpers ----------
const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
};
const fail = (res, code, msg) => json(res, code, { error: msg });
const badChar = (c) => c < 32 || c === 127 || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || c === 0xfeff;
const clean = (s, n) => [...[...String(s == null ? '' : s)].filter((ch) => !badChar(ch.codePointAt(0))).join('').trim()].slice(0, n).join('');
const ipOf = (req) => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
const pub = (d) => ({ id: d.id, name: d.name, msg: d.msg, move: d.move, likes: d.likes, ts: d.ts, v: d.v });
const visible = () => dancers.filter((d) => !d.hidden).slice(-MAX_ON_FLOOR);
const validMove = (m) => (typeof m === 'string' && /^[a-z]{1,12}$/.test(m) ? m : 'bounce');

function decodeSprite(dataUrl) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(typeof dataUrl === 'string' ? dataUrl : '');
  if (!m) return null;
  const b = Buffer.from(m[1], 'base64');
  if (b.length < 45 || b.length > 150000) return null;
  if (b.readUInt32BE(0) !== 0x89504e47 || b.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  if (b.toString('ascii', 12, 16) !== 'IHDR') return null;
  if (b.readUInt32BE(16) !== SPRITE_W || b.readUInt32BE(20) !== SPRITE_H) return null;
  return b;
}

const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  arr.push(now); hits.set(key, arr);
  return false;
}
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.length || now - a[a.length - 1] > 3600e3) hits.delete(k); }, 600e3).unref();

function readBody(req, limit = 260000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too big')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// ---------- live updates (SSE) ----------
const clients = new Set();
function broadcast(obj) {
  const line = `data: ${JSON.stringify(obj)}\n\n`;
  for (const c of clients) c.write(line);
}
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25000).unref();

// ---------- API ----------
async function api(req, res, url) {
  const ip = ipOf(req);
  const seg = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const m = req.method;

  if (m === 'GET' && seg[1] === 'state') {
    return json(res, 200, { dancers: visible().map(pub), screen: screen.slice(-SCREEN_KEEP), online: clients.size });
  }

  if (m === 'GET' && seg[1] === 'events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    clients.add(res);
    broadcast({ t: 'online', n: clients.size });
    req.on('close', () => { clients.delete(res); broadcast({ t: 'online', n: clients.size }); });
    return;
  }

  if (seg[1] === 'dancers' && !seg[2] && m === 'POST') {
    if (limited('new:' + ip, 8, 600e3)) return fail(res, 429, '画太快啦，歇会儿再来');
    const b = await readBody(req);
    const png = decodeSprite(b.img);
    if (!png) return fail(res, 400, '图片不对劲');
    const d = {
      id: crypto.randomBytes(5).toString('hex'), token: crypto.randomBytes(16).toString('hex'),
      name: clean(b.name, 16) || '无名舞者', msg: clean(b.msg, 40), move: validMove(b.move),
      likes: 0, reports: 0, ts: Date.now(), v: 1,
    };
    fs.writeFileSync(path.join(IMG, d.id + '.png'), png);
    dancers.push(d); save();
    broadcast({ t: 'dancer', d: pub(d) });
    return json(res, 200, { dancer: pub(d), token: d.token });
  }

  if (seg[1] === 'dancers' && seg[2]) {
    if (!/^[a-f0-9]{10}$/.test(seg[2])) return fail(res, 404, '查无此人');
    const d = dancers.find((x) => x.id === seg[2]);
    if (!d) return fail(res, 404, '查无此人');
    const action = seg[3];

    if (m === 'PUT' && !action) {
      const b = await readBody(req);
      if (!b.token || b.token !== d.token) return fail(res, 403, '这不是你的小人');
      if (limited('edit:' + ip, 20, 600e3)) return fail(res, 429, '改太快啦');
      if (b.img !== undefined) {
        const png = decodeSprite(b.img);
        if (!png) return fail(res, 400, '图片不对劲');
        fs.writeFileSync(path.join(IMG, d.id + '.png'), png);
        d.v++;
      }
      if (b.name !== undefined) d.name = clean(b.name, 16) || '无名舞者';
      if (b.msg !== undefined) d.msg = clean(b.msg, 40);
      if (b.move !== undefined) d.move = validMove(b.move);
      save();
      if (!d.hidden) broadcast({ t: 'dancer', d: pub(d) });
      return json(res, 200, { dancer: pub(d) });
    }

    if (m === 'DELETE' && !action) {
      const b = await readBody(req).catch(() => ({}));
      const isAdmin = ADMIN_TOKEN && b.admin === ADMIN_TOKEN;
      if (!isAdmin && (!b.token || b.token !== d.token)) return fail(res, 403, '这不是你的小人');
      dancers = dancers.filter((x) => x !== d);
      screen = screen.filter((s) => s.dancerId !== d.id);
      fs.rm(path.join(IMG, d.id + '.png'), () => {});
      save();
      broadcast({ t: 'remove', id: d.id });
      return json(res, 200, { ok: true });
    }

    if (m === 'POST' && action === 'like') {
      if (limited(`like:${d.id}:${ip}`, 1, 3600e3)) return json(res, 200, { likes: d.likes });
      d.likes++; save();
      broadcast({ t: 'like', id: d.id, likes: d.likes });
      return json(res, 200, { likes: d.likes });
    }

    if (m === 'POST' && action === 'report') {
      if (!limited(`rep:${d.id}:${ip}`, 1, 86400e3)) {
        d.reports = (d.reports || 0) + 1;
        if (d.reports >= 3 && !d.hidden) { d.hidden = true; broadcast({ t: 'remove', id: d.id }); }
        save();
      }
      return json(res, 200, { ok: true });
    }
  }

  if (seg[1] === 'screen' && m === 'POST') {
    const b = await readBody(req);
    const text = clean(b.text, 40);
    if (!text) return fail(res, 400, '写点什么再上大屏');
    if (limited('screen:' + ip, 1, 20e3)) return fail(res, 429, '大屏排队中，20 秒后再发');
    const d = typeof b.dancerId === 'string' ? dancers.find((x) => x.id === b.dancerId && !x.hidden) : null;
    const item = {
      id: crypto.randomBytes(4).toString('hex'), dancerId: d ? d.id : null,
      name: d ? d.name : (clean(b.name, 16) || '神秘观众'), text, ts: Date.now(),
    };
    screen.push(item); screen = screen.slice(-SCREEN_KEEP); save();
    broadcast({ t: 'screen', item });
    return json(res, 200, { item });
  }

  return fail(res, 404, 'not found');
}

// ---------- static ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function sendFile(res, file, cache) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');   // lets a static front end (e.g. GitHub Pages) use this backend
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' });
    return res.end();
  }
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
  if (url.pathname.startsWith('/api/')) {
    return api(req, res, url).catch((e) => { if (!res.headersSent) fail(res, 400, e.message === 'too big' ? '太大了' : '请求有问题'); });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  const im = /^\/img\/([a-f0-9]{10})\.png$/.exec(url.pathname);
  if (im) return sendFile(res, path.join(IMG, im[1] + '.png'), 'public, max-age=31536000, immutable');
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.resolve(PUB, rel);
  if (file !== PUB && !file.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  sendFile(res, file, 'no-cache');
}).listen(PORT, HOST, () => console.log(`来蹦迪 DISCO DOODLE → http://localhost:${PORT}`));
