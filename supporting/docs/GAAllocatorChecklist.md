# WorldTamer GA Allocator — Execution Checklist

Execution record for the offline genetic algorithm allocator.
Design authority: [GeneticAllocatorStrategy.md](GeneticAllocatorStrategy.md).
Working-style rules: [PROCEDURE.md](../../PROCEDURE.md).

**Legend**
- `[AI]` — Claude does it without human input.
- `[HUMAN]` — Requires human decision. Double-approval gate applies for irreversible actions.
- `[RUN]` — Human runs a script or command and reports the output.

**Boundary rule:** Nothing in `training/` touches `server/`, `client/`, or `packages/` except
to import pure engine functions from `server/src/engine/`. All DB and HTTP logic stays in the product.

**Test convention:** Same as the main product — no production code without a failing test first.
Commit prefixes: `red:` for failing tests, `green:` for the implementation that turns them green.

---

## Slice T0 — Training workspace scaffold

**Goal:** `training/` is a pnpm workspace package. `pnpm test` from root still passes.
`tsx` can run scripts in `training/src/` directly.

- [x] **T0.1 [AI]** Create `training/package.json`:
  ```json
  {
    "name": "@worldtamer/training",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "scripts": {
      "test": "vitest run",
      "extract": "tsx src/extract_ref_data.ts",
      "train":   "tsx src/run_training.ts"
    },
    "devDependencies": {
      "@worldtamer/shared": "workspace:*",
      "tsx": "^4.19.4",
      "typescript": "^5.8.3",
      "vitest": "^4.1.7"
    }
  }
  ```

- [x] **T0.2 [AI]** Create `training/tsconfig.json` — extends `../server/tsconfig.json`,
  sets `rootDir`/`outDir` to `src`/`dist`, adds a path alias so
  `../../server/src/engine/*` resolves correctly from test files.

- [x] **T0.3 [AI]** Create `training/vitest.config.ts` — `passWithNoTests: true` initially.

- [x] **T0.4 [AI]** Add `training` to `pnpm-workspace.yaml`.

- [x] **T0.5 [HUMAN]** Approve `pnpm install` *(double-approval gate)*.

- [x] **T0.6 [AI]** Verify `pnpm test` from root still passes (193 server tests + 0 training tests).

- [x] **T0.7 [HUMAN]** Approve commit: `scaffold: training workspace`.

---

## Slice T1 — Reference data

**Goal:** All WTH lookup tables are available to the training code as in-memory TypeScript
objects. No DB connection needed at training time.

The reference data never changes (it is WTH rules). Rather than extracting from SQLite at
training time, it is copied directly from `supporting/sql/seed.sql` into a TypeScript
constant file. This removes the DB dependency entirely and makes training fully portable.

- [x] **T1.1 [AI]** Create `training/src/ref_data.ts` — hand-transcribed from `seed.sql`.
  Exports typed constant arrays for every table the headless simulator needs:

  ```typescript
  export interface OutputRollRow  { roll_lo: number; roll_hi: number; multiplier: number }
  export interface WeatherRow     { roll_lo: number; roll_hi: number; outcome: string }
  export interface PoliticalRow   { roll_lo: number; roll_hi: number; event_label: string;
                                    output_dm: number; track_movement: number;
                                    affected_sectors: string }
  export interface SnRow          { sn_lo: number; sn_hi: number; output_dm: number; political_dm: number }
  export interface SsRow          { ss_lo: number; ss_hi: number; political_dm: number }
  export interface SlStartRow     { tl_lo: number; tl_hi: number; value_cr: number }
  export interface AgRow          { tl: number; ac_cost_cr: number; rm_t_per_month: number;
                                    land_km2_per_al: number; base_output_rations: number }
  export interface IndRow         { tl: number; light_ic_cost_cr: number; heavy_ic_cost_cr: number;
                                    construction_ic_cost_cr: number; kw_per_unit: number;
                                    rm_t_per_month: number; output_cr_per_il_month: number }
  export interface MatRow         { tl: number; mc_cost_cr: number; kw_per_unit: number;
                                    base_output_t_per_month: number }
  export interface TransportRow   { tl: number; line_load_mt_per_month: number;
                                    cost_mcr_per_km: number }
  export interface RandomEventRow { roll: number; event_label: string; description: string;
                                    effects: string; duration_months: number }

  export interface RefData {
    outputRoll:   OutputRollRow[];
    weather:      WeatherRow[];
    political:    PoliticalRow[];
    sn:           SnRow[];
    ss:           SsRow[];
    slStart:      SlStartRow[];
    agriculture:  AgRow[];
    industry:     IndRow[];
    materials:    MatRow[];
    transport:    TransportRow[];
    randomEvents: RandomEventRow[];
  }

  export const REF: RefData = { /* values from seed.sql */ };
  ```

