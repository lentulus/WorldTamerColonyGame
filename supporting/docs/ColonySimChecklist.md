# WorldTamer Colony Simulation — Execution Checklist

Execution record for the colony simulation.
Design authority: [ColonySimDesign.md](ColonySimDesign.md).
Working-style rules: [PROCEDURE.md](../../PROCEDURE.md).

**Legend**
- `[AI]` — Claude does it without human input.
- `[HUMAN]` — Requires human decision. Double-approval gate applies for any irreversible action (`pnpm add`, `git commit`, destructive DB ops, structural refactors): Claude echoes the exact action, waits for a second explicit yes before acting.
- `[UI]` — Player validates the change by using the running app in the browser. This is the acceptance criterion for the slice; only after the player confirms does the commit happen.

**Test convention** — No production code without a failing test first. Math tests are Claude's responsibility: identify the invariant, extract a pure function, test against a hand-verified expected value. Commit prefix: `red:` for intentionally failing tests, `green:` for commits that turn them green.

---

## Slice 0 — Scaffold

**Goal:** pnpm workspace running; server starts on port 3001; client served by Vite; shared types package; SQLite schema created with all reference tables seeded from WTH data.

- [x] **0.1 [AI]** Create workspace root: `package.json` (private, workspaces), `pnpm-workspace.yaml`.

- [x] **0.2 [AI]** Create `packages/shared/`: `package.json`, `tsconfig.json`, `src/types.ts`.

- [x] **0.3 [AI]** Create `server/`: `package.json`, `tsconfig.json`, `src/main.ts`, `src/app.ts`, `src/config.ts`.

