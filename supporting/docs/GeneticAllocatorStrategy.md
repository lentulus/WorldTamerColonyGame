# Genetic Algorithm Allocator — Strategy Document

*Prepared 2026-05-29. Status: pre-implementation design only.*
*Not integrated into the product. Intended for offline training and optional later deployment.*

---

## 1. The problem

Each monthly turn the player makes four sequential allocation decisions:

| Step | Decision | Resources split |
|---|---|---|
| 3 | Rations | available rations → population / stockpile / export / animals |
| 5 | Raw materials | available materials → agriculture / industry / energy / stockpile / export |
| 6 | Industrial output | Q_I credits → capital / housing / consumer goods / armed forces / export / road network |
| 7 | Labour | total laborers → AL / IL / ML / AFL (takes effect next turn) |

All four decisions interact across turns:
- Labour this turn determines Q_A, Q_M, Q_I next turn.
- Capital purchased this turn amplifies output every future turn.
- Ration stockpile this turn absorbs a bad weather roll next turn.
- Road investment compounds (once roads are complete, 60% penalty disappears permanently).

The player cannot observe dice outcomes before allocating (except in step 3, where Q_A is already known). Optimal allocation is therefore a stochastic sequential decision problem.

A genetic algorithm does not solve the problem analytically, but can discover robust allocation policies by evolving and evaluating many candidate strategies against the actual WTH simulation rules.

---

## 2. Two design choices, one recommendation

### Option A — Direct encoding (fixed horizon)

Evolve concrete allocation fractions for each month across a horizon of H months.

Chromosome: `H × 19` real numbers (four allocation vectors per month, each a probability simplex).

**Pro:** Simple to implement; no approximation.  
**Con:** H-month chromosome cannot generalise to a new starting state; large search space (H=12 → 228 parameters); sensitive to dice variance at the individual level.

### Option B — Parameterised policy (recommended)

Evolve a *policy* — a function that maps the current colony state to allocation fractions. The same policy handles every month and every starting state.

**Pro:** Far fewer parameters; generalises across random events and different starting conditions; the trained policy can be deployed in the live product.  
**Con:** Requires a differentiable or structured policy representation and a slightly more complex evaluation loop.

**Recommendation:** Begin with a linear policy (Option B, simplest form) and upgrade to a small neural network only if the linear policy proves insufficient.

---

## 3. Chromosome representation

### 3.1 State vector (inputs to the policy)

Normalise all inputs to [0, 1] or [−1, +1]:

```
state = [
  sn,                          // Standard of Nutrition (0–2, clamp at 2)
  ss_normalised,               // SS / 200 (raw m³/laborer, normalised)
  sl,                          // SL ratio (0–2)
  political_track / 3,         // −1…+1
  acclimatization_stage / 5,   // 0…1
  rations_months,              // stockpile / monthly_consumption (clamped at 12)
  rm_months,                   // raw materials stockpile / monthly_consumption
  debt_normalised,             // debt / (Q_I × 12), rough affordability signal
  road_pct_complete,           // 0…1
  al_frac, il_frac, ml_frac,   // current labour distribution (sum to 1)
  ac_frac, ic_frac, mc_frac,   // capital mix (each / total_capital)
  phi_t,                       // current seasonal factor (0…1)
  weather_factor_normalised,   // weather_factor / 5
]
```

Dimension: ~17 inputs. (Omit features that are effectively constant for a given colony.)

### 3.2 Policy structure (linear)

For each allocation category, compute a weight vector via a softmax over a linear combination of the state:

```
logits_rations   = W_r  · state + b_r    (4-dim)
logits_materials = W_m  · state + b_m    (5-dim)
logits_industry  = W_i  · state + b_i    (6-dim)
logits_labour    = W_l  · state + b_l    (4-dim)

fracs_k = softmax(logits_k)              (each sums to 1.0)
```

Parameter count: `17×4 + 4 + 17×5 + 5 + 17×6 + 6 + 17×4 + 4 = 340` real numbers.

The chromosome is a flat array of 340 floats encoding all W and b matrices.

### 3.3 Constraint handling

Softmax always produces a valid probability simplex (all ≥ 0, sum = 1), so hard constraints are satisfied by construction. The only remaining constraint is:

> Population ration allocation must ≥ subsistence (total_laborers × subsistence_rate).

Enforce with a post-processing clamp: if `fracs_rations[population] × available < subsistence`, clamp population fraction up and rescale the rest proportionally. Apply this before fitness evaluation — never penalise it.

### 3.4 Labour allocation special case

Labour fracs determine next month's production. The allocation is not bounded by a produced quantity — it is bounded by total working-age laborers. Apply the same softmax-then-clamp approach; AFL must be ≥ 0 (no minimum floor in the current model).

---

## 4. Fitness function

Run the policy for H = 24 turns from a canonical starting state and score the colony trajectory.

### 4.1 Component scores