- [x] **T1.2 [AI]** Write red tests in `training/src/ref_data.test.ts`:
  - `REF.outputRoll` has an entry covering roll 1 with multiplier 0.80.
  - `REF.outputRoll` has an entry covering roll 20 with multiplier 1.20.
  - `REF.weather` entry for adjusted roll ≤ 5 gives outcome `'drought'`.
  - `REF.agriculture` entry for TL 8 has `base_output_rations = 27`.
  - `REF.sn` entry covering SN = 1.0 has `output_dm = 0`.

- [x] **T1.3 [HUMAN]** Review red tests — confirm they capture the key seed values.

- [x] **T1.4 [AI]** Populate `REF` from `seed.sql`. Tests pass green.

- [x] **T1.5 [HUMAN]** Approve commit: `green: training ref data from seed`.

---

## Slice T2 — Headless lookup functions

**Goal:** Pure TypeScript replacements for the three DB-backed lookup functions in
`server/src/engine/rolls.ts` (`lookupOutputMultiplier`, `lookupWeatherOutcome`,
`lookupPoliticalOutcome`) plus the two inline DM lookups from `turns.ts`
(`snDMs`, `ssPoliticalDM`) and the SL baseline lookup (`getSlBaseline`).
All take `RefData` as a parameter; no `getDb()` calls.

- [x] **T2.1 [AI]** Write red tests in `training/src/lookups.test.ts`:

  ```
  lookupOutputMultiplierH(1,  REF)  → 0.80   (same as server's table for roll 1)
  lookupOutputMultiplierH(8,  REF)  → 1.00
  lookupOutputMultiplierH(20, REF)  → 1.20
  lookupOutputMultiplierH(0,  REF)  → 0.80   (clamped to table minimum)

  lookupWeatherOutcomeH(adjusted=4,  REF) → 'drought'
  lookupWeatherOutcomeH(adjusted=10, REF) → 'none'

  lookupPoliticalOutcomeH(adjusted=21, REF).track_movement > 0
  lookupPoliticalOutcomeH(adjusted=2,  REF).track_movement ≤ 0

  snDMsH(sn=1.0, REF).output_dm   → 0
  snDMsH(sn=0.5, REF).output_dm   < 0
  ssPoliticalDMH(ss=100, REF)      → 0

  getSlBaselineH(home_tl=8, REF)   > 0
  ```

- [x] **T2.2 [HUMAN]** Review red tests.

- [x] **T2.3 [AI]** Implement `training/src/lookups.ts`:
  ```typescript
  export function lookupOutputMultiplierH(adjustedRoll: number, ref: RefData): number
  export function lookupWeatherOutcomeH(adjustedRoll: number, ref: RefData): WeatherOutcome
  export function lookupPoliticalOutcomeH(adjustedRoll: number, ref: RefData): PoliticalOutcome
  export function snDMsH(sn: number, ref: RefData): { output_dm: number; political_dm: number }
  export function ssPoliticalDMH(ss: number, ref: RefData): number
  export function getSlBaselineH(home_tl: number, ref: RefData): number
  ```

- [x] **T2.4 [AI]** Tests pass green.

- [x] **T2.5 [HUMAN]** Approve commit: `green: headless lookup functions`.

---

## Slice T3 — Deterministic RNG

**Goal:** A seeded pseudo-random number generator so training evaluations are
reproducible. Same seed → same dice sequence every time.

- [x] **T3.1 [AI]** Write red tests in `training/src/rng.test.ts`:
  - `createRng(42)` followed by 10 `nextFloat()` calls produces the same sequence
    when `createRng(42)` is called again.
  - `d20(rng)` returns integers in [1, 20] over 1000 draws.
  - `d6(rng)` returns integers in [1, 6] over 1000 draws.
  - Different seeds produce different first values.

- [x] **T3.2 [AI]** Implement `training/src/rng.ts` — Mulberry32 PRNG:
  ```typescript
  export interface Rng { nextFloat(): number }
  export function createRng(seed: number): Rng
  export function d20(rng: Rng): number   // Math.ceil(rng.nextFloat() * 20)
  export function d6(rng: Rng):  number   // Math.ceil(rng.nextFloat() * 6)
  ```

