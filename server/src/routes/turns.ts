import { Hono } from 'hono';
import { getDb } from '../db/colony.js';
import {
  lookupOutputMultiplier,
  applyOutputDMs,
  lookupWeatherOutcome,
  lookupPoliticalOutcome,
} from '../engine/rolls.js';
import type { TurnResolution, EventEffects } from '@worldtamer/shared';

const turns = new Hono();

function d20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

function snDMs(sn: number): { output_dm: number; political_dm: number } {
  const row = getDb().prepare(
    `SELECT output_dm, political_dm FROM ref_sn_table
     WHERE sn_lo <= ? AND sn_hi >= ? LIMIT 1`
  ).get(sn, sn) as { output_dm: number; political_dm: number } | undefined;
  return row ?? { output_dm: 0, political_dm: 0 };
}

function ssPoliticalDM(ss: number): number {
  const row = getDb().prepare(
    `SELECT political_dm FROM ref_ss_table
     WHERE ss_lo <= ? AND ss_hi >= ? LIMIT 1`
  ).get(ss, ss) as { political_dm: number } | undefined;
  return row?.political_dm ?? 0;
}

// WTH: fully acclimatized (stage 5) = 0 DM; each lower stage is −1.
function acclimatizationDM(stage: number): number {
  return Math.min(0, stage - 5);
}

const WEATHER_DESCRIPTION: Record<string, string> = {
  none:               'Normal weather conditions.',
  drought:            'Drought — agricultural output is reduced.',
  severe_storm:       'Severe storm — capital and housing at risk.',
  catastrophic_storm: 'Catastrophic storm — major damage to colony infrastructure.',
};

// ── POST /api/colonies/:id/turn/start ─────────────────────────────────────────

