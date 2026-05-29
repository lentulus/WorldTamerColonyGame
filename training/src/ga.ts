// Genetic algorithm operators: selection, crossover, mutation, initialisation.

import type { Rng } from './rng.js';

// ── randomChromosome ──────────────────────────────────────────────────────────
// Samples from N(0, 0.5) via Box-Muller. Near-uniform softmax output at start.

export function randomChromosome(len: number, rng: Rng): Float64Array {
  const c = new Float64Array(len);
  for (let i = 0; i < len; i += 2) {
    // Box-Muller transform: two uniforms → two standard normals
    const u1 = Math.max(1e-12, rng.nextFloat());  // avoid log(0)
    const u2 = rng.nextFloat();
    const r  = Math.sqrt(-2 * Math.log(u1));
    const t  = 2 * Math.PI * u2;
    c[i]     = r * Math.cos(t) * 0.5;   // σ = 0.5
    if (i + 1 < len) {
      c[i + 1] = r * Math.sin(t) * 0.5;
    }
  }
  return c;
}

// ── tournamentSelect ──────────────────────────────────────────────────────────
// Picks k individuals at random; returns the index of the one with the highest score.

export function tournamentSelect(
  population: Float64Array[],
  scores:     number[],
  k:          number,
  rng:        Rng,
): number {
  let bestIdx   = -1;
  let bestScore = -Infinity;
  const n = population.length;
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(rng.nextFloat() * n);
    if (scores[idx] > bestScore) {
      bestScore = scores[idx];
      bestIdx   = idx;
    }
  }
  return bestIdx;
}

// ── crossover ─────────────────────────────────────────────────────────────────
// Arithmetic (blend) crossover: child[i] = alpha × a[i] + (1 − alpha) × b[i].
// alpha ∈ [0, 1]; alpha=0.5 produces the midpoint.

export function crossover(a: Float64Array, b: Float64Array, alpha: number): Float64Array {
  const child = new Float64Array(a.length);
  const beta  = 1 - alpha;
  for (let i = 0; i < a.length; i++) {
    child[i] = alpha * a[i] + beta * b[i];
  }
  return child;
}

// ── mutate ────────────────────────────────────────────────────────────────────
// Gaussian perturbation: each gene is perturbed with probability 0.15.
// Returns a new array; the original is not modified.

export function mutate(individual: Float64Array, sigma: number, rng: Rng): Float64Array {
  const mutated = new Float64Array(individual);
  const MUTATION_PROB = 0.15;
  for (let i = 0; i < mutated.length; i++) {
    if (rng.nextFloat() < MUTATION_PROB) {
      // Box-Muller for one normal sample
      const u1 = Math.max(1e-12, rng.nextFloat());
      const u2 = rng.nextFloat();
      const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      mutated[i] += z * sigma;
    }
  }
  return mutated;
}
