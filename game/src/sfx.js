// DUSTFALL II — sound. Everything is synthesised with WebAudio: no
// audio files, no network. Each sound is a small graph of oscillators
// and noise buffers, shaped by an envelope. The mixer has a master gain
// and a simple distance attenuator for world sounds (bot shots, distant
// explosions). New in v2: footsteps (alternating left/right thuds),
// reload clicks, plant/defuse beeps, and a distinct crack per weapon.

let ctx = null;
let master = null;
let noiseBuffer = null;

function ensureCtx() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

export function initAudio() {
  ensureCtx();
  if (ctx.state === 'suspended') ctx.resume();
}

function noiseBurst({ freq, q, dur, gain, when = 0, type = 'lowpass' }) {
  const c = ensureCtx();
  const t = c.currentTime + when;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

function tone({ freq, freqEnd, dur, gain, when = 0, type = 'sine' }) {
  const c = ensureCtx();
  const t = c.currentTime + when;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export function distanceGain(dist, maxDist = 45) {
  return Math.max(0.05, 1 - dist / maxDist);
}

// ---- the sound kit --------------------------------------------------------

export function playShot(weaponId, gain = 1) {
  ensureCtx();
  const shapes = {
    pistol: { freq: 1400, q: 1, dur: 0.09, gain: 0.5, tone: 220 },
    rifle: { freq: 900, q: 1, dur: 0.12, gain: 0.6, tone: 160 },
    smg: { freq: 1600, q: 1, dur: 0.07, gain: 0.45, tone: 260 },
    shotgun: { freq: 500, q: 0.8, dur: 0.22, gain: 0.9, tone: 90 },
    sniper: { freq: 700, q: 0.8, dur: 0.3, gain: 1.0, tone: 70 },
  };
  const s = shapes[weaponId] || shapes.rifle;
  noiseBurst({ freq: s.freq, q: s.q, dur: s.dur, gain: s.gain * gain });
  tone({ freq: s.tone, freqEnd: s.tone * 0.4, dur: s.dur * 0.8, gain: 0.35 * gain, type: 'square' });
  if (weaponId === 'sniper' || weaponId === 'shotgun') {
    noiseBurst({ freq: 300, q: 0.5, dur: 0.4, gain: 0.3 * gain, when: 0.02 });
  }
}

export function playDryFire() {
  tone({ freq: 1800, dur: 0.03, gain: 0.15, type: 'square' });
}

export function playReload(weaponId) {
  tone({ freq: 900, dur: 0.04, gain: 0.2, type: 'square' });
  tone({ freq: 600, dur: 0.04, gain: 0.25, when: 0.25, type: 'square' });
  tone({ freq: 1200, dur: 0.05, gain: 0.2, when: 0.5, type: 'square' });
  void weaponId;
}

export function playStep(crouch) {
  tone({ freq: crouch ? 70 : 90, freqEnd: 45, dur: 0.08, gain: crouch ? 0.06 : 0.12 });
  noiseBurst({ freq: 400, q: 1, dur: 0.05, gain: crouch ? 0.02 : 0.05 });
}

export function playJump() {
  noiseBurst({ freq: 600, q: 1, dur: 0.06, gain: 0.08 });
}

export function playHitmarker(kill) {
  tone({ freq: kill ? 1400 : 1100, dur: 0.06, gain: 0.25, type: 'triangle' });
  if (kill) tone({ freq: 1800, dur: 0.1, gain: 0.25, when: 0.07, type: 'triangle' });
}

export function playHurt() {
  tone({ freq: 160, freqEnd: 60, dur: 0.18, gain: 0.4, type: 'sawtooth' });
}

export function playExplosion(dist = 0) {
  const g = distanceGain(dist, 60);
  noiseBurst({ freq: 220, q: 0.5, dur: 0.9, gain: 1.0 * g });
  tone({ freq: 60, freqEnd: 28, dur: 0.8, gain: 0.8 * g, type: 'sine' });
  noiseBurst({ freq: 1200, q: 1, dur: 0.15, gain: 0.4 * g });
}

export function playFlashPop(dist = 0) {
  const g = distanceGain(dist, 40);
  noiseBurst({ freq: 3000, q: 2, dur: 0.1, gain: 0.5 * g, type: 'highpass' });
  tone({ freq: 2400, freqEnd: 1800, dur: 0.3, gain: 0.15 * g });
}

export function playSmokePop(dist = 0) {
  const g = distanceGain(dist, 40);
  noiseBurst({ freq: 800, q: 1, dur: 0.25, gain: 0.3 * g });
}

export function playThrow() {
  noiseBurst({ freq: 900, q: 1, dur: 0.12, gain: 0.15 });
}

export function playPlantBeep(progress) {
  tone({ freq: 880 + progress * 400, dur: 0.07, gain: 0.2, type: 'square' });
}

export function playDefuseBeep(progress) {
  tone({ freq: 660 + progress * 500, dur: 0.06, gain: 0.2, type: 'square' });
}

export function playBombBeep() {
  tone({ freq: 1200, dur: 0.08, gain: 0.25, type: 'square' });
}

export function playBombPlanted() {
  tone({ freq: 440, dur: 0.15, gain: 0.3, type: 'square' });
  tone({ freq: 660, dur: 0.15, gain: 0.3, when: 0.18, type: 'square' });
  tone({ freq: 880, dur: 0.25, gain: 0.3, when: 0.36, type: 'square' });
}

function arpeggio(notes) {
  notes.forEach((freq, i) => tone({ freq, dur: i === notes.length - 1 ? 0.32 : 0.18, gain: 0.3, when: i * 0.16, type: 'triangle' }));
}

export function playRoundWin() {
  arpeggio([523, 659, 784]);
}

export function playRoundLose() {
  arpeggio([392, 330, 262]);
}

export function playBuy() {
  tone({ freq: 1046, dur: 0.08, gain: 0.2, type: 'triangle' });
  tone({ freq: 1318, dur: 0.12, gain: 0.2, when: 0.08, type: 'triangle' });
}

export function playScope() {
  tone({ freq: 700, freqEnd: 1400, dur: 0.08, gain: 0.12, type: 'sine' });
}

export function playClick() {
  tone({ freq: 1200, dur: 0.04, gain: 0.12, type: 'square' });
}
