import { describe, it, expect } from 'vitest';
import { createRng } from './rng.js';
import { CHROMOSOME_LEN } from './policy.js';
import {
  randomChromosome,
  tournamentSelect,
  crossover,
  mutate,
} from './ga.js';

// ── randomChromosome ──────────────────────────────────────────────────────────

describe('randomChromosome()', () => {
  it('returns Float64Array of length CHROMOSOME_LEN', () => {
    const c = randomChromosome(CHROMOSOME_LEN, createRng(1));
    expect(c).toBeInstanceOf(Float64Array);
    expect(c.length).toBe(CHROMOSOME_LEN);
  });

  it('values are drawn from N(0, 0.5) — roughly in (−3, +3)', () => {
    const rng = createRng(2);
    const c   = randomChromosome(CHROMOSOME_LEN, rng);
    let outOfRange = 0;
    for (const v of c) {
      if (Math.abs(v) > 6) outOfRange++;
    }
    // Extremely unlikely to have even one value outside ±6 from N(0,0.5)
    expect(outOfRange).toBe(0);
  });

  it('different seeds → different chromosomes', () => {
    const a = randomChromosome(CHROMOSOME_LEN, createRng(1));
    const b = randomChromosome(CHROMOSOME_LEN, createRng(2));
    expect(a[0]).not.toBe(b[0]);
  });

  it('same seed → same chromosome', () => {
    const a = randomChromosome(CHROMOSOME_LEN, createRng(42));
    const b = randomChromosome(CHROMOSOME_LEN, createRng(42));
    expect(a).toEqual(b);
  });
});

// ── tournamentSelect ──────────────────────────────────────────────────────────

describe('tournamentSelect()', () => {
  const pop    = Array.from({ length: 10 }, (_, i) => new Float64Array(4).fill(i));
  const scores = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  it('always returns an index in [0, population.length)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const idx = tournamentSelect(pop, scores, 3, createRng(seed));
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(pop.length);
    }
  });

  it('with k=pop.length runs without error and returns a valid index', () => {
    // Tournament samples with replacement so k=pop.length doesn't guarantee
    // the global best, but must return a valid index.
    for (let seed = 0; seed < 10; seed++) {
      const idx = tournamentSelect(pop, scores, pop.length, createRng(seed));
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(pop.length);
    }
  });

  it('with k=5, best individual wins most of the time over many draws', () => {
    const wins = new Array(10).fill(0);
    for (let seed = 0; seed < 200; seed++) {
      wins[tournamentSelect(pop, scores, 5, createRng(seed))]++;
    }
    // Highest scorer (index 9) should win the most
    const maxWinner = wins.indexOf(Math.max(...wins));
    expect(maxWinner).toBe(9);
  });
});

// ── crossover ─────────────────────────────────────────────────────────────────

describe('crossover()', () => {
  const a = new Float64Array(CHROMOSOME_LEN).fill(0);
  const b = new Float64Array(CHROMOSOME_LEN).fill(10);

  it('returns Float64Array of length CHROMOSOME_LEN', () => {
    expect(crossover(a, b, 0.5).length).toBe(CHROMOSOME_LEN);
  });

  it('alpha=0.5: child values are midpoint of parents', () => {
    const child = crossover(a, b, 0.5);
    for (const v of child) expect(v).toBeCloseTo(5.0, 10);
  });

  it('alpha=0: child equals parent b  (α×a + (1−α)×b)', () => {
    const child = crossover(a, b, 0.0);
    for (const v of child) expect(v).toBeCloseTo(10.0, 10);
  });

  it('alpha=1: child equals parent a  (α×a + (1−α)×b)', () => {
    const child = crossover(a, b, 1.0);
    for (const v of child) expect(v).toBeCloseTo(0.0, 10);
  });

  it('alpha=0.5, non-trivial parents: child is within parent bounds', () => {
    const rng = createRng(7);
    const p1  = randomChromosome(CHROMOSOME_LEN, rng);
    const p2  = randomChromosome(CHROMOSOME_LEN, rng);
    const child = crossover(p1, p2, 0.5);
    for (let i = 0; i < CHROMOSOME_LEN; i++) {
      const lo = Math.min(p1[i], p2[i]);
      const hi = Math.max(p1[i], p2[i]);
      expect(child[i]).toBeGreaterThanOrEqual(lo - 1e-12);
      expect(child[i]).toBeLessThanOrEqual(hi    + 1e-12);
    }
  });
});

// ── mutate ────────────────────────────────────────────────────────────────────