- [x] **T3.3 [AI]** Tests pass green. Commit: `green: deterministic RNG (Mulberry32)`.

---

## Slice T4 — Headless colony step

**Goal:** A pure function that advances colony state by one month given a set of
allocation decisions. Imports only pure engine functions — no DB, no HTTP, no
`getDb()`. This is the simulation engine for the GA evaluator.

- [x] **T4.1 [AI]** Define `training/src/headless_colony.ts` types:

  ```typescript
  export interface HeadlessState {
    // World parameters (constant per colony)
    tech_level: number; home_tl: number; orbit_au: number; phi_min: number;
    rvm: number; weather_factor: number; ag_output_roll_bonus: number;
    // Monthly state
    month: number;
    al: number; il: number; ml: number; afl: number;
    ac: number; ic_light: number; ic_heavy: number; ic_construction: number; mc: number;
    power_kw: number;
    rations: number; raw_materials_t: number; housing_m3: number;
    sl_value_per_person: number; debt_cr: number;
    sn: number; ss: number; sl: number;
    political_track: number; acclimatization_stage: number;
    road_network_cr_spent: number;
    // Active events (simplified: aggregate DMs only, no per-event records)
    active_all_output_dm: number;
    active_ag_output_dm: number;
  }

  export interface Allocation {
    // Rations fractions (sum ≤ 1; remainder stays in stockpile)
    rations_to_population_frac: number;
    rations_to_export_frac: number;
    // Materials fractions (sum ≤ 1; remainder stays in stockpile)
    mat_to_agriculture_frac: number;
    mat_to_industry_frac: number;
    mat_to_export_frac: number;
    // Industrial credit fractions (sum ≤ 1; remainder exported)
    ind_to_capital_frac: number;
    ind_to_housing_frac: number;
    ind_to_consumer_goods_frac: number;
    ind_to_road_frac: number;
    // Labour fractions for next turn (must sum ≤ 1; remainder is afl)
    al_frac: number; il_frac: number; ml_frac: number;
  }
  ```

- [x] **T4.2 [AI]** Write red tests in `training/src/headless_colony.test.ts`:
  - `stepTurn(state, allocation, REF, rng)` with a fixed seed returns a deterministic
    new state (call twice with same seed → identical results).
  - With `rations_to_population_frac = 1.0` and rations ≥ total_laborers, `new_state.sn ≥ 1.0`.
  - `new_state.month = old_state.month + 1`.
  - Storm damage (forced via mock on `d6`) reduces `new_state.ac`.
  - `political_track` stays in [−3, +3].
  - Active event DMs reduce output (set `active_all_output_dm = -8`, verify output is lower
    than with DM = 0 given same dice).

- [x] **T4.3 [HUMAN]** Review red tests.

- [x] **T4.4 [AI]** Implement `stepTurn(state, allocation, ref, rng): HeadlessState`:

  Turn sequence (mirrors `turns.ts` turn/start + finalize logic):
  1. Acclimatization roll → new stage, DM.
  2. Active event DMs aggregated from state fields.
  3. Weather roll → outcome; if storm, damage roll → reduce AC (floor 0).
  4. Random event trigger (≥16): roll event, apply ration/housing loss and duration DMs.
     Duration effects stored as `active_all_output_dm` / `active_ag_output_dm` for
     remaining months (simplified: one aggregate DM, not a per-event list).
  5. Political roll → track movement.
  6. Output rolls (D20 × 3) with all accumulated DMs.
  7. Compute Q_A, Q_M, Q_I using pure production functions.
  8. Apply allocation fracs → new stockpiles, SN, SS, SL, debt, capital.
  9. Labour reassignment → next month's AL/IL/ML/AFL.
  10. Infrastructure efficiency and road completion.
  11. Maintenance cost (age-gated).

- [x] **T4.5 [AI]** Tests pass green.

- [x] **T4.6 [HUMAN]** Approve commit: `green: headless colony step`.

---

## Slice T5 — Policy encoding

**Goal:** Functions to build the state vector from a `HeadlessState`, encode a chromosome
as a flat `Float64Array`, and convert a chromosome + state into allocation decisions
via softmax. Chromosome dimension: `STATE_DIM × OUTPUT_DIM_k + OUTPUT_DIM_k` for each
of the four allocation categories (see strategy doc §3).

