#!/usr/bin/env tsx
// Offline GA training. Run with: pnpm --filter @worldtamer/training train
// Saves best chromosome to training/best_policy.json.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REF } from './ref_data.js';
import { CHROMOSOME_LEN } from './policy.js';
import { evaluateChromosome, type StartConfig } from './fitness.js';
import { randomChromosome, tournamentSelect, crossover, mutate } from './ga.js';
import { createRng } from './rng.js';
import type { HeadlessState } from './headless_colony.js';

// ── Config ────────────────────────────────────────────────────────────────────

const POP_SIZE      = Number(process.env.POP_SIZE)     || 200;
const GENERATIONS   = Number(process.env.GENERATIONS)  || 500;
const H             = Number(process.env.H)             || 24;
const K_TRAIN       = Number(process.env.K_TRAIN)       || 3;
const K_FINAL       = Number(process.env.K_FINAL)       || 20;
const TOURNAMENT_K  = 5;
const ELITE_COUNT   = 10;
const SIGMA_INIT    = 0.30;
const SIGMA_DECAY   = 0.995;
const CHECKPOINT_EVERY = 50;

// ── Starting colony state ────────────────────────────────────────────────────
// A representative TL-8 colony at founding.

const START_STATE: HeadlessState = {
  tech_level: 8, home_tl: 8,
  orbit_au: 1.0, phi_min: 0.5,
  rvm: 0, weather_factor: 0, ag_output_roll_bonus: 0,
  month: 0,
  al: 60, il: 20, ml: 15, afl: 5,
  ac: 40, ic_light: 10, ic_heavy: 5, ic_construction: 5, mc: 10,
  power_kw: 500,
  rations: 100, raw_materials_t: 200,
  housing_m3: 10_000,
  sl_value_per_person: 250, debt_cr: 0,
  sn: 1.0, ss: 100, sl: 1.0,
  political_track: 1, acclimatization_stage: 1,
  road_network_cr_spent: 0,
  active_all_output_dm: 0, active_ag_output_dm: 0,
};

const START: StartConfig = { state: START_STATE };

// ── Seed bank (1000 pre-drawn seeds, rotated each generation) ────────────────

const SEED_BANK_SIZE = 1000;
const seedBank = Array.from({ length: SEED_BANK_SIZE }, (_, i) => i + 1);

function trainingSeeds(generation: number): number[] {
  const offset = (generation * K_TRAIN) % SEED_BANK_SIZE;
  return Array.from({ length: K_TRAIN }, (_, i) => seedBank[(offset + i) % SEED_BANK_SIZE]);
}

// ── Output path ───────────────────────────────────────────────────────────────

const __dirname   = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR  = join(__dirname, '..');
const OUTPUT_PATH = join(OUTPUT_DIR, 'best_policy.json');

function savePolicy(chromosome: Float64Array, score: number, generation: number): void {
  writeFileSync(OUTPUT_PATH, JSON.stringify({
    chromosome:  Array.from(chromosome),
    score,
    generation,
    timestamp:   new Date().toISOString(),
    config: { POP_SIZE, GENERATIONS, H, K_TRAIN },
  }, null, 2));
}

// ── Main loop ─────────────────────────────────────────────────────────────────

console.log(`WorldTamer GA Allocator Training`);
console.log(`Pop: ${POP_SIZE}  Gens: ${GENERATIONS}  H: ${H}  K: ${K_TRAIN}`);
console.log(`Chromosome length: ${CHROMOSOME_LEN} floats`);
console.log('─'.repeat(60));

const rng    = createRng(Date.now() & 0xFFFFFFFF);
let sigma    = SIGMA_INIT;

// Initialise population
let population = Array.from({ length: POP_SIZE }, () => randomChromosome(CHROMOSOME_LEN, rng));
let scores     = population.map(c => evaluateChromosome(c, START, REF, trainingSeeds(0), H));

let bestIdx   = scores.indexOf(Math.max(...scores));
let bestScore = scores[bestIdx];
let bestChrom = population[bestIdx];

console.log(`Gen   0  best=${bestScore.toFixed(3)}  mean=${(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(3)}  σ=${sigma.toFixed(4)}`);

for (let gen = 1; gen <= GENERATIONS; gen++) {
  // Sort by score descending
  const ranked = scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s - a.s);

  const next: Float64Array[] = [];

  // Elitism: carry forward top ELITE_COUNT unchanged
  for (let e = 0; e < ELITE_COUNT && e < ranked.length; e++) {
    next.push(population[ranked[e].i]);
  }

  // Breed remainder via tournament + blend crossover + mutation
  while (next.length < POP_SIZE) {
    const idxA  = tournamentSelect(population, scores, TOURNAMENT_K, rng);
    const idxB  = tournamentSelect(population, scores, TOURNAMENT_K, rng);
    const alpha = rng.nextFloat();
    const child = mutate(crossover(population[idxA], population[idxB], alpha), sigma, rng);
    next.push(child);
  }

  population = next;
  const seeds = trainingSeeds(gen);
  scores      = population.map(c => evaluateChromosome(c, START, REF, seeds, H));

  const genBest  = Math.max(...scores);
  const genMean  = scores.reduce((a, b) => a + b, 0) / scores.length;
  const genBestI = scores.indexOf(genBest);

  if (genBest > bestScore) {
    bestScore = genBest;
    bestChrom = population[genBestI];
  }

  sigma *= SIGMA_DECAY;

  if (gen % 10 === 0 || gen <= 5) {
    console.log(`Gen ${String(gen).padStart(3)}  best=${genBest.toFixed(3)}  mean=${genMean.toFixed(3)}  σ=${sigma.toFixed(4)}`);
  }

  if (gen % CHECKPOINT_EVERY === 0) {
    savePolicy(bestChrom, bestScore, gen);
    console.log(`  ✓ checkpoint saved (gen ${gen}, best=${bestScore.toFixed(3)})`);
  }
}

// Final evaluation of best individual with K_FINAL seeds
console.log('─'.repeat(60));
console.log(`Final evaluation of best chromosome with K=${K_FINAL} seeds…`);
const finalSeeds  = Array.from({ length: K_FINAL }, (_, i) => SEED_BANK_SIZE + i + 1);
const finalScore  = evaluateChromosome(bestChrom, START, REF, finalSeeds, H);
console.log(`Final score: ${finalScore.toFixed(4)}`);

savePolicy(bestChrom, finalScore, GENERATIONS);
console.log(`Best policy saved to ${OUTPUT_PATH}`);
