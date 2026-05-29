// Mulberry32 — a fast, high-quality 32-bit seeded PRNG.
// Same seed always produces the same sequence (fully deterministic).

export interface Rng {
  nextFloat(): number;  // uniform [0, 1)
}

export function createRng(seed: number): Rng {
  // Initialise with a non-zero state derived from the seed.
  let s = (seed >>> 0) + 1;  // uint32; +1 ensures non-zero for seed=0
  return {
    nextFloat(): number {
      s += 0x6d2b79f5;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function d20(rng: Rng): number {
  return Math.ceil(rng.nextFloat() * 20);
}

export function d6(rng: Rng): number {
  return Math.ceil(rng.nextFloat() * 6);
}