- [x] **0.4 [AI]** Create `client/`: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.ts`.

- [x] **0.5 [HUMAN]** Approved package installation. duckdb compiled from source (no arm64/Node25 pre-built binary).

- [x] **0.6 [AI]** `pnpm install` complete. Build scripts approved for duckdb + esbuild in `pnpm-workspace.yaml`.

- [x] **0.7 [AI]** `supporting/sql/schema.sql` written — 3 operational tables + 10 ref tables.

- [x] **0.8 [AI]** `supporting/sql/seed.sql` written — full WTH data for all ref tables.

- [x] **0.9 [AI]** `server/src/db/colony.ts` — opens SQLite, runs schema + seed idempotently on startup.

- [x] **0.10 [AI]** `GET /api/health` returns `{ok:true}`. DB init wired into `buildApp()`.

- [x] **0.11 [AI]** `pnpm dev` runs server (3001) + client (5173) concurrently.

- [x] **0.12 [UI]** Player confirmed: browser shows page, `/api/health` returns 200.

- [x] **0.13 [HUMAN]** Committed `690d54e`: `scaffold: workspace, server (port 3001), client, schema, reference data seed`.

---

## Slice 1 — World Selection

**Goal:** Player can browse habitable worlds from Meridian and select one for their colony.

- [x] **1.1 [AI]** Write red test in `server/src/db/meridian.test.ts`:
  - `getHabitableWorlds()` returns at least one world with `world_type`, `atmosphere_code`, `axial_tilt_deg`, `hydrographics`, `orbit_au`, `rvm`, `habitability`, `star_spectral` populated.
  - `getHabitableWorlds()` returns only worlds with `habitability >= 1` and world_type containing "Garden".
  - Report red.

- [x] **1.2 [HUMAN]** Review red tests — confirm they capture the right acceptance criteria.

- [x] **1.3 [AI]** Implement `server/src/db/meridian.ts`: `getHabitableWorlds(filters?)` — DuckDB query joining `systems/`, `bodies/`, `physical/` with the Worlds project JOIN pattern (`system_id` + `body_id`). Returns `WorldCandidate[]`.

- [x] **1.4 [AI]** Tests pass green.

- [x] **1.5 [AI]** Add `GET /api/worlds` route with optional query params: `min_habitability`, `max_dist_pc`, `spectral`. Returns `WorldCandidate[]`.

- [x] **1.6 [AI]** Implement client `WorldList` view: filterable table showing system name, world type, atmosphere, habitability, RVM, distance. "Select" button on each row navigates to founding form.

- [x] **1.7 [UI]** Player opens app, sees world list, can filter by habitability. Rows are selectable.

- [x] **1.8 [HUMAN]** Approve commit *(double-approval gate)*: `green: world selection — Meridian query, /api/worlds, WorldList view`.

---

## Slice 2 — Colony Founding

**Goal:** Player fills a founding form for the selected world, submits it, and sees the colony status panel with turn 0 state.

- [x] **2.1 [AI]** Write red tests in `server/src/db/colony.test.ts`:
  - `POST /api/colonies` with valid founding params creates a colony row and a turn 0 `colony_turns` snapshot.
  - Turn 0 snapshot has correct `sn`, `ss`, `sl` (all 1.0 if adequately provisioned).
  - `POST /api/colonies` with a `body_id` that already has a colony returns 409 Conflict.

- [x] **2.2 [HUMAN]** Review red tests.

- [x] **2.3 [AI]** Implement `POST /api/colonies`:
  - Re-queries Meridian for the selected body to pull the 8 founding fields.
  - Computes `weather_factor` from star spectral + axial tilt + hydrographics (using `ref_weather_factor_dms`).
  - Computes `phi_min` from axial tilt and tidal locking (same formula as colony_export.py).
  - Creates the `colonies` row.
  - Creates turn 0 `colony_turns` row from founding params (rations, laborers, capital, housing, SL starting value from home TL).

- [x] **2.4 [AI]** Add `GET /api/colonies/:id` returning full colony record + current turn snapshot.

- [x] **2.5 [AI]** Tests pass green.

- [x] **2.6 [AI]** Implement client `ColonyFounder` view (form):
  - World info bar (pre-filled from selection).
  - Fields: colony name, colony TL, colonists' home TL, initial laborer counts (AL/IL/ML/AFL), initial capital by type (AC/IC_light/IC_heavy/IC_construction/MC), power KW, rations, raw materials, housing m³, debt.
  - Submit creates the colony via `POST /api/colonies`.

- [x] **2.7 [AI]** Implement client `ColonyStatus` panel (left panel):
  - Current month, TL, total population (laborers × 4).
  - Laborers by sector.
  - Capital by type.
  - Stockpiles (rations, raw materials, housing m³, debt).
  - Satisfaction indices (SN / SS / SL) with colour coding (red < 1.0, amber near 1.0, green > 1.0).
  - Political track level.

- [x] **2.8 [UI]** Player selects a world, fills founding form, submits. Colony status panel shows turn 0 state. All values match what was entered.

- [x] **2.9 [HUMAN]** Approve commit *(double-approval gate)*: `green: colony founding — POST /api/colonies, founding form, status panel`.

---

## Slice 3 — Turn Resolution: Dice and Events (Steps 1–2)

**Goal:** Player presses "Roll Turn". Server rolls all dice for the month, resolves weather and political events, displays results in the turn log. No allocation yet — player observes.

- [x] **3.1 [AI]** Write red math tests in `server/src/engine/rolls.test.ts`:
  - `lookupOutputMultiplier(roll)`: D20=1→0.80, D20=8→1.00, D20=20→1.20, boundary values.
  - `applyOutputDMs(baseDM, politicalDM, eventDM, acclimatizationDM)`: clamped to table bounds.
  - `lookupWeatherOutcome(adjustedRoll)`: correct outcome for each band.
  - `lookupPoliticalOutcome(adjustedRoll)`: correct event label and track movement for each band.

- [x] **3.2 [HUMAN]** Review red tests.

- [x] **3.3 [AI]** Implement pure functions in `server/src/engine/rolls.ts`: `lookupOutputMultiplier()`, `applyOutputDMs()`, `lookupWeatherOutcome()`, `lookupPoliticalOutcome()`. All read from seeded reference tables — no hardcoded values.

- [x] **3.4 [AI]** Tests pass green.

- [x] **3.5 [AI]** Implement `POST /api/colonies/:id/turn/start`:
  - Rolls D20 for: weather, random event trigger (≥16 triggers second roll), political, agriculture, industry, materials.
  - Applies all accumulated DMs (satisfaction DMs from previous turn, political track DM, acclimatization DM, controlled economy −1).
  - Resolves weather outcome; if storm, records damage in `colony_events`.
  - Resolves political outcome; records track movement.
  - Stores partial turn state (pending allocations) — does NOT write the `colony_turns` row yet.
  - Returns `TurnResolution` with all roll results, outcomes, and DMs shown.

- [x] **3.6 [AI]** Implement client `TurnLog` panel (centre panel):
  - Step-by-step display of what happened.
  - Each step shows: roll value, DMs applied, final result, outcome text.
  - "Roll Turn" button at top.

- [x] **3.7 [UI]** Player presses "Roll Turn". Centre panel shows all dice results with DMs and outcomes. Weather and political events are described in plain language.

- [x] **3.8 [HUMAN]** Approve commit *(double-approval gate)*: `green: turn resolution — dice rolls, weather/political events, turn log panel`.

---

## Slice 4 — Rations and Raw Materials Allocation (Steps 3–5)

**Goal:** After the turn is rolled, the player allocates rations and raw materials. Server validates, computes SN, and stores allocations.

- [x] **4.1 [AI]** Write red math tests in `server/src/engine/production.test.ts`:
  - `computeM(labor, capital)`: labor < capital case, labor = capital case, labor > capital case (capped at 1.5×capital), capital > labor case (capped at 1.25×labor). Hand-verify each result.
  - `computePhiT(t, orbitMonths, phiMin)`: returns phiMin at trough, 1.0 at peak; midpoint returns a value between the two.
  - `computeQA(M_A, q_A, R_A, phi, eta, powerFactor)`: verify against a worked example.
  - `computeSN(Q_A_allocated_to_population, totalLaborers)`: SN=1.0 when exactly adequate, correct scaling above and below.

- [x] **4.2 [HUMAN]** Review red tests.

- [x] **4.3 [AI]** Implement pure functions in `server/src/engine/production.ts`: `computeM()`, `computePhiT()`, `computeQA()`, `computeSN()`.

- [x] **4.4 [AI]** Tests pass green.

- [x] **4.5 [AI]** Implement `computeQM()` (materials output) in `production.ts`. Materials output uses the same `computeM()` formula but with `q_M × richness_modifier` from RVM.

- [x] **4.6 [AI]** Implement power check: `computePowerFactor(power_kw_available, ac, ic_total, mc, ref_industry_tl, ref_materials_tl)` — returns `min(1, available / required)`.

- [x] **4.7 [AI]** Implement `POST /api/colonies/:id/turn/allocate-rations`:
  - Validates: allocated totals ≤ stockpile + produced this turn.
  - Stores: population allocation (must ≥ subsistence, else records shortfall), stockpile delta, export.
  - Computes and stores interim SN for this turn.

- [x] **4.8 [AI]** Implement `POST /api/colonies/:id/turn/allocate-materials`:
  - Validates: allocated totals ≤ produced + stockpile.
  - Stores: allocation to agriculture (RM consumed), industry, energy, stockpile, export.

- [x] **4.9 [AI]** Implement client allocation panel (right panel), rations section:
  - Shows produced this turn + stockpile.
  - Input fields: to population, to stockpile, to export, to animals.
  - Live SN preview as the player types.
  - Validation warning if population allocation < subsistence.

- [x] **4.10 [AI]** Implement client allocation panel, raw materials section. Same pattern.

- [x] **4.11 [UI]** Player sees produced rations and raw materials. Enters allocations. SN updates live as they type. Submitting saves allocations and advances the turn log.

- [x] **4.12 [HUMAN]** Approve commit *(double-approval gate)*: `green: rations and materials allocation — production engine, SN, allocation panels`.

---

## Slice 5 — Industrial Allocation, SS/SL, Political Track (Step 6)

**Goal:** Player allocates industrial output. Server updates housing, SL goods value, and applies the political track change from the earlier roll. SS and SL computed.

- [x] **5.1 [AI]** Write red math tests:
  - `computeQI(M_I, q_I, eta, powerFactor)`: verify against a worked example from the WTH industry table.
  - `computeSS(housing_m3, totalPeople)`: SS = housing_m3 / totalPeople, with boundary values at the SS table bands.
  - `computeSLDecay(prev_sl_value)`: returns prev × 0.98 (2% monthly decay).
  - `computeSLReplenishment(consumer_goods_credits_allocated, totalPeople)`: credits per person.
  - `computeSLIndex(sl_value, baseline_sl_value)`: correct DM for each band above/below baseline, rising/falling.

- [x] **5.2 [HUMAN]** Review red tests.

- [x] **5.3 [AI]** Implement in `production.ts`: `computeQI()`, `computeSS()`, `computeSLDecay()`, `computeSLReplenishment()`, `computeSLIndex()`.

- [x] **5.4 [AI]** Tests pass green.

- [x] **5.5 [AI]** Implement `POST /api/colonies/:id/turn/allocate-industrial`:
  - Validates: allocations sum ≤ Q_I.
  - Allocation categories: new capital goods (credits reserved for capital purchase), housing construction (m³ = credits / 100), consumer goods replenishment, armed forces supply, export.
  - Updates `housing_m3`, applies SL decay, adds consumer goods replenishment.
  - Applies political track change from the earlier political roll.
  - Computes SS and SL for this turn.

- [x] **5.6 [AI]** Implement client industrial allocation panel. Show Q_I produced. Input fields for each category with a live balance display (allocated vs. available).

- [x] **5.7 [UI]** Player allocates industrial output across categories. Housing and consumer goods values update live. Political track change is shown in the turn log.

- [x] **5.8 [HUMAN]** Approve commit *(double-approval gate)*: `green: industrial allocation — Q_I, SS/SL, political track, allocation panel`.

---

## Slice 6 — Labor Reassignment, Capital, Maintenance, Turn Finalization (Step 7)

**Goal:** Player reassigns laborers for next turn. Server applies new capital, deducts maintenance, writes the completed turn record, and advances the month counter.

- [x] **6.1 [AI]** Write red math tests:
  - `computeMaintenanceCost(colonyAgeMonths, capitalValue, capitalType)`: 0% for months 0–119; 0.1%/month at month 120; 0.2% at month 132; 0.3% at month 144; 0.4% at month 156+.
  - `computeInfrastructureEfficiency(roadsComplete)`: 0.60 when roads not complete, 1.0 when complete.
  - `computeRoadRequirement(inhabited_hex_count)`: 500 km per hex, cost from `ref_transport_tl`.

- [x] **6.2 [HUMAN]** Review red tests.

- [x] **6.3 [AI]** Implement in `server/src/engine/maintenance.ts`: `computeMaintenanceCost()`, `computeInfrastructureEfficiency()`, `computeRoadRequirement()`.

- [x] **6.4 [AI]** Tests pass green.

- [x] **6.5 [AI]** Implement `POST /api/colonies/:id/turn/finalize`:
  - Accepts new labor assignments (AL/IL/ML/AFL) — validates total ≤ working-age population.
  - Converts industrial capital credits to new capital units at the colony's TL cost.
  - Computes and deducts maintenance cost (age-gated).
  - Checks infrastructure efficiency; applies 60% penalty to outputs if roads incomplete.
  - Writes the completed `colony_turns` row with all state, roll results, and satisfaction indices.
  - Increments `colonies.current_month`.
  - Returns the completed turn snapshot.

- [x] **6.6 [AI]** Implement client labor reassignment form: sliders or number inputs for AL/IL/ML/AFL with a live total showing remaining unassigned workers.

- [x] **6.7 [AI]** Implement "Advance Turn" button — calls finalize, then refreshes colony status panel.

- [x] **6.8 [AI]** Add a simple turn history list to the left panel (last 5 turns: month, SN/SS/SL, political track).

- [x] **6.9 [UI]** Player reassigns laborers, clicks Advance Turn. Colony status panel updates to the new month. Turn history shows the completed month.

- [x] **6.10 [HUMAN]** Approve commit *(double-approval gate)*: `green: labor reassignment, capital, maintenance, turn finalization`.

---

## Slice 7 — Weather Events, Random Events, Acclimatization

**Goal:** Storm damage applies to capital/housing/rations. Random events fire when triggered, with multi-turn duration effects. Acclimatization stage advances monthly.

- [x] **7.1 [AI]** Write red math tests in `server/src/engine/events.test.ts`:
  - `computeStormDamage(roll_1d6, colonyTL, stormType)`: severe storm capital loss formula `(1D6 − TL) × 5`; catastrophic storm `(1D20 − TL) × 10`. Verify floors at 0.
  - `computeRandomEventEffect(eventRoll, currentState)`: for events with deterministic effects (e.g., vermin minor: rations × 0.25 consumed), verify the output.
  - `computeAcclimatizationAdvance(stage, roll)`: advance only on the required difficulty threshold.

- [x] **7.2 [HUMAN]** Review red tests.

- [x] **7.3 [AI]** Implement `server/src/engine/events.ts`:
  - `resolveWeatherDamage()` — all four storm severity cases from WTH table.
  - `resolveRandomEvent()` — all 20 events from `ref_random_events`. Immediate effects applied inline; duration effects written to `colony_events` table.
  - `applyActiveEvents()` — called at turn start; reads `colony_events` where `active_until_month >= current_month` and applies recurring modifiers.
  - `resolveAcclimatization()` — monthly stage roll; catastrophic failure handling.

- [x] **7.4 [AI]** Tests pass green.

- [x] **7.5 [AI]** Wire events into turn resolution: `POST /api/colonies/:id/turn/start` now also calls `applyActiveEvents()` before rolling output, `resolveAcclimatization()` updates stage, `resolveWeatherDamage()` computes storm damage, `resolveRandomEvent()` handles random events. Active DMs applied to ag/ind/mat output rolls. Storm damage and random event losses propagated through TurnResolution to finalize.

- [x] **7.6 [AI]** Permanent event bonuses (tasty local lifeform: +1 all future agriculture rolls; hardy lifeform: +2) stored as permanent modifiers in `colonies` table rather than expiring events.

- [x] **7.7 [AI]** Show active events and their remaining duration in the turn log and status panel.

- [x] **7.8 [UI]** Player sees storm damage described in the turn log. Active multi-turn events (plague, drought) show in status panel with months remaining. Acclimatization stage shown with its output DM.

- [x] **7.9 [HUMAN]** Approve commit *(double-approval gate)*: `green: weather damage, random events, acclimatization`.

---

## Slice 8 — Infrastructure

**Goal:** Road network completion is tracked. Transport line capacity is checked each turn. Both show warnings when insufficient.

- [x] **8.1 [AI]** Write red tests:
  - `computeRoadNetworkStatus(inhabited_km2, construction_credits_spent, tl)`: returns `{required_cr, spent_cr, complete: boolean}`.
  - `computeTransportCapacity(installed_lines)`: total capacity in million-tonne-km/month.
  - `computeTransportDemand(raw_materials_t, total_laborers)`: demand in million-tonne-km/month.

- [x] **8.2 [HUMAN]** Review red tests.

- [x] **8.3 [AI]** Implement `server/src/engine/infrastructure.ts`: `computeRoadNetworkStatus()`, `computeTransportCapacity()`, `computeTransportDemand()`.

- [x] **8.4 [AI]** Tests pass green.

- [x] **8.5 [AI]** Store infrastructure state in `colonies`: `road_network_cr_spent`, `transport_lines` (JSON array of installed lines). Both columns already in schema; `road_network_cr_spent` now updated in finalize.

- [x] **8.6 [AI]** Wire into turn finalization: if roads incomplete, apply 60% efficiency factor to all non-construction output. Log the penalty in the turn record.

- [x] **8.7 [AI]** Wire into industrial allocation: player can direct construction output toward road network or transport lines. Server converts credits to completion progress.

- [x] **8.8 [AI]** Show infrastructure status in colony status panel: road network (% complete, credit shortfall); transport lines (installed capacity vs. demand).

- [x] **8.9 [UI]** Player sees infrastructure warnings. Can fund road construction via the industrial allocation panel. 60% penalty is visible in the turn log when roads are incomplete.

- [x] **8.10 [HUMAN]** Approve commit *(double-approval gate)*: `green: infrastructure — road network, transport capacity, efficiency penalty`.

---

## Slice 9 — Smoke Test and Sign-off

**Goal:** A colony run from founding through month 12 exercises every rule and every UI panel. All automated tests green. Player confirms the experience is coherent.

- [ ] **9.1 [AI]** Run full automated test suite: `pnpm test`. All tests must be green. Fix any failures before proceeding.

- [ ] **9.2 [AI]** Verify turn 0 → month 12 via the API directly (scripted):
  - Adequate nutrition: SN stays near 1.0 with correct provisioning.
  - Maintenance: zero in months 0–119; verify it switches on at month 120 by patching colony age in the test DB.
  - Political track: verify it moves up on a high roll and down on a low roll.
  - Storm damage: inject a catastrophic storm outcome and verify capital is destroyed.
  - Acclimatization: verify output DM applies at stage 1–4, not at stage 5.

- [ ] **9.3 [UI]** Player runs a colony from founding to month 12 using only the browser interface:
  - World selection → founding → 12 turns of allocation → status review.
  - Confirm all three panels update correctly each turn.
  - Confirm satisfaction indices produce the correct DMs on the next turn's rolls.
  - Confirm the turn history list grows correctly.

- [ ] **9.4 [HUMAN]** Player signs off that the simulation feels correct and complete for the first version.

- [ ] **9.5 [HUMAN]** Approve commit *(double-approval gate)*: `green: smoke test — 12-month simulation verified`.

---

## What is deferred (do not build now)

- Off-world trade (step 8 of the monthly turn)
- Armed forces weapons, vehicles, and readiness tracking
- Free-market economy mode
- Multi-colony UI (colony list / switching)
- Hex map land tracking (reserved for future mapping integration)
- Capital transit lag (capital currently applied immediately; 12-month shipping lag deferred)
- Turchin political stress equations
- GURPS Realm Management mechanics
