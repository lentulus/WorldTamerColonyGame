// Pure functions for turn dice resolution. DB-backed lookups use getDb().
import { getDb } from '../db/colony.js';

// ── Output roll multiplier (WTH Ch.5, ref_output_roll) ────────────────────────

export function lookupOutputMultiplier(adjustedRoll: number): number {
  // Clamp to the table's lower bound (1) — rolls below 1 return the worst multiplier.
  const clamped = Math.max(1, adjustedRoll);
  const row = getDb().prepare(
    `SELECT multiplier FROM ref_output_roll
     WHERE roll_lo <= ? AND roll_hi >= ? LIMIT 1`
  ).get(clamped, clamped) as { multiplier: number } | undefined;
  if (!row) throw new Error(`No output multiplier row for roll ${clamped}`);
  return row.multiplier;
}

// ── DM accumulator (pure) ─────────────────────────────────────────────────────
// Sums all four DM sources. Controlled economy DM (always −1) is baseDM.
// Table sentinel values handle any adjusted roll at the lookup stage.

export function applyOutputDMs(
  baseDM: number,
  politicalDM: number,
  eventDM: number,
  acclimatizationDM: number,
): number {
  return baseDM + politicalDM + eventDM + acclimatizationDM;
}

// ── Weather outcome (WTH Ch.5, ref_weather_outcomes) ──────────────────────────

export type WeatherOutcome = 'none' | 'drought' | 'severe_storm' | 'catastrophic_storm';

export function lookupWeatherOutcome(adjustedRoll: number): WeatherOutcome {
  const row = getDb().prepare(
    `SELECT outcome FROM ref_weather_outcomes
     WHERE roll_lo <= ? AND roll_hi >= ? LIMIT 1`
  ).get(adjustedRoll, adjustedRoll) as { outcome: string } | undefined;
  if (!row) throw new Error(`No weather outcome row for roll ${adjustedRoll}`);
  return row.outcome as WeatherOutcome;
}

// ── Political outcome (WTH Ch.5, ref_political_table) ────────────────────────

export interface PoliticalOutcome {
  event_label:      string;
  output_dm:        number;
  affected_sectors: string;
  track_movement:   number;
}

export function lookupPoliticalOutcome(adjustedRoll: number): PoliticalOutcome {
  const row = getDb().prepare(
    `SELECT event_label, output_dm, affected_sectors, track_movement
     FROM ref_political_table
     WHERE roll_lo <= ? AND roll_hi >= ? LIMIT 1`
  ).get(adjustedRoll, adjustedRoll) as PoliticalOutcome | undefined;
  if (!row) throw new Error(`No political outcome row for roll ${adjustedRoll}`);
  return row;
}
