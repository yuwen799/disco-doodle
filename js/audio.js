// Beat: the global disco clock (everything dances to it) + a tiny synth that
// plays a rotating set of original loops, each with its own tempo and groove.
window.Beat = (function () {
  const _ = null, BARS = 16;
  const MIN7 = [0, 3, 7, 10], DOM7 = [0, 4, 7, 10], MAJ7 = [0, 4, 7, 11], MIN = [0, 3, 7, 12], MAJ = [0, 4, 7, 12];
  const FOUR = [0, 4, 8, 12], OFF = [2, 6, 10, 14], BACK = [4, 12];
  // bass: semitones above the bar's root (two octaves down). lead: index into the
  // bar's chord tones (+4 per octave), so melodies always fit the harmony.
  const TRACKS = [
    { name: '迪斯科之夜', bpm: 118, roots: [57, 62, 55, 60], chords: [MIN7, MIN7, DOM7, MAJ7],
      kick: FOUR, clap: BACK, open: OFF, hat: 1,
      bass: [0, _, 12, _, 0, _, 12, _, 0, _, 12, _, 0, _, 12, _], bassCut: 420,
      stab: [3, 6, 11, 14] },
    { name: '霹雳电子', bpm: 108, roots: [50, 50, 53, 48], chords: [MIN7, MIN7, MAJ, MAJ],
      kick: [0, 6, 10], clap: BACK, open: [14], hat: 1, bell: [2, 5, 8, 11],
      bass: [0, _, _, 0, _, _, 12, _, 0, _, 7, _, _, 12, _, _], bassType: 'square', bassCut: 600,
      lead: [4, _, _, 4, _, 5, _, _, 6, _, 5, _, 4, _, 2, _], leadType: 'square' },
    { name: '意大利快车', bpm: 126, roots: [57, 53, 60, 55], chords: [MIN, MAJ, MAJ, MAJ],
      kick: FOUR, clap: BACK, open: OFF, hat: 0,
      bass: [0, 0, 12, 0, 0, 12, 0, 12, 0, 0, 12, 0, 0, 12, 0, 12], bassCut: 750, bassDur: 0.1,
      lead: [_, _, 6, _, 5, _, 4, _, _, 5, _, 6, _, _, 7, _], leadType: 'sawtooth' },
    { name: '午夜浩室', bpm: 124, roots: [53, 55, 57, 57], chords: [MAJ7, DOM7, MIN7, MIN7],
      kick: FOUR, clap: BACK, open: OFF, hat: 1,
      bass: [_, _, 0, _, _, _, 0, _, _, _, 0, _, _, _, 0, 12], bassCut: 380,
      stab: [0, 3, 6, 10, 13], stabType: 'triangle', stabGain: 0.11, stabDur: 0.3 },
    { name: '慢摇放克', bpm: 98, roots: [52, 52, 57, 59], chords: [MIN7, MIN7, DOM7, DOM7],
      kick: [0, 3, 8, 10], clap: BACK, open: [14], hat: 2,
      bass: [0, _, _, 0, _, 10, 12, _, 0, _, _, 7, _, 10, _, 12], bassCut: 900, bassDur: 0.14,
      stab: [2, 7, 10], stabDur: 0.09 },
    { name: '高能欧舞', bpm: 136, roots: [57, 53, 55, 52], chords: [MIN, MAJ, MAJ, MIN],
      kick: FOUR, clap: BACK, open: OFF, hat: 0,
      bass: [_, _, 0, _, _, _, 0, _, _, _, 0, _, _, _, 0, _], bassCut: 520,
      lead: [4, _, 4, 6, _, 5, _, 4, _, 4, 6, _, 5, _, 2, _], leadType: 'sawtooth', leadGain: 0.07 },
  ];

  let ac = null, master = null, noise = null, timer = null, on = false;
  let idx = 0, k = 0, t0 = 0, beatBase = 0, skip = false;   // track, step in track, track start (s), beats before it
  const api = { onTrack: null };
  const spb = () => 60 / TRACKS[idx].bpm;
  const nowS = () => performance.now() / 1000;
  let prev = null;   // the outgoing track's clock, used until the new track's first step is actually due
  const beat = () => {
    const n = nowS();
    return prev && n < t0 ? prev.b + (n - prev.t0) / prev.spb : beatBase + (n - t0) / spb();
  };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function env(t, peak, dur) {
    const g = ac.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g.connect(master);
    return g;
  }
  function tone(t, type, f, peak, dur, cutoff) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    let out = env(t, peak, dur);
    if (cutoff) { const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.connect(out); out = lp; }
    o.connect(out); o.start(t); o.stop(t + dur + 0.02);
    return o;
  }
  function hiss(t, peak, dur, type, f) {
    const s = ac.createBufferSource(); s.buffer = noise;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f;
    s.connect(fl); fl.connect(env(t, peak, dur)); s.start(t); s.stop(t + dur + 0.02);
  }
  function sched(T, n, t) {
    const s = n % 16, bar = Math.floor(n / 16) % 4, root = T.roots[bar], chord = T.chords[bar];
    if (T.kick.includes(s)) { const o = tone(t, 'sine', 150, 0.95, 0.26); o.frequency.exponentialRampToValueAtTime(42, t + 0.13); }
    if (T.clap.includes(s)) hiss(t, 0.4, 0.13, 'bandpass', 1500);
    if (T.open.includes(s)) hiss(t, 0.2, 0.13, 'highpass', 7000);
    else if (T.hat === 1 || (T.hat === 2 && s % 2 === 0)) hiss(t, 0.06, 0.03, 'highpass', 9000);
    if (T.bell && T.bell.includes(s)) { tone(t, 'square', 800, 0.05, 0.07); tone(t, 'square', 540, 0.04, 0.07); }
    const b = T.bass[s];
    if (b !== null) tone(t, T.bassType || 'sawtooth', hz(root - 24 + b), 0.32, T.bassDur || 0.2, T.bassCut);
    if (T.stab && T.stab.includes(s)) for (const iv of chord) tone(t, T.stabType || 'sawtooth', hz(root + iv), T.stabGain || 0.045, T.stabDur || 0.17, 1900);
    const l = T.lead ? T.lead[s] : null;
    if (l !== null) tone(t, T.leadType, hz(root + 12 + chord[l % 4] + 12 * Math.floor(l / 4)), T.leadGain || 0.055, 0.16, 2600);
  }
  function switchTo(i) {   // only ever called on a bar line, so the beat count stays whole
    const step = spb() / 4;
    prev = { b: beatBase, t0, spb: spb() };
    beatBase += k / 4; t0 += k * step; k = 0;
    idx = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length; skip = false;
    if (api.onTrack) api.onTrack(idx);
  }
  function tick() {
    const off = ac.currentTime - nowS();
    for (;;) {
      if (k % 16 === 0 && (skip || k >= BARS * 16)) switchTo(idx + 1);
      const t = t0 + k * (spb() / 4) + off;
      if (t >= ac.currentTime + 0.14) break;
      if (t > ac.currentTime - 0.03) sched(TRACKS[idx], k, Math.max(t, ac.currentTime));
      k++;
    }
  }
  function start() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0;
      const comp = ac.createDynamicsCompressor();
      master.connect(comp); comp.connect(ac.destination);
      noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const ch = noise.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    ac.resume();
    on = true;
    master.gain.setTargetAtTime(0.5, ac.currentTime, 0.05);
    k = Math.ceil((nowS() - t0) / (spb() / 4)) + 1;
    clearInterval(timer); timer = setInterval(tick, 40);
    return true;
  }
  function stop() {
    on = false; clearInterval(timer);
    if (ac) master.gain.setTargetAtTime(0, ac.currentTime, 0.05);
  }
  return Object.assign(api, {
    beat, start, stop, toggle: () => (on ? (stop(), false) : start()), isOn: () => on,
    next: () => { skip = true; }, track: () => idx,
  });
})();