| Component | Formula | Weight |
|---|---|---|
| Nutrition | mean(SN over all turns) | 3.0 |
| Shelter | mean(SS_normalised over all turns) | 1.5 |
| Living standard | mean(SL over all turns) | 1.5 |
| Population growth | final_laborers / initial_laborers | 2.0 |
| Political stability | (final_political_track + 3) / 6 | 1.0 |
| Debt avoidance | max(0, 1 − debt_cr / (Q_I_avg × 24)) | 1.0 |
| Infrastructure | road_pct_complete at turn 24 | 1.0 |
| Crisis penalty | −2 per turn where SN < 0.85 | applied before weighting |
| Starvation penalty | −10 per turn where SN < 0.65 | applied before weighting |

### 4.2 Final score

```
fitness = Σ (weight_k × score_k) + crisis_penalties
```

All component scores are bounded [0, 1] before weighting. The crisis penalties are unbounded downward — a colony that starves will reliably score very low regardless of other metrics.

### 4.3 Stochastic evaluation

Dice rolls make the fitness of a single run noisy. Evaluate each individual with K random seeds and take the mean:

- Training: K = 3 (fast, allows large populations).
- Final selection of elite individuals: K = 20 (robust measurement).

Use a **fixed seed bank** (a list of 1000 pre-drawn seed values shared across all generations). Rotate which K seeds are used each generation — this prevents the GA from overfitting to a particular lucky or unlucky seed.

---

## 5. Genetic operators

### 5.1 Population and selection

- Population size: 200 individuals.
- Selection: Tournament selection, tournament size 5.
- Elitism: keep top 10 individuals unchanged each generation.

### 5.2 Crossover

Arithmetic (blend) crossover, applied with probability 0.8:

```
child = α × parent_A + (1 − α) × parent_B
where α ~ Uniform(0, 1)
```

This preserves the [−∞, +∞] range of the logit parameters naturally.

### 5.3 Mutation

Gaussian perturbation, applied with probability 0.15 per parameter:

```
gene' = gene + N(0, σ)
```

Start with σ = 0.3. Decay σ by 0.995 per generation (simulated annealing schedule). Reset σ if population diversity drops below a threshold (measured as mean pairwise L2 distance).

### 5.4 Initialisation

Sample all parameters from N(0, 0.5) so that initial softmax outputs are close to uniform (no strong bias). This gives the GA a flat prior — all allocations start roughly equal before selection pressure shapes them.

---

## 6. Headless simulation architecture

The existing server engine functions are already pure (no DB, no HTTP). The headless simulator imports them directly.

### 6.1 Files to reuse unchanged

```
server/src/engine/production.ts     computeM, computeQA, computeQM, computeQI, computeSN, computeSS, computeSLDecay, computeSLReplenishment, computeSLIndex, computePowerFactor, computePhiT
server/src/engine/rolls.ts          lookupOutputMultiplier, applyOutputDMs, lookupWeatherOutcome, lookupPoliticalOutcome
server/src/engine/events.ts         computeStormDamage, computeRandomEventEffect, computeAcclimatizationAdvance
server/src/engine/maintenance.ts    computeMaintenanceCost, computeInfrastructureEfficiency
server/src/engine/infrastructure.ts computeRoadNetworkStatus, computeTransportCapacity, computeTransportDemand
```

### 6.2 New file: `training/headless_colony.ts`

```typescript
interface ColonySnapshot {
  // mirrors the essential fields of ColonyTurn + Colony
  month: number;
  al: number; il: number; ml: number; afl: number;
  ac: number; ic_light: number; ic_heavy: number; ic_construction: number; mc: number;
  power_kw: number;
  rations: number; raw_materials_t: number; housing_m3: number;
  sl_value_per_person: number; debt_cr: number;
  sn: number; ss: number; sl: number;
  political_track: number; acclimatization_stage: number;
  road_network_cr_spent: number;
  // world parameters (constant)
  tech_level: number; home_tl: number; orbit_au: number; phi_min: number;
  rvm: number; weather_factor: number; ag_output_roll_bonus: number;
}

// Reference data (loaded once from the seed values, not from DB)
interface RefData {
  agRef:    { ac_cost_cr: number; rm_t_per_month: number; land_km2_per_al: number; base_output_rations: number };
  indRef:   { kw_per_unit: number; output_cr_per_il_month: number; light_ic_cost_cr: number; /* ... */ };
  matRef:   { base_output_t_per_month: number; kw_per_unit: number };
  transRef: { cost_mcr_per_km: number };
  snTable:  Array<{ sn_lo: number; sn_hi: number; output_dm: number; political_dm: number }>;
  politTable: Array<{ roll_lo: number; roll_hi: number; event_label: string; output_dm: number; track_movement: number; affected_sectors: string }>;
  rollTable:  Array<{ roll_lo: number; roll_hi: number; multiplier: number }>;
  weatherTable: Array<{ roll_lo: number; roll_hi: number; outcome: string }>;
  randomEvents: Array<{ roll: number; event_label: string; description: string; effects: string; duration_months: number }>;
  slTable:  Array<{ tl_lo: number; tl_hi: number; value_cr: number }>;
}
```

