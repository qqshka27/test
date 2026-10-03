// ===== Звук: маленький синтезатор на WebAudio =====

const AUDIO = { ctx: null, on: true, master: null, last: {} };

function audioInit() {
  if (AUDIO.ctx) { if (AUDIO.ctx.state === 'suspended') AUDIO.ctx.resume(); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    AUDIO.ctx = new AC();
    AUDIO.master = AUDIO.ctx.createGain();
    AUDIO.master.gain.value = 0.22;
    AUDIO.master.connect(AUDIO.ctx.destination);
  } catch (e) { AUDIO.ctx = null; }
}

function tone(freq, dur, type = 'square', vol = 0.5, slide = 0, delay = 0) {
  const a = AUDIO.ctx;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), gn = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  gn.gain.setValueAtTime(vol, t);
  gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(gn); gn.connect(AUDIO.master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.4, freq = 1200, delay = 0) {
  const a = AUDIO.ctx;
  const t = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = freq;
  const gn = a.createGain();
  gn.gain.value = vol;
  src.connect(f); f.connect(gn); gn.connect(AUDIO.master);
  src.start(t);
}

function playSound(name) {
  if (!AUDIO.on || !AUDIO.ctx) return;
  // Не долбим один и тот же звук чаще 40 мс
  const now = performance.now();
  if (AUDIO.last[name] && now - AUDIO.last[name] < 40) return;
  AUDIO.last[name] = now;
  try {
    switch (name) {
      case 'hit': noise(0.08, 0.5, 900); tone(140, 0.08, 'square', 0.25, -60); break;
      case 'miss': tone(500, 0.06, 'triangle', 0.15, 200); break;
      case 'hurt': noise(0.12, 0.6, 600); tone(110, 0.15, 'sawtooth', 0.3, -50); break;
      case 'kill': tone(300, 0.08, 'square', 0.2, -200); noise(0.15, 0.3, 500, 0.04); break;
      case 'coin': tone(988, 0.06, 'square', 0.18); tone(1319, 0.12, 'square', 0.18, 0, 0.06); break;
      case 'pickup': tone(660, 0.05, 'triangle', 0.25); tone(880, 0.07, 'triangle', 0.25, 0, 0.05); break;
      case 'equip': noise(0.06, 0.3, 3000); tone(220, 0.06, 'square', 0.15); break;
      case 'door': noise(0.12, 0.3, 400); break;
      case 'descend': for (let i = 0; i < 4; i++) tone(440 - i * 70, 0.09, 'triangle', 0.25, 0, i * 0.08); break;
      case 'levelup': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.18, 0, i * 0.08)); break;
      case 'drink': tone(300, 0.15, 'sine', 0.3, 300); tone(500, 0.1, 'sine', 0.2, 200, 0.1); break;
      case 'eat': noise(0.05, 0.3, 2000); noise(0.05, 0.3, 2000, 0.1); break;
      case 'scroll': noise(0.18, 0.2, 5000); tone(880, 0.2, 'sine', 0.15, 440); break;
      case 'zap': tone(1200, 0.2, 'sawtooth', 0.15, -900); noise(0.15, 0.25, 6000); break;
      case 'throw': noise(0.1, 0.2, 2500); break;
      case 'glass': tone(2000, 0.05, 'triangle', 0.2); noise(0.15, 0.3, 7000, 0.02); break;
      case 'boom': noise(0.5, 0.8, 300); tone(80, 0.4, 'sawtooth', 0.4, -40); break;
      case 'trap': tone(200, 0.1, 'square', 0.3, 400); noise(0.1, 0.4, 1500); break;
      case 'chest': tone(392, 0.08, 'square', 0.2); tone(523, 0.08, 'square', 0.2, 0, 0.08); tone(784, 0.15, 'square', 0.2, 0, 0.16); break;
      case 'roar': tone(90, 0.4, 'sawtooth', 0.4, -30); noise(0.4, 0.4, 400); break;
      case 'summon': tone(200, 0.3, 'sine', 0.3, 400); tone(150, 0.3, 'sine', 0.2, 300, 0.05); break;
      case 'bark':
        for (let i = 0; i < 3; i++) { tone(180, 0.09, 'sawtooth', 0.45, -90, i * 0.14); noise(0.08, 0.4, 900, i * 0.14); }
        break;
      case 'meow': tone(700, 0.15, 'triangle', 0.3, 300); tone(1000, 0.35, 'triangle', 0.3, -500, 0.15); break;
      case 'victory': [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.2, 0, i * 0.13)); break;
      case 'death': [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, 'triangle', 0.3, 0, i * 0.2)); break;
      case 'click': tone(800, 0.03, 'square', 0.1); break;
    }
  } catch (e) { /* звук не обязателен */ }
}
