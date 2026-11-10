// Main: glue — server calls, live updates, the zoom card, the big-screen dialog, HUD.
(function () {
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  };
  let me = store.get('dd_me');                     // {id, token}
  const liked = new Set(store.get('dd_liked') || []);
  const seenScreen = new Set();
  let online = 1, zoomD = null, zoomPaused = false, toastTimer = null;

  // ---------- solo mode: no backend (static hosting) -> everything lives in this browser ----------
  let local = false;
  const rid = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const txt = (s, n) => [...String(s || '').trim()].slice(0, n).join('');
  function localCall(method, url, body) {
    const db = store.get('dd_local') || { dancers: [], screen: [] };
    const seg = url.split('/').filter(Boolean), done = (out) => { store.set('dd_local', db); return out; };
    if (seg[1] === 'state') return { dancers: db.dancers, screen: db.screen, online: 1 };
    if (seg[1] === 'screen') {
      const d = db.dancers.find((x) => x.id === body.dancerId);
      const item = { id: rid(4), dancerId: d ? d.id : null, name: d ? d.name : '神秘观众', text: txt(body.text, 40), ts: Date.now() };
      db.screen = db.screen.concat(item).slice(-8);
      return done({ item });
    }
    if (!seg[2]) {
      const d = { id: rid(5), name: txt(body.name, 16) || '无名舞者', msg: txt(body.msg, 40), move: body.move, likes: 0, ts: Date.now(), v: 1, img: body.img };
      db.dancers.push(d);
      return done({ dancer: d, token: 'local' });
    }
    const d = db.dancers.find((x) => x.id === seg[2]);
    if (!d) { const e = new Error('查无此人'); e.status = 404; throw e; }
    if (method === 'PUT') { d.name = txt(body.name, 16) || '无名舞者'; d.msg = txt(body.msg, 40); d.move = body.move; d.img = body.img; d.v++; }
    else if (method === 'DELETE') { db.dancers = db.dancers.filter((x) => x !== d); db.screen = db.screen.filter((s) => s.dancerId !== d.id); }
    else if (seg[3] === 'like') d.likes++;
    return done({ dancer: d, likes: d.likes, ok: true });
  }

  async function call(method, url, body) {
    if (local) return localCall(method, url, body);
    const r = await fetch(DD.url(url.replace(/^\//, '')), { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || '出错了，再试一次'); e.status = r.status; throw e; }
    return j;
  }
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  const mine = () => (me ? Floor.get(me.id) : null);
  function refreshHud() {
    const c = Floor.count();
    $('stat').textContent = local ? `单机模式 · 舞池 ${c.total} 人` : `在线 ${online} · 舞池 ${c.total} 人`;
    $('bDraw').textContent = mine() ? '✏️ 重画' : '✏️ 画自己';
    $('bMe').hidden = !mine();
  }
  function musicLabel() {
    $('bMusic').textContent = Beat.isOn() ? '🔊 ' + Beat.track() : '🔇 开音乐';
    $('bNext').hidden = !Beat.isOn();
    $('bMusic').classList.toggle('blink', !Beat.isOn());
  }
  function showFloor() { Editor.close(); $('hud').hidden = false; refreshHud(); musicLabel(); }

  // ---------- entering the floor ----------
  async function enter(data) {
    const btn = $('bGo'); btn.disabled = true;
    try {
      let res = null;
      if (me) {
        try { res = await call('PUT', '/api/dancers/' + me.id, Object.assign({ token: me.token }, data)); }
        catch (e) { if (e.status !== 404 && e.status !== 403) throw e; me = null; }
      }
      if (!res) {
        res = await call('POST', '/api/dancers', data);
        me = { id: res.dancer.id, token: res.token }; store.set('dd_me', me);
      }
      Floor.setMe(me.id); Floor.upsert(res.dancer);
      if (!Beat.isOn()) Beat.start();
      showFloor(); Floor.focusOn(me.id, 5000);
      toast('你进场了！点别人可以放大看');
    } catch (e) { toast(e.message); }
    btn.disabled = false;
  }

  // ---------- zoom card ----------
  const zc = $('zCanvas'), zx = zc.getContext('2d');
  function btn(label, fn, hot) {
    const b = document.createElement('button'); b.className = 'neon' + (hot ? ' hot' : ''); b.textContent = label; b.onclick = () => fn(b);
    $('zBtns').appendChild(b); return b;
  }
  function metaText(d) {
    const mv = (Rig.MOVES[d.move] || Rig.MOVES.bounce).name;
    if (d.npc) return `气氛组 NPC · 舞步：${mv}`;
    const when = new Date(d.ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `${when} 入场 · 舞步：${mv} · ❤ ${d.likes}`;
  }
  async function copyLink(d) {
    const link = location.origin + location.pathname + '#d=' + d.id;
    try { await navigator.clipboard.writeText(link); toast('链接已复制，发给朋友来找人'); } catch (_) { toast(link); }
  }
  function openZoom(d) {
    zoomD = d; zoomPaused = false;
    $('zName').textContent = d.name; $('zMsg').textContent = d.msg || ''; $('zMeta').textContent = metaText(d);
    $('zBtns').textContent = '';
    btn('⏸ 定住看细节', (b) => { zoomPaused = !zoomPaused; b.textContent = zoomPaused ? '▶ 继续跳' : '⏸ 定住看细节'; });
    if (d.npc) { /* the hype crew has no socials */ }
    else if (me && d.id === me.id) {
      btn('✏️ 重画', () => { closeZoom(); Editor.open(d); });
      btn('📺 我要上大屏', () => { closeZoom(); openScreen(''); }, true);
      if (!local) btn('🔗 复制我的链接', () => copyLink(d));
      btn('🚪 退场', async () => {
        if (!confirm('真的要退场吗？你的小人会从舞池消失。')) return;
        try { await call('DELETE', '/api/dancers/' + d.id, { token: me.token }); } catch (e) { return toast(e.message); }
        Floor.remove(d.id); me = null; store.set('dd_me', null); Floor.setMe(null); closeZoom(); refreshHud();
      });
    } else {
      btn(liked.has(d.id) ? `❤ 已打call ${d.likes}` : `❤ 打call ${d.likes}`, async (b) => {
        if (liked.has(d.id)) return;
        liked.add(d.id); store.set('dd_liked', [...liked].slice(-500));
        try { const r = await call('POST', `/api/dancers/${d.id}/like`); d.likes = r.likes; } catch (_) {}
        b.textContent = `❤ 已打call ${d.likes}`; $('zMeta').textContent = metaText(d);
      }, true);
      btn('💌 大屏喊话', () => { closeZoom(); openScreen('@' + d.name + ' '); });
      btn('🔗 复制TA的链接', () => copyLink(d));
      btn('🚩 举报', async (b) => { try { await call('POST', `/api/dancers/${d.id}/report`); } catch (_) {} b.disabled = true; toast('收到，谢谢'); });
    }
    $('zoom').hidden = false;
  }
  function closeZoom() { zoomD = null; $('zoom').hidden = true; if (location.hash) history.replaceState(null, '', location.pathname); }
  Floor.overlay = (beat) => {
    if (!zoomD) return;
    const w = zc.width, h = zc.height, d = zoomD;
    zx.imageSmoothingEnabled = false;
    zx.fillStyle = '#0a0220'; zx.fillRect(0, 0, w, h);
    const g = zx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,240,170,.05)'); g.addColorStop(1, 'rgba(255,240,170,.3)');
    zx.fillStyle = g; zx.beginPath(); zx.moveTo(w / 2 - 40, 0); zx.lineTo(w / 2 + 40, 0); zx.lineTo(w, h); zx.lineTo(0, h); zx.fill();
    const cols = ['#ff2e93', '#00e5ff', '#ffe600', '#7dff3a'];
    for (let i = 0; i < 6; i++) {
      zx.globalAlpha = (i + Math.floor(beat)) % 2 ? 0.8 : 0.3; zx.fillStyle = cols[(i + Math.floor(beat / 2)) % 4];
      zx.fillRect(i * 70 + 2, h - 44, 66, 40);
    }
    zx.globalAlpha = 1;
    Rig.draw(zx, d.parts, zoomPaused ? Rig.REST : Rig.poseAt(d.move, beat + d.phase, d.mirror), w / 2, h - 22, 3);
  };

  // ---------- big screen ----------
  function openScreen(prefill) {
    $('sText').value = prefill || '';
    $('sWithWrap').hidden = !mine();
    if (local) $('sSub').textContent = '免费霸屏 12 秒。现在是单机模式，大屏只有你自己看得到。40 字以内。';
    $('screenDlg').hidden = false;
    $('sText').focus();
  }
  function addScreen(item, force) {
    if (seenScreen.has(item.id)) return;
    seenScreen.add(item.id);
    if (force) Floor.pushScreen(item);
  }
  $('sGo').onclick = async () => {
    const text = $('sText').value.trim();
    if (!text) return toast('写点什么再上大屏');
    try {
      const withMe = mine() && $('sWith').checked;
      const r = await call('POST', '/api/screen', { text, dancerId: withMe ? me.id : null });
      addScreen(r.item, true);
      $('screenDlg').hidden = true; toast('上大屏啦！抬头看 👆');
    } catch (e) { toast(e.message); }
  };
  $('sClose').onclick = () => { $('screenDlg').hidden = true; };
  $('zClose').onclick = closeZoom;
  $('zoom').addEventListener('pointerdown', (e) => { if (e.target === $('zoom')) closeZoom(); });
  $('screenDlg').addEventListener('pointerdown', (e) => { if (e.target === $('screenDlg')) $('screenDlg').hidden = true; });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (zoomD) closeZoom(); $('screenDlg').hidden = true; $('findBox').hidden = true; } });

  // ---------- HUD ----------
  $('bMusic').onclick = () => { Beat.toggle(); musicLabel(); };
  $('bNext').onclick = () => Beat.next();
  Beat.onTrack = (name) => { musicLabel(); if (Beat.isOn()) toast('♪ 现在播放：' + name); };
  $('bMe').onclick = () => { if (!Floor.focusOn(me && me.id)) toast('你还没进场，先画一个'); };
  $('bDraw').onclick = () => Editor.open(mine());
  $('bScreen').onclick = () => openScreen('');
  $('bFind').onclick = () => { const b = $('findBox'); b.hidden = !b.hidden; if (!b.hidden) { $('findIn').value = ''; $('findRes').textContent = ''; $('findIn').focus(); } };
  $('findIn').oninput = () => {
    const box = $('findRes'), q = $('findIn').value, res = Floor.search(q);
    box.textContent = '';
    if (q.trim() && !res.length) { const n = document.createElement('div'); n.className = 'none'; n.textContent = '舞池里没找到这个人'; box.appendChild(n); }
    for (const d of res) {
      const row = document.createElement('div'); row.textContent = d.name + (d.msg ? ' ：' + d.msg : '');
      row.onclick = () => { Floor.focusOn(d.id); $('findBox').hidden = true; };
      box.appendChild(row);
    }
  };
  Floor.onPick = openZoom;
  Floor.onScreen = () => openScreen('');

  // ---------- boot ----------
  function fromHash() {
    const m = /^#d=([a-f0-9]{10})$/.exec(location.hash);
    if (!m) return false;
    const d = Floor.get(m[1]);
    if (!d) { toast('这个人已经离场了'); return false; }
    showFloor(); Floor.focusOn(d.id); openZoom(d);
    return true;
  }
  function live() {
    const es = new EventSource(DD.url('api/events'));
    es.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.t === 'dancer') { Floor.upsert(m.d); if (zoomD && zoomD.id === m.d.id) $('zMeta').textContent = metaText(zoomD); }
      else if (m.t === 'remove') { Floor.remove(m.id); if (zoomD && zoomD.id === m.id) closeZoom(); }
      else if (m.t === 'like') { const d = Floor.get(m.id); if (d) d.likes = m.likes; }
      else if (m.t === 'screen') addScreen(m.item, true);
      else if (m.t === 'online') online = m.n;
      refreshHud();
    };
  }
  async function boot() {
    Floor.init($('floor'));
    Editor.init({ onGo: enter, onWatch: showFloor });
    try {
      if (/[?&]solo\b/.test(location.search)) throw new Error('solo');   // ?solo forces solo mode, for testing
      const s = await call('GET', '/api/state');
      Floor.set(s.dancers); Floor.setScreen(s.screen); s.screen.forEach((i) => seenScreen.add(i.id)); online = s.online || 1;
    } catch (_) {
      local = true;
      const s = localCall('GET', '/api/state');
      Floor.set(s.dancers); Floor.setScreen(s.screen); s.screen.forEach((i) => seenScreen.add(i.id));
    }
    if (me) Floor.setMe(me.id);
    if (!local) live();
    addEventListener('hashchange', fromHash);
    if (fromHash()) return;
    if (mine()) { showFloor(); Floor.focusOn(me.id, 4000); } else Editor.open(null);
  }
  boot();
})();