The headless colony `stepTurn(state, policy, refData, rng)` function:
1. Compute acclimatization roll and DM.
2. Read active events from an in-memory events list (not DB).
3. Roll weather, random event, political using `rng`.
4. Compute Q_A, Q_M, Q_I using pure engine functions.
5. Call `policy.allocate(state)` → four allocation vectors.
6. Apply allocations; compute SN, SS, SL, debt.
7. Update state for next turn.
8. Return new state + turn score.

The `rng` is a seeded deterministic PRNG (e.g., Mulberry32 — 4-line implementation, no dependencies).

### 6.3 Reference data loading

Extract reference data from the SQLite seed values **once** at training startup and serialise to a JSON file `training/ref_data.json`. The headless simulator reads this JSON — no DB connection at training time. This makes the training process fully portable (can run on a separate machine or in a CI job).

A one-shot extraction script: `training/extract_ref_data.ts` — reads the seeded colony DB, writes ref_data.json, exits.

---

## 7. Hyperparameter recommendations

| Parameter | Recommended value | Rationale |
|---|---|---|
| Population size | 200 | Balances diversity vs. evaluation cost |
| Generations | 500 | Linear policy converges quickly |
| Evaluation horizon H | 24 turns | Two years; captures medium-term tradeoffs |
| Seeds per evaluation K | 3 (train) / 20 (final) | Speed vs. robustness |
| Crossover probability | 0.80 | Standard |
| Mutation probability | 0.15 per gene | Standard |
| Initial σ | 0.30 | Logit scale; near-uniform softmax output |
| σ decay | 0.995/generation | Exploration → exploitation shift |
| Tournament size | 5 | Moderate selection pressure |
| Elitism count | 10 | Preserves good solutions |

Expected wall-clock time at 200 × 500 = 100 000 evaluations, each H=24 turns × K=3 seeds:
- 7.2 million simulated turns.
- At ~10 000 turns/second (pure TypeScript, single-threaded): ~12 minutes.
- Parallelisable across CPU cores: ~2 minutes on 8 cores.

---

## 8. Multi-objective extensions (future)

The single weighted-sum fitness is adequate for an initial policy. If the results show a consistent tradeoff (e.g., good SN always at the cost of low SL), upgrade to NSGA-II (Non-dominated Sorting GA):

- Maintain a Pareto front of non-dominated solutions.
- Return a set of policies with different SN/SS/SL tradeoff profiles.
- The player selects which policy to use based on their current priorities.

This is worth building if the trained policy is deployed in the live product with a "governor style" selector.

---

## 9. Integration path

The GA is intentionally isolated from the product during training. Integration, when desired, follows three steps:

**Step 1 — Train offline.**
Run the GA using the headless simulator. Save the chromosome of the best individual to `training/best_policy.json`.

**Step 2 — Expose as a suggestion endpoint.**
Add `GET /api/colonies/:id/suggest` to the server. The endpoint:
- Loads the serialised policy weights.
- Reads current colony state.
- Calls `policy.allocate(state)` → allocation fractions.
- Returns suggested allocations as percentages.
The player sees a "Suggested allocation" that they can accept or override.

**Step 3 — Autoplay mode (optional).**
Add a "Let the governor decide" button. Each turn, the suggestion endpoint is called and allocations are submitted automatically. The player can exit autoplay at any time.

The separation between the headless simulator and the live server means the policy weights can be updated (re-trained) without touching the product code — just replace `best_policy.json` and restart.

---

## 10. Known limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| Linear policy may underfit late-game | Late-game has more capital types and road decisions | Upgrade to 2-layer MLP (adds ~1000 parameters) |
| Fixed TL during training | Policy trained at TL 8 may not transfer to TL 5 | Train at multiple TLs; add TL to state vector |
| No off-world trade | Step 8 deferred; GA ignores export value | Extend when trade is implemented |
| Random events are rare | GA may not learn robust drought/plague responses | Artificially increase event probability during training |
| 24-turn horizon misses maintenance onset | Maintenance kicks in at month 120 | Train a separate long-horizon phase after month 100 |

---

## 11. Files to create

```
training/
  extract_ref_data.ts      one-shot: colony DB → ref_data.json
  ref_data.json            static reference tables (gitignored if large)
  headless_colony.ts       pure simulation engine (no DB)
  policy.ts                policy encoding/decoding + allocate()
  fitness.ts               evaluation loop + scoring
  ga.ts                    tournament selection, crossover, mutation, main loop
  run_training.ts          entry point: load ref_data, run GA, save best_policy.json
  best_policy.json         output: evolved chromosome (gitignored from product build)
```

None of these files touch `server/`, `client/`, or `packages/` — the GA is a standalone tool that happens to import from `server/src/engine/`.
