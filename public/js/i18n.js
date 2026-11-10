// I18N: English by default, switchable to Chinese. T('key', {vars}) everywhere;
// static HTML uses data-i18n / data-i18n-ph attributes.
window.I18N = (function () {
  const D = {
    en: {
      title: 'DISCO DOODLE - draw yourself, hit the dance floor',
      logoMain: 'DISCO DOODLE', logoSub: 'DRAW · DANCE · SHOUT', home: "Yuwen's homepage ↗", langBtn: '中文',
      findPh: 'Type a name…', musicOff: '🔇 Music', next: '⏭ Next', me: '📍 Find me', find: '🔍 Search', screen: '📺 Big screen',
      draw: '✏️ Draw me', redraw: '✏️ Redraw',
      winTitle: '🕺 my_dancer.bmp - Disco Paint', mFile: 'File', mEdit: 'Edit', mDisco: 'Disco',
      tip: 'Doodle on the mannequin: a new outfit, a slogan, a hat… anything goes',
      undo: '↶ Undo', clear: '🗑 Clear', base: 'Body', pvCap: '▲ LIVE PREVIEW', pickMove: 'Pick a move',
      nick: 'Nickname', msg: 'Leave a line', msgPh: 'Confess, find someone, shout', watch: 'Just watch',
      go: 'Hit the floor ▶', goEdit: 'Done, back to the floor ▶',
      t_pencil: 'Pencil', t_spray: 'Spray can', t_fill: 'Paint bucket', t_eraser: 'Eraser', t_pick: 'Eyedropper',
      sHead: '📺 Get on the big screen',
      sSub: 'Free: 12 seconds on the big screen for the whole floor to see. Confess, find someone, shout out. 40 characters max.',
      sSubLocal: 'Free: 12 seconds on the big screen. This is solo mode for now, so only you can see it. 40 characters max.',
      sPh: 'e.g. You in the red dress, meet me by the left speaker', sWith: 'Put my dancer on screen too', sGo: 'GO BIG!',
      stat: '{o} ONLINE · {n} ON THE FLOOR', statLocal: 'SOLO MODE · {n} ON THE FLOOR',
      entered: "You're in! Tap anyone to zoom in", err: 'Something went wrong, try again',
      npcMeta: 'Hype crew (NPC) · Move: {mv}', meta: 'Joined {when} · Move: {mv} · ❤ {likes}',
      copied: 'Link copied. Send it to a friend', freeze: '⏸ Freeze for details', resume: '▶ Keep dancing',
      toScreen: '📺 Put me on screen', copyMine: '🔗 Copy my link', leave: '🚪 Leave the floor',
      leaveConfirm: 'Leave for real? Your dancer will disappear from the floor.',
      like: '❤ Cheer {n}', liked: '❤ Cheered {n}', shout: '💌 Shout on screen', copyTheirs: '🔗 Copy their link',
      report: '🚩 Report', reported: 'Got it, thanks', needText: 'Write something first',
      onScreenToast: "You're on the big screen! Look up 👆", notIn: "You're not on the floor yet. Draw yourself first",
      notFound: 'Nobody by that name on the floor', gone: 'This dancer has left the floor', nowPlaying: '♪ Now playing: {name}',
      anon: 'Anonymous dancer', mystery: 'Mystery guest',
      scrHolding: '★ {name} ON SCREEN ★', scrCta: "👆 TAP THE SCREEN · IT'S FREE", scrSub: 'CONFESS · FIND SOMEONE · SHOUT OUT', meTag: 'ME',
      mv_bounce: 'Bounce', mv_point: 'Disco point', mv_wave: 'Wave', mv_twist: 'Twist', mv_robot: 'Robot',
      mv_jack: 'Jumping jack', mv_run: 'March', mv_pump: 'Fist pump', mv_sway: 'Slow sway', mv_spin: 'Spin',
      tr_0: 'Disco Night', tr_1: 'Electro Break', tr_2: 'Italo Express', tr_3: 'Midnight House', tr_4: 'Slow Funk', tr_5: 'Euro Rush',
    },
    zh: {
      title: '来蹦迪 DISCO DOODLE',
      logoMain: '来蹦迪', logoSub: 'DISCO DOODLE', home: '作者主页 ↗', langBtn: 'EN',
      findPh: '输入昵称找人…', musicOff: '🔇 开音乐', next: '⏭ 换歌', me: '📍 找我', find: '🔍 找人', screen: '📺 上大屏',
      draw: '✏️ 画自己', redraw: '✏️ 重画',
      winTitle: '🕺 我的小人.bmp - 画个人去蹦迪', mFile: '文件', mEdit: '编辑', mDisco: '蹦迪',
      tip: '在人偶上随便画：换衣服、写字、加帽子……画布里画什么都行',
      undo: '↶ 撤销', clear: '🗑 清空', base: '人偶', pvCap: '▲ 试跳预览', pickMove: '选个舞步',
      nick: '昵称', msg: '留一句话', msgPh: '表白、找人、喊麦都行', watch: '不画了，先围观',
      go: '进入舞池 ▶', goEdit: '改好了，回舞池 ▶',
      t_pencil: '铅笔', t_spray: '喷枪', t_fill: '油漆桶', t_eraser: '橡皮', t_pick: '吸管',
      sHead: '📺 我要上大屏',
      sSub: '免费霸屏 12 秒，全场都看得到。表白、找人、喊话，40 字以内。',
      sSubLocal: '免费霸屏 12 秒。现在是单机模式，大屏只有你自己看得到。40 字以内。',
      sPh: '比如：穿红裙子那位，我在舞池左边等你', sWith: '让我的小人一起上屏', sGo: '霸屏！',
      stat: '在线 {o} · 舞池 {n} 人', statLocal: '单机模式 · 舞池 {n} 人',
      entered: '你进场了！点别人可以放大看', err: '出错了，再试一次',
      npcMeta: '气氛组 NPC · 舞步：{mv}', meta: '{when} 入场 · 舞步：{mv} · ❤ {likes}',
      copied: '链接已复制，发给朋友来找人', freeze: '⏸ 定住看细节', resume: '▶ 继续跳',
      toScreen: '📺 我要上大屏', copyMine: '🔗 复制我的链接', leave: '🚪 退场',
      leaveConfirm: '真的要退场吗？你的小人会从舞池消失。',
      like: '❤ 打call {n}', liked: '❤ 已打call {n}', shout: '💌 大屏喊话', copyTheirs: '🔗 复制TA的链接',
      report: '🚩 举报', reported: '收到，谢谢', needText: '写点什么再上大屏',
      onScreenToast: '上大屏啦！抬头看 👆', notIn: '你还没进场，先画一个',
      notFound: '舞池里没找到这个人', gone: '这个人已经离场了', nowPlaying: '♪ 现在播放：{name}',
      anon: '无名舞者', mystery: '神秘观众',
      scrHolding: '★ {name} 霸屏中 ★', scrCta: '👆 点大屏 · 免费霸屏', scrSub: '表白 · 找人 · 喊麦　今晚谁是舞池之王', meTag: '我',
      mv_bounce: '蹦蹦跳', mv_point: '指天指地', mv_wave: '挥手摇摆', mv_twist: '扭扭舞', mv_robot: '机器人',
      mv_jack: '开合跳', mv_run: '原地踏步', mv_pump: '左右举手', mv_sway: '慢摇', mv_spin: '转圈圈',
      tr_0: '迪斯科之夜', tr_1: '霹雳电子', tr_2: '意大利快车', tr_3: '午夜浩室', tr_4: '慢摇放克', tr_5: '高能欧舞',
    },
  };
  const api = { lang: 'en', listeners: [] };
  try { if (localStorage.getItem('dd_lang') === 'zh') api.lang = 'zh'; } catch (_) {}

  const T = (key, vars) => {
    let s = D[api.lang][key];
    if (s === undefined) s = D.en[key] === undefined ? key : D.en[key];
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : vars[k])) : s;
  };
  // names saved before/without a nickname are stored as fixed placeholders; show them in the current language
  const PLACEHOLDER = { '无名舞者': 'anon', '神秘观众': 'mystery' };
  api.name = (s) => (PLACEHOLDER[s] ? T(PLACEHOLDER[s]) : s);
  api.apply = () => {
    document.documentElement.lang = api.lang === 'zh' ? 'zh-CN' : 'en';
    document.title = T('title');
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = T(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = T(el.dataset.i18nPh);
  };
  api.set = (lang) => {
    api.lang = lang === 'zh' ? 'zh' : 'en';
    try { localStorage.setItem('dd_lang', api.lang); } catch (_) {}
    api.apply();
    for (const fn of api.listeners) fn();
  };
  api.toggle = () => api.set(api.lang === 'zh' ? 'en' : 'zh');
  api.T = T;
  window.T = T;
  return api;
})();