describe('mutate()', () => {
  it('returns Float64Array of length CHROMOSOME_LEN', () => {
    const c   = new Float64Array(CHROMOSOME_LEN);
    const mut = mutate(c, 0.3, createRng(1));
    expect(mut.length).toBe(CHROMOSOME_LEN);
  });

  it('changes some genes (p=0.15/gene; over 288 genes expect ~43 changes)', () => {
    const c   = new Float64Array(CHROMOSOME_LEN).fill(0);
    const mut = mutate(c, 0.3, createRng(3));
    let changed = 0;
    for (let i = 0; i < CHROMOSOME_LEN; i++) {
      if (Math.abs(mut[i] - c[i]) > 1e-12) changed++;
    }
    // At p=0.15 over 288 genes, expected ~43 mutations. Very unlikely < 10 or > 100.
    expect(changed).toBeGreaterThan(10);
    expect(changed).toBeLessThan(100);
  });

  it('unchanged genes stay exactly the same', () => {
    const c   = new Float64Array(CHROMOSOME_LEN).fill(5.0);
    const mut = mutate(c, 0.001, createRng(4));  // tiny sigma
    // With p=0.15 some change; the rest stay exactly 5.0
    const unchanged = Array.from(mut).filter(v => v === 5.0);
    expect(unchanged.length).toBeGreaterThan(0);
  });

  it('does not mutate the original (returns a new array)', () => {
    const c   = new Float64Array(CHROMOSOME_LEN).fill(0);
    mutate(c, 0.5, createRng(1));
    // c should still be all zeros
    for (const v of c) expect(v).toBe(0);
  });

  it('larger sigma → larger average mutation magnitude', () => {
    const c     = new Float64Array(CHROMOSOME_LEN).fill(0);
    const small = mutate(c, 0.01, createRng(9));
    const large = mutate(c, 5.0,  createRng(9));
    const avgSmall = Array.from(small).reduce((a, v) => a + Math.abs(v), 0) / CHROMOSOME_LEN;
    const avgLarge = Array.from(large).reduce((a, v) => a + Math.abs(v), 0) / CHROMOSOME_LEN;
    expect(avgLarge).toBeGreaterThan(avgSmall);
  });
});

// ── fitness improvement sanity check ─────────────────────────────────────────
// Run a tiny GA (10 individuals, 5 generations) on a trivial fitness function
// and verify best score never decreases generation-to-generation.

describe('GA loop sanity', () => {
  it('best score never decreases over 5 generations (elitism)', async () => {
    const { REF } = await import('./ref_data.js');
    const { evaluateChromosome } = await import('./fitness.js');
    const { buildStateVector }   = await import('./policy.js');

    const START_STATE = {
      tech_level: 8, home_tl: 8, orbit_au: 1.0, phi_min: 0.5,
      rvm: 0, weather_factor: 0, ag_output_roll_bonus: 0,
      month: 0,
      al: 20, il: 10, ml: 10, afl: 0,
      ac: 20, ic_light: 10, ic_heavy: 0, ic_construction: 0, mc: 10,
      power_kw: 500,
      rations: 500, raw_materials_t: 500,
      housing_m3: 4_000,
      sl_value_per_person: 250, debt_cr: 0,
      sn: 1.0, ss: 100, sl: 1.0,
      political_track: 1, acclimatization_stage: 5,
      road_network_cr_spent: 0,
      active_all_output_dm: 0, active_ag_output_dm: 0,
    };

    const rng      = createRng(100);
    const POP_SIZE = 10;
    const GENS     = 5;
    const SEEDS    = [1, 2];
    const H        = 4;

    // Initialise population
    let population = Array.from({ length: POP_SIZE }, () => randomChromosome(CHROMOSOME_LEN, rng));
    let scores     = population.map(c => evaluateChromosome(c, { state: START_STATE }, REF, SEEDS, H));
    let bestScore  = Math.max(...scores);

    for (let g = 0; g < GENS; g++) {
      const next: Float64Array[] = [];

      // Elitism: keep top 2
      const sorted = scores
        .map((s, i) => ({ s, i }))
        .sort((a, b) => b.s - a.s);
      next.push(population[sorted[0].i], population[sorted[1].i]);

      // Fill rest via tournament + crossover + mutate
      while (next.length < POP_SIZE) {
        const pA = population[tournamentSelect(population, scores, 3, rng)];
        const pB = population[tournamentSelect(population, scores, 3, rng)];
        const alpha = rng.nextFloat();
        const child = mutate(crossover(pA, pB, alpha), 0.3, rng);
        next.push(child);
      }

      population = next;
      scores     = population.map(c => evaluateChromosome(c, { state: START_STATE }, REF, SEEDS, H));
      const gen_best = Math.max(...scores);
      expect(gen_best).toBeGreaterThanOrEqual(bestScore - 1e-9);
      bestScore = gen_best;
    }
  });
});