- [x] **T5.1 [AI]** Write red tests in `training/src/policy.test.ts`:
  - `buildStateVector(state, ref)` returns a `Float64Array` of length `STATE_DIM` (17).
  - All elements of `buildStateVector(...)` are finite (no NaN, no Infinity).
  - `policyAllocate(chromosome, stateVec)` — each returned allocation fraction array
    sums to 1.0 (within 1e-9 tolerance).
  - All-zero chromosome produces near-uniform allocations (softmax of zeros).
  - Round-trip: `encodeChromosome(W, b)` → flat array → `decodeChromosome(arr)` → same W, b.

- [x] **T5.2 [HUMAN]** Review red tests.

- [x] **T5.3 [AI]** Implement `training/src/policy.ts`:

  ```typescript
  export const STATE_DIM = 17;
  export const CHROMOSOME_LEN: number;  // 342 (4 linear maps)

  export function buildStateVector(state: HeadlessState, ref: RefData): Float64Array
  // Returns allocation fraction arrays: [rations(4), materials(5), industrial(6), labour(4)]
  export function policyAllocate(
    chromosome: Float64Array,
    stateVec:   Float64Array,
  ): { rations: number[]; materials: number[]; industrial: number[]; labour: number[] }

  // Subsistence floor: rations[0] (to_population) ≥ (total_laborers / rations_available)
  // clamped to [0,1]; other rations fractions rescaled proportionally.
  export function applySubsistenceFloor(
    rationsFracs: number[],
    rationsToPop: number,
    rationsTotalAvailable: number,
  ): number[]

  export function softmax(logits: number[]): number[]
  ```

- [x] **T5.4 [AI]** Tests pass green.

- [x] **T5.5 [HUMAN]** Approve commit: `green: policy encoding`.

---

## Slice T6 — Fitness evaluation

**Goal:** A function that runs a colony for H turns under a given chromosome and returns
a scalar fitness score. Multi-seed evaluation averages out dice variance.

- [x] **T6.1 [AI]** Write red tests in `training/src/fitness.test.ts`:
  - `evaluateChromosome(chromosome, startState, REF, seeds, H)` returns a finite number.
  - Same inputs → same result (deterministic).
  - A chromosome that always allocates zero rations to population scores lower than
    one that allocates adequate rations (starvation penalty dominates).
  - Fitness is strictly lower when `active_all_output_dm = -8` (adverse event) vs 0,
    all else equal.

- [x] **T6.2 [HUMAN]** Review red tests.

- [x] **T6.3 [AI]** Implement `training/src/fitness.ts`:

  ```typescript
  export interface StartConfig {
    state:  HeadlessState;
    refTl:  number;      // TL for ref table lookups
  }

  export function evaluateChromosome(
    chromosome: Float64Array,
    start:      StartConfig,
    ref:        RefData,
    seeds:      number[],  // K random seeds; score is mean over all seeds
    H:          number,    // evaluation horizon (turns)
  ): number
  ```

  Score formula (all components normalised to [0, 1] before weighting):
  ```
  score = 3.0 × mean_sn
        + 1.5 × mean_ss_normalised
        + 1.5 × mean_sl
        + 2.0 × (final_laborers / initial_laborers)
        + 1.0 × (final_political_track + 3) / 6
        + 1.0 × max(0, 1 - debt / (mean_qi × H))
        + 1.0 × road_pct_complete_at_H
        - 2.0 × (turns with SN < 0.85)
        - 10.0 × (turns with SN < 0.65)
  ```

- [x] **T6.4 [AI]** Tests pass green.

- [x] **T6.5 [HUMAN]** Approve commit: `green: fitness evaluation`.

---

## Slice T7 — Genetic algorithm

**Goal:** Tournament selection, arithmetic crossover, Gaussian mutation, and a main
training loop that runs for 500 generations and saves the best chromosome.

- [x] **T7.1 [AI]** Write red tests in `training/src/ga.test.ts`:
  - `tournamentSelect(population, scores, k, rng)` always returns an index in
    [0, population.length).
  - `tournamentSelect` with a population where one score = 1000 and others = 0
    returns that index at least 95% of the time over 200 draws (k=5).
  - `crossover(a, b, alpha=0.5)` produces a child with all genes between parent values
    (arithmetic blend).
  - `mutate(individual, sigma=0.3, rng)` changes at least some genes (probability 0.15/gene;
    over 10 000 genes, at least 500 differ from the original).
  - After 10 generations on a population of 20 with a trivial fitness (fitness = −sum of
    squared chromosome elements), best score improves or stays the same each generation.

- [x] **T7.2 [HUMAN]** Review red tests.

