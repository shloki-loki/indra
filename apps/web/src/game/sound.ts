/** Tiny synthesized sounds (no audio files): card snaps and a thunder roll for Indra. */

let ctx: AudioContext | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem('indra:muted') === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem('indra:muted', value ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noise(a: AudioContext, seconds: number): AudioBufferSourceNode {
  const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * seconds), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buffer;
  return src;
}

/** A crisp card snap. `pitch` shifts it so repeated cards don't sound identical. */
export function snap(pitch = 1, delay = 0): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const src = noise(a, 0.06);
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2400 * pitch;
  filter.Q.value = 0.8;
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.5, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(t);
}

export function fan(count: number): void {
  for (let i = 0; i < Math.min(count, 6); i++) snap(0.9 + i * 0.06, i * 0.05);
}

/** Low thunder roll with a sharp crack at the start. */
export function thunder(): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const crack = noise(a, 0.25);
  const crackGain = a.createGain();
  crackGain.gain.setValueAtTime(0.7, t);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  crack.connect(crackGain).connect(a.destination);
  crack.start(t);

  const roll = noise(a, 2.4);
  const low = a.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.setValueAtTime(400, t);
  low.frequency.exponentialRampToValueAtTime(90, t + 2.2);
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.9, t + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
  roll.connect(low).connect(gain).connect(a.destination);
  roll.start(t);
}

export function buzz(): void {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* not supported */
  }
}