turns.post('/:id/turn/start', (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'Invalid id' }, 400);

  const db = getDb();

  const colRow = db.prepare('SELECT * FROM colonies WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  if (!colRow) return c.json({ error: 'Colony not found' }, 404);

  const prevTurn = db.prepare(
    'SELECT sn, ss FROM colony_turns WHERE colony_id = ? ORDER BY month DESC LIMIT 1'
  ).get(id) as { sn: number; ss: number } | undefined;

  const snDMValues  = snDMs(prevTurn?.sn ?? 1.0);
  const ssPolitDM   = ssPoliticalDM(prevTurn?.ss ?? 100);
  const acclDM      = acclimatizationDM(Number(colRow.acclimatization_stage));
  const politTrack  = Number(colRow.political_track);
  const weatherFactor = Number(colRow.weather_factor);
  const agBonus     = Number(colRow.ag_output_roll_bonus);
  const newMonth    = Number(colRow.current_month) + 1;

  // ── Step 1: Weather ───────────────────────────────────────────────────────
  const weatherRoll     = d20();
  const weatherDM       = weatherFactor;
  const weatherAdjusted = weatherRoll + weatherDM;
  const weatherOutcome  = lookupWeatherOutcome(weatherAdjusted);

  if (weatherOutcome !== 'none') {
    db.prepare(`
      INSERT INTO colony_events (colony_id, month, event_type, description, effects, active_until_month)
      VALUES (?, ?, 'weather', ?, '{}', NULL)
    `).run(id, newMonth, WEATHER_DESCRIPTION[weatherOutcome]);
  }

  // ── Step 1: Random event trigger ──────────────────────────────────────────
  const reTriggerRoll = d20();
  let reEventRoll: number | null = null;
  let reDescription: string | null = null;
  let reEffects: EventEffects | null = null;

  if (reTriggerRoll >= 16) {
    reEventRoll = d20();
    const reRow = db.prepare(
      `SELECT event_label, description, effects, duration_months
       FROM ref_random_events WHERE roll = ?`
    ).get(reEventRoll) as {
      event_label: string; description: string;
      effects: string; duration_months: number;
    } | undefined;

    if (reRow) {
      reDescription = `${reRow.event_label}: ${reRow.description}`;
      reEffects = JSON.parse(reRow.effects) as EventEffects;
      const activeUntil = reRow.duration_months > 0
        ? newMonth + reRow.duration_months - 1
        : null;
      db.prepare(`
        INSERT INTO colony_events (colony_id, month, event_type, description, effects, active_until_month)
        VALUES (?, ?, 'random', ?, ?, ?)
      `).run(id, newMonth, reRow.description, reRow.effects, activeUntil);
    }
  }

  // ── Step 1: Political roll ────────────────────────────────────────────────
  const politRoll     = d20();
  const politDM       = politTrack + snDMValues.political_dm + ssPolitDM;
  const politAdjusted = politRoll + politDM;
  const politOutcome  = lookupPoliticalOutcome(politAdjusted);
  const newPolitTrack = Math.max(-3, Math.min(3, politTrack + politOutcome.track_movement));

  db.prepare('UPDATE colonies SET political_track = ? WHERE id = ?')
    .run(newPolitTrack, id);

  // ── Step 2: Output rolls ──────────────────────────────────────────────────
  // Political DM is sector-scoped by affected_sectors.
  let agPolitDM = 0, indPolitDM = 0, matPolitDM = 0;
  switch (politOutcome.affected_sectors) {
    case 'all':
      agPolitDM = indPolitDM = matPolitDM = politOutcome.output_dm; break;
    case 'mat_ind':
      indPolitDM = matPolitDM = politOutcome.output_dm; break;
    case 'one_random': {
      const idx = Math.floor(Math.random() * 3);
      if (idx === 0) agPolitDM = politOutcome.output_dm;
      else if (idx === 1) indPolitDM = politOutcome.output_dm;
      else matPolitDM = politOutcome.output_dm;
      break;
    }
    // 'none': all stay 0
  }

  const agRoll = d20();
  const agDM   = applyOutputDMs(-1, agPolitDM, snDMValues.output_dm, acclDM) + agBonus;
  const agAdj  = agRoll + agDM;
  const agMult = lookupOutputMultiplier(agAdj);

  const indRoll = d20();
  const indDM   = applyOutputDMs(-1, indPolitDM, snDMValues.output_dm, acclDM);
  const indAdj  = indRoll + indDM;
  const indMult = lookupOutputMultiplier(indAdj);

  const matRoll = d20();
  const matDM   = applyOutputDMs(-1, matPolitDM, snDMValues.output_dm, acclDM);
  const matAdj  = matRoll + matDM;
  const matMult = lookupOutputMultiplier(matAdj);

  // ── Build and persist TurnResolution ─────────────────────────────────────
  const resolution: TurnResolution = {
    colony_id: id,
    month: newMonth,
    weather: {
      roll: weatherRoll, dm: weatherDM,
      adjusted: weatherAdjusted, outcome: weatherOutcome,
      description: WEATHER_DESCRIPTION[weatherOutcome],
    },
    random_event: {
      trigger_roll: reTriggerRoll, triggered: reTriggerRoll >= 16,
      event_roll: reEventRoll, description: reDescription, effects: reEffects,
    },
    political: {
      roll: politRoll, dm: politDM, adjusted: politAdjusted,
      outcome: politOutcome.event_label,
      output_dm: politOutcome.output_dm,
      track_movement: politOutcome.track_movement,
      new_track: newPolitTrack,
    },
    output_rolls: {
      agriculture: { roll: agRoll, dm: agDM, adjusted: agAdj, multiplier: agMult },
      industry:    { roll: indRoll, dm: indDM, adjusted: indAdj, multiplier: indMult },
      materials:   { roll: matRoll, dm: matDM, adjusted: matAdj, multiplier: matMult },
    },
    active_event_dms: {},
  };

  db.prepare('UPDATE colonies SET active_turn_json = ? WHERE id = ?')
    .run(JSON.stringify(resolution), id);

  return c.json(resolution, 200);
});

export default turns;
