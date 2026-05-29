// Event resolution engine: pure math functions + DB-backed resolvers.
import { getDb } from '../db/colony.js';
import type { EventEffects, WeatherOutcome } from '@worldtamer/shared';

// ── Pure math functions (tested in events.test.ts) ────────────────────────────

export function computeStormDamage(
  roll: number,
  colonyTL: number,
  stormType: 'severe_storm' | 'catastrophic_storm',
): number {
  const multiplier = stormType === 'severe_storm' ? 5 : 10;
  return Math.max(0, roll - colonyTL) * multiplier;
}

export function computeRandomEventEffect(
  effects: EventEffects,
  state: { rations: number; housing_m3: number },
): { rations_lost: number; housing_lost: number; capital_units_destroyed: number } {
  return {
    rations_lost:            (effects.rations_lost_fraction  ?? 0) * state.rations,
    housing_lost:            (effects.housing_lost_fraction  ?? 0) * state.housing_m3,
    capital_units_destroyed: effects.capital_units_destroyed ?? 0,
  };
}

// WTH acclimatization difficulty thresholds (D20 roll required to advance stage):
//   Stage 1→2: ≥16   Stage 2→3: ≥13   Stage 3→4: ≥10   Stage 4→5: ≥7
const ACCL_THRESHOLD: Record<number, number> = { 1: 16, 2: 13, 3: 10, 4: 7 };

export function computeAcclimatizationAdvance(stage: number, roll: number): number {
  const threshold = ACCL_THRESHOLD[stage];
  if (threshold === undefined) return stage; // stage 5 or invalid
  return roll >= threshold ? stage + 1 : stage;
}

// ── DB-backed resolvers ───────────────────────────────────────────────────────

// Aggregate output DMs from all currently active colony events.
export function applyActiveEvents(colonyId: number, currentMonth: number): EventEffects {
  const rows = getDb().prepare(`
    SELECT effects FROM colony_events
    WHERE colony_id = ? AND active_until_month >= ? AND active_until_month IS NOT NULL
  `).all(colonyId, currentMonth) as { effects: string }[];

  const acc: EventEffects = {};
  for (const row of rows) {
    const fx = JSON.parse(row.effects) as EventEffects;
    if (fx.all_output_dm) acc.all_output_dm = (acc.all_output_dm ?? 0) + fx.all_output_dm;
    if (fx.ag_output_dm)  acc.ag_output_dm  = (acc.ag_output_dm  ?? 0) + fx.ag_output_dm;
    if (fx.political_dm)  acc.political_dm  = (acc.political_dm  ?? 0) + fx.political_dm;
  }
  return acc;
}

// Compute storm damage for this turn and update the weather event record.
// Returns the damage amount (capital units destroyed).
export function resolveWeatherDamage(
  outcome: WeatherOutcome,
  colonyTL: number,
  colonyId: number,
  newMonth: number,
): number {
  if (outcome !== 'severe_storm' && outcome !== 'catastrophic_storm') return 0;

  const roll = outcome === 'severe_storm'
    ? Math.ceil(Math.random() * 6)   // 1D6
    : Math.ceil(Math.random() * 20); // 1D20
  const damage = computeStormDamage(roll, colonyTL, outcome);

  if (damage > 0) {
    const effects: EventEffects = { capital_units_destroyed: damage, capital_sector: 'ac' };
    getDb().prepare(`
      UPDATE colony_events SET effects = ?
      WHERE colony_id = ? AND month = ? AND event_type = 'weather'
    `).run(JSON.stringify(effects), colonyId, newMonth);
  }
  return damage;
}

// Apply a random event: immediate quantity effects go to active_turn_json fields
// (returned as adjustments); duration effects remain in colony_events.
// Permanent bonuses update colonies.ag_output_roll_bonus immediately.
export function resolveRandomEvent(
  eventRoll: number,
  colonyId: number,
  newMonth: number,
  currentRations: number,
  currentHousing: number,
): { description: string; effects: EventEffects; duration_months: number; impact: { rations_lost: number; housing_lost: number } } {
  const db = getDb();
  const row = db.prepare(
    `SELECT event_label, description, effects, duration_months
     FROM ref_random_events WHERE roll = ?`
  ).get(eventRoll) as {
    event_label: string; description: string;
    effects: string; duration_months: number;
  } | undefined;

  if (!row) return { description: '', effects: {}, duration_months: 0, impact: { rations_lost: 0, housing_lost: 0 } };

  const fx = JSON.parse(row.effects) as EventEffects;
  const impact = computeRandomEventEffect(fx, { rations: currentRations, housing_m3: currentHousing });

  // Permanent ag bonus — update colony immediately
  if (fx.permanent_ag_roll_bonus) {
    db.prepare(`
      UPDATE colonies SET ag_output_roll_bonus = ag_output_roll_bonus + ? WHERE id = ?
    `).run(fx.permanent_ag_roll_bonus, colonyId);
  }

  // Update the existing colony_events record (inserted by turns.ts before this call)
  const fullEffects = { ...fx };
  const activeUntil = row.duration_months > 0 ? newMonth + row.duration_months - 1 : null;
  db.prepare(`
    UPDATE colony_events SET effects = ?, active_until_month = ?
    WHERE colony_id = ? AND month = ? AND event_type = 'random'
  `).run(JSON.stringify(fullEffects), activeUntil, colonyId, newMonth);

  return {
    description: `${row.event_label}: ${row.description}`,
    effects: fx,
    duration_months: row.duration_months,
    impact: { rations_lost: impact.rations_lost, housing_lost: impact.housing_lost },
  };
}

// Monthly acclimatization roll. Updates colonies.acclimatization_stage if advanced.
export function resolveAcclimatization(
  colonyId: number,
  currentStage: number,
): { roll: number; new_stage: number; advanced: boolean } {
  const roll = Math.ceil(Math.random() * 20);
  const newStage = computeAcclimatizationAdvance(currentStage, roll);
  const advanced = newStage > currentStage;
  if (advanced) {
    getDb().prepare('UPDATE colonies SET acclimatization_stage = ? WHERE id = ?')
      .run(newStage, colonyId);
  }
  return { roll, new_stage: newStage, advanced };
}
