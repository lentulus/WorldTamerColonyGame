import { describe, it, expect } from 'vitest';
import { REF } from './ref_data.js';

describe('REF.outputRoll', () => {
  it('entry covering roll 1 has multiplier 0.80', () => {
    const row = REF.outputRoll.find(r => r.roll_lo <= 1 && r.roll_hi >= 1);
    expect(row?.multiplier).toBe(0.80);
  });
  it('entry covering roll 20 has multiplier 1.20', () => {
    const row = REF.outputRoll.find(r => r.roll_lo <= 20 && r.roll_hi >= 20);
    expect(row?.multiplier).toBe(1.20);
  });
  it('entry covering roll 8 has multiplier 1.00 (neutral)', () => {
    const row = REF.outputRoll.find(r => r.roll_lo <= 8 && r.roll_hi >= 8);
    expect(row?.multiplier).toBe(1.00);
  });
  it('has 9 bands', () => {
    expect(REF.outputRoll).toHaveLength(9);
  });
});

describe('REF.weather', () => {
  it('adjusted roll ≤ 14 → none', () => {
    const row = REF.weather.find(r => r.roll_lo <= 10 && r.roll_hi >= 10);
    expect(row?.outcome).toBe('none');
  });
  it('adjusted roll 15 → drought', () => {
    const row = REF.weather.find(r => r.roll_lo <= 15 && r.roll_hi >= 15);
    expect(row?.outcome).toBe('drought');
  });
  it('adjusted roll 18 → severe_storm', () => {
    const row = REF.weather.find(r => r.roll_lo <= 18 && r.roll_hi >= 18);
    expect(row?.outcome).toBe('severe_storm');
  });
  it('adjusted roll 20 → catastrophic_storm', () => {
    const row = REF.weather.find(r => r.roll_lo <= 20 && r.roll_hi >= 20);
    expect(row?.outcome).toBe('catastrophic_storm');
  });
});

describe('REF.political', () => {
  it('high adjusted roll (25) → Excellent with +2 track movement', () => {
    const row = REF.political.find(r => r.roll_lo <= 25 && r.roll_hi >= 25);
    expect(row?.event_label).toBe('Excellent');
    expect(row?.track_movement).toBe(2);
  });
  it('neutral adjusted roll (10) → No Effect', () => {
    const row = REF.political.find(r => r.roll_lo <= 10 && r.roll_hi >= 10);
    expect(row?.event_label).toBe('No Effect');
    expect(row?.output_dm).toBe(0);
    expect(row?.track_movement).toBe(0);
  });
  it('very low adjusted roll (-10) → Coup Attempt with -5 output DM', () => {
    const row = REF.political.find(r => r.roll_lo <= -10 && r.roll_hi >= -10);
    expect(row?.event_label).toBe('Coup Attempt');
    expect(row?.output_dm).toBe(-5);
    expect(row?.track_movement).toBe(-2);
  });
  it('has 15 bands', () => {
    expect(REF.political).toHaveLength(15);
  });
});

describe('REF.sn', () => {
  it('SN = 1.0 → output_dm = 0, political_dm = 0', () => {
    const row = REF.sn.find(r => r.sn_lo <= 1.0 && r.sn_hi >= 1.0);
    expect(row?.output_dm).toBe(0);
    expect(row?.political_dm).toBe(0);
  });
  it('SN = 0.5 (famine band) → output_dm = -8', () => {
    const row = REF.sn.find(r => r.sn_lo <= 0.5 && r.sn_hi >= 0.5);
    expect(row?.output_dm).toBe(-8);
  });
  it('SN = 0.9 (marginal) → output_dm = -1', () => {
    const row = REF.sn.find(r => r.sn_lo <= 0.9 && r.sn_hi >= 0.9);
    expect(row?.output_dm).toBe(-1);
  });
  it('has 12 bands', () => {
    expect(REF.sn).toHaveLength(12);
  });
});

describe('REF.ss', () => {
  it('SS = 100 m³/lab → political_dm = 0 (neutral band 81–120)', () => {
    const row = REF.ss.find(r => r.ss_lo <= 100 && r.ss_hi >= 100);
    expect(row?.political_dm).toBe(0);
  });
  it('SS = 20 m³/lab → political_dm = -3 (severe overcrowding)', () => {
    const row = REF.ss.find(r => r.ss_lo <= 20 && r.ss_hi >= 20);
    expect(row?.political_dm).toBe(-3);
  });
});

describe('REF.slStart', () => {
  it('home TL 8 → value_cr = 250', () => {
    const row = REF.slStart.find(r => r.tl_lo <= 8 && r.tl_hi >= 8);
    expect(row?.value_cr).toBe(250);
  });
  it('home TL 0 → value_cr = 5', () => {
    const row = REF.slStart.find(r => r.tl_lo <= 0 && r.tl_hi >= 0);
    expect(row?.value_cr).toBe(5);
  });
});

describe('REF.agriculture', () => {
  it('TL 8 → base_output_rations = 27', () => {
    expect(REF.agriculture.find(r => r.tl === 8)?.base_output_rations).toBe(27);
  });
  it('TL 8 → rm_t_per_month = 8', () => {
    expect(REF.agriculture.find(r => r.tl === 8)?.rm_t_per_month).toBe(8);
  });
  it('has 16 TL entries (0–15)', () => {
    expect(REF.agriculture).toHaveLength(16);
  });
});

describe('REF.industry', () => {
  it('TL 8 → output_cr_per_il_month = 1500', () => {
    expect(REF.industry.find(r => r.tl === 8)?.output_cr_per_il_month).toBe(1500);
  });
  it('TL 8 → kw_per_unit = 1.2', () => {
    expect(REF.industry.find(r => r.tl === 8)?.kw_per_unit).toBe(1.2);
  });
});

describe('REF.materials', () => {
  it('TL 8 → base_output_t_per_month = 450', () => {
    expect(REF.materials.find(r => r.tl === 8)?.base_output_t_per_month).toBe(450);
  });
});

describe('REF.randomEvents', () => {
  it('has 20 events (rolls 1–20)', () => {
    expect(REF.randomEvents).toHaveLength(20);
  });
  it('roll 1 is Severe Plague with duration 3', () => {
    const ev = REF.randomEvents.find(r => r.roll === 1);
    expect(ev?.event_label).toBe('Severe Plague');
    expect(ev?.duration_months).toBe(3);
  });
  it('roll 17 is Tasty Local Lifeform with permanent_ag_roll_bonus in effects', () => {
    const ev = REF.randomEvents.find(r => r.roll === 17);
    expect(ev?.event_label).toContain('Tasty');
    const fx = JSON.parse(ev!.effects);
    expect(fx.permanent_ag_roll_bonus).toBe(1);
  });
  it('roll 9 (Vermin Minor) has rations_lost_fraction = 0.25 in effects', () => {
    const ev = REF.randomEvents.find(r => r.roll === 9);
    const fx = JSON.parse(ev!.effects);
    expect(fx.rations_lost_fraction).toBe(0.25);
  });
});
