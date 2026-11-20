/** Small seeded PRNG (mulberry32) so games are reproducible on server and in tests. */

export function random(seed: number): { value: number; seed: number } {
  const next = (seed + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: next };
}

export function randomInt(n: number, seed: number): { value: number; seed: number } {
  const r = random(seed);
  return { value: Math.floor(r.value * n), seed: r.seed };
}

export function shuffle<T>(items: readonly T[], seed: number): { items: T[]; seed: number } {
  const out = items.slice();
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    const r = randomInt(i + 1, s);
    s = r.seed;
    [out[i], out[r.value]] = [out[r.value], out[i]];
  }
  return { items: out, seed: s };
}