- [x] **T7.3 [AI]** Implement `training/src/ga.ts`:

  ```typescript
  export function tournamentSelect(
    population: Float64Array[],
    scores:     number[],
    k:          number,
    rng:        Rng,
  ): number   // index of winner

  export function crossover(a: Float64Array, b: Float64Array, alpha: number): Float64Array
  export function mutate(individual: Float64Array, sigma: number, rng: Rng): Float64Array
  export function randomChromosome(len: number, rng: Rng): Float64Array
  ```

- [x] **T7.4 [AI]** Tests pass green.

- [x] **T7.5 [AI]** Write `training/src/run_training.ts` — main entry point:

  ```typescript
  // Config
  const POP_SIZE    = 200;
  const GENERATIONS = 500;
  const H           = 24;    // evaluation horizon (months)
  const K_TRAIN     = 3;     // seeds per individual during training
  const K_FINAL     = 20;    // seeds for final elite measurement
  const TOURNAMENT_K = 5;
  const ELITE_COUNT  = 10;
  const SIGMA_INIT   = 0.3;
  const SIGMA_DECAY  = 0.995;
  ```

  Loop prints generation number, best/mean fitness, and σ each generation.
  Saves the best chromosome to `training/best_policy.json` at the end
  and every 50 generations as a checkpoint.

- [x] **T7.6 [HUMAN]** Approve `pnpm --filter @worldtamer/training run train` for a
  short smoke run (10 generations, pop 20) to verify the loop runs without errors.
  *(Double-approval gate — this is a long-running process.)*

- [x] **T7.7 [AI]** After smoke run passes: run full training (500 generations, pop 200).
  Print a brief fitness curve summary on completion.

- [x] **T7.8 [HUMAN]** Inspect fitness curve — confirm fitness improves and stabilises.
  If it does not improve beyond the initial random baseline, diagnose and fix before
  proceeding.

- [x] **T7.9 [HUMAN]** Approve commit: `green: genetic algorithm + training run`.

---

## Slice T8 — Server integration (suggest endpoint)

**Goal:** A new read-only API endpoint that loads the trained policy and returns suggested
allocations for the current colony state. The player can accept or override.

- [x] **T8.1 [AI]** Write red test in `server/src/routes/suggest.test.ts`:
  - `GET /api/colonies/:id/suggest` returns 200 with body `{ rations, materials, industrial, labour }`.
  - Each allocation object has the correct keys and all values are in [0, 1].
  - Returns 404 for a non-existent colony.
  - Returns 503 if no trained policy file exists.

- [x] **T8.2 [HUMAN]** Review red tests.

- [x] **T8.3 [AI]** Implement `server/src/routes/suggest.ts`:
  - Loads `training/best_policy.json` once at startup (or lazily on first request).
  - Reads colony state from DB → builds state vector → calls `policyAllocate`.
  - Applies the subsistence floor to the rations suggestion.
  - Returns fraction-based suggestions (not absolute quantities); client multiplies
    by the available amounts shown in the allocation panel.

- [x] **T8.4 [AI]** Wire the route into `server/src/app.ts`:
  `app.route('/api/colonies', suggest)`.

- [x] **T8.5 [AI]** Tests pass green.

- [x] **T8.6 [HUMAN]** Approve commit: `green: suggest endpoint`.

---

## Slice T9 — UI integration (optional)

**Goal:** The allocation panel shows suggested allocations pre-filled as percentages.
A "Use suggestion" button populates the input fields. The player can override any field
before submitting.

- [x] **T9.1 [AI]** Add a "Suggest" button to each allocation section in `AllocationPanel.ts`.
  On click, calls `GET /api/colonies/:id/suggest`, receives fractions, multiplies by
  available quantities, and populates the input fields.

- [x] **T9.2 [AI]** Show a "Suggested" badge next to any field populated from the policy.
  Editing a field removes the badge for that field.

- [x] **T9.3 [UI]** Player confirms:
  - Suggest button populates all fields correctly.
  - Fields are still editable after population.
  - Submitting uses the current field values (not the stale suggestion).

- [x] **T9.4 [HUMAN]** Approve commit: `green: suggest UI integration`.

---

## What is explicitly out of scope

- Neural network policy (upgrade path if linear policy underperforms — see strategy §3.2).
- NSGA-II multi-objective Pareto front (future enhancement — see strategy §8).
- Autoplay mode ("let the governor decide" for all turns) — T8 provides suggestions only.
- Off-world trade and armed forces in the fitness function (not modelled in the product yet).
