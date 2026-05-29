// Headless replacements for the DB-backed lookup functions in server/src/engine/rolls.ts
// and the inline DM lookups in server/src/routes/turns.ts.
// All take RefData as a parameter — no getDb() calls.

import type { RefData } from './ref_data.js';

// ── Output roll multiplier ────────────────────────────────────────────────────

export function lookupOutputMultiplierH(adjustedRoll: number, ref: RefData): number {
  const clamped = Math.max(1, adjustedRoll);
  const row = ref.outputRoll.find(r => r.roll_lo <= clamped && r.roll_hi >= clamped);
  // If above the table ceiling, return the highest multiplier.
  if (!row) return ref.outputRoll[ref.outputRoll.length - 1].multiplier;
  return row.multiplier;
}

// ── Weather outcome ───────────────────────────────────────────────────────────

export function lookupWeatherOutcomeH(adjustedRoll: number, ref: RefData): string {
  const row = ref.weather.find(r => r.roll_lo <= adjustedRoll && r.roll_hi >= adjustedRoll);
  return row?.outcome ?? 'none';
}

// ── Political outcome ─────────────────────────────────────────────────────────

export interface PoliticalOutcomeH {
  event_label:     string;
  output_dm:       number;
  affected_sectors: string;
  track_movement:  number;
}

export function lookupPoliticalOutcomeH(adjustedRoll: number, ref: RefData): PoliticalOutcomeH {
  const row = ref.political.find(r => r.roll_lo <= adjustedRoll && r.roll_hi >= adjustedRoll);
  if (!row) {
    // Below the table floor — return the most negative outcome.
    const worst = ref.political[0];
    return { event_label: worst.event_label, output_dm: worst.output_dm, affected_sectors: worst.affected_sectors, track_movement: worst.track_movement };
  }
  return { event_label: row.event_label, output_dm: row.output_dm, affected_sectors: row.affected_sectors, track_movement: row.track_movement };
}

// ── SN DMs ────────────────────────────────────────────────────────────────────

export function snDMsH(sn: number, ref: RefData): { output_dm: number; political_dm: number } {
  const row = ref.sn.find(r => r.sn_lo <= sn && r.sn_hi >= sn);
  // SN below the table floor falls into the lowest band.
  if (!row) return { output_dm: ref.sn[0].output_dm, political_dm: ref.sn[0].political_dm };
  return { output_dm: row.output_dm, political_dm: row.political_dm };
}

// ── SS political DM ───────────────────────────────────────────────────────────

export function ssPoliticalDMH(ss: number, ref: RefData): number {
  const row = ref.ss.find(r => r.ss_lo <= ss && r.ss_hi >= ss);
  if (!row) return ref.ss[0].political_dm;
  return row.political_dm;
}

// ── SL baseline value ─────────────────────────────────────────────────────────

export function getSlBaselineH(home_tl: number, ref: RefData): number {
  const row = ref.slStart.find(r => r.tl_lo <= home_tl && r.tl_hi >= home_tl);
  if (!row) return ref.slStart[ref.slStart.length - 1].value_cr;
  return row.value_cr;
}
