type Effect = 'jump' | 'land' | 'step' | 'splash' | 'crash' | 'point' | 'finish' | 'reaction';
let ctx: AudioContext | undefined;
let music: GainNode, effects: GainNode, engineGain: GainNode, engine: OscillatorNode;
let enabled = true, musicVolume = 0.22, effectsVolume = 0.55;
let nextBeat = 0, beat = 0, playing = false;
const last = new Map<Effect, number>();
const tune = [0, 4, 7, 12, 7, 4, 2, 7, 4, 7, 11, 14, 11, 7, 4, 2,
  0, 4, 9, 12, 9, 7, 4, 2, 2, 5, 9, 12, 9, 5, 2, -1];
const roots = [48, 45, 53, 55];
const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);

function tone(bus: GainNode, hz: number, duration: number, volume: number, type: OscillatorType = 'sine', at = ctx!.currentTime, endHz = hz) {
  if (!ctx) return;
  const oscillator = ctx.createOscillator(), envelope = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(hz, at);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endHz), at + duration);
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(volume, at + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(envelope); envelope.connect(bus);
  oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  oscillator.start(at); oscillator.stop(at + duration + 0.02);
}
function levels() {
  if (!ctx) return;
  music.gain.setTargetAtTime(enabled && playing ? musicVolume : 0, ctx.currentTime, 0.04);
  effects.gain.setTargetAtTime(enabled ? effectsVolume : 0, ctx.currentTime, 0.04);
}
async function unlock() {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      const limiter = ctx.createDynamicsCompressor(); limiter.connect(ctx.destination);
      music = ctx.createGain(); effects = ctx.createGain();
      music.gain.value = 0; effects.gain.value = 0;
      music.connect(limiter); effects.connect(limiter);
      engine = ctx.createOscillator(); engine.type = 'triangle';
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      engine.connect(engineGain); engineGain.connect(effects); engine.start();
    }
    if (ctx.state !== 'running') { await ctx.resume(); nextBeat = ctx.currentTime; }
    levels();
  } catch { /* Gameplay remains available when browser audio is unavailable. */ }
}
export function setupAudio() {
  try {
    const saved = JSON.parse(localStorage.getItem('openworld3d.audio') ?? '{}');
    if (typeof saved.enabled === 'boolean') enabled = saved.enabled;
    if (typeof saved.music === 'number' && Number.isFinite(saved.music)) musicVolume = Math.max(0, Math.min(1, saved.music));
    if (typeof saved.effects === 'number' && Number.isFinite(saved.effects)) effectsVolume = Math.max(0, Math.min(1, saved.effects));
  } catch {}
  const box = document.createElement('fieldset');
  const title = document.createElement('legend'); title.textContent = 'Audio'; box.append(title);
  const save = () => {
    levels();
    try { localStorage.setItem('openworld3d.audio', JSON.stringify({enabled, music: musicVolume, effects: effectsVolume})); } catch {}
  };
  const toggleLabel = document.createElement('label'), toggle = document.createElement('input');
  toggle.type = 'checkbox'; toggle.checked = enabled; toggleLabel.append(toggle, ' Activar sonido'); box.append(toggleLabel);
  toggle.addEventListener('change', () => { enabled = toggle.checked; save(); });
  for (const kind of ['music', 'effects'] as const) {
    const label = document.createElement('label'), slider = document.createElement('input'), caption = document.createElement('span');
    slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.value = String(Math.round((kind === 'music' ? musicVolume : effectsVolume) * 100));
    const update = () => { caption.textContent = `${kind === 'music' ? 'Música' : 'Efectos'}: ${slider.value}%`; };
    slider.addEventListener('input', () => { if (kind === 'music') musicVolume = Number(slider.value) / 100; else effectsVolume = Number(slider.value) / 100; update(); save(); });
    label.style.display = 'grid'; label.append(caption, slider); box.append(label); update();
  }
  document.querySelector('#settings-admin')!.before(box);
  document.addEventListener('pointerdown', () => { void unlock(); }, {capture: true});
  document.addEventListener('keydown', event => { if (!event.repeat) void unlock(); }, {capture: true});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (ctx) void ctx.suspend().catch(() => {}); }
    else if (ctx) void unlock();
  });
}
export function sfx(effect: Effect) {
  if (!ctx || ctx.state !== 'running' || !enabled || effectsVolume === 0) return;
  const now = ctx.currentTime;
  if (now - (last.get(effect) ?? -Infinity) < (effect === 'step' ? 0.2 : 0.12)) return;
  last.set(effect, now);
  switch (effect) {
    case 'jump': tone(effects, 180, 0.22, 0.16, 'sine', now, 620); break;
    case 'land': tone(effects, 95, 0.14, 0.22, 'triangle', now, 35); break;
    case 'step': tone(effects, 110, 0.055, 0.07, 'triangle', now, 55); break;
    case 'splash': tone(effects, 480, 0.16, 0.12, 'sine', now, 70); tone(effects, 650, 0.2, 0.07, 'triangle', now + 0.03, 100); break;
    case 'crash': tone(effects, 120, 0.25, 0.25, 'sawtooth', now, 25); break;
    case 'point': tone(effects, 660, 0.13, 0.12); tone(effects, 990, 0.18, 0.1, 'sine', now + 0.06); break;
    case 'reaction': tone(effects, 520, 0.16, 0.09, 'sine', now, 780); break;
    case 'finish': [60, 64, 67, 72].forEach((note, i) => tone(effects, frequency(note), 0.4, 0.13, 'triangle', now + i * 0.12)); break;
  }
}
export function updateAudio(active: boolean, driving: boolean, speed: number) {
  playing = active;
  if (!ctx || ctx.state !== 'running') return;
  levels();
  const now = ctx.currentTime;
  engineGain.gain.setTargetAtTime(active && driving ? 0.035 + Math.min(Math.abs(speed) / 24, 1) * 0.065 : 0, now, 0.12);
  engine.frequency.setTargetAtTime(42 + Math.min(Math.abs(speed), 35) * 4, now, 0.15);
  if (!active || !enabled || musicVolume === 0) { nextBeat = now; return; }
  if (nextBeat < now - 0.2) nextBeat = now;
  while (nextBeat < now + 0.15) {
    const root = roots[Math.floor(beat / 16) % roots.length];
    if (beat % 2 === 0) tone(music, frequency(60 + tune[(beat / 2) % tune.length]), 0.52, 0.11, 'sine', nextBeat);
    if (beat % 4 === 0) tone(music, frequency(root - 12), 0.65, 0.14, 'triangle', nextBeat);
    if (beat % 16 === 0) [0, root === 45 ? 3 : 4, 7].forEach(offset => tone(music, frequency(root + offset), 2.2, 0.045, 'sine', nextBeat));
    beat = (beat + 1) % 128;
    nextBeat += 0.25;
  }
}
