// Pure functions for colony maintenance and infrastructure. No DB access.

// ── Maintenance cost (WTH Ch.5) ───────────────────────────────────────────────
// Monthly percentage of capital value, keyed on colony age in months.
// capitalType is carried through for future differentiation; all types share
// the same schedule currently.

export function computeMaintenanceCost(
  colonyAgeMonths: number,
  capitalValue: number,
  _capitalType: string,
): number {
  let rate: number;
  if      (colonyAgeMonths < 120) rate = 0.000;
  else if (colonyAgeMonths < 132) rate = 0.001;
  else if (colonyAgeMonths < 144) rate = 0.002;
  else if (colonyAgeMonths < 156) rate = 0.003;
  else                             rate = 0.004;
  return capitalValue * rate;
}

// ── Infrastructure efficiency (WTH Ch.5) ──────────────────────────────────────
// 0.60 until the road network is complete; 1.0 once complete.
// Applied to all non-construction output each turn.

export function computeInfrastructureEfficiency(roadsComplete: boolean): number {
  return roadsComplete ? 1.0 : 0.60;
}

// ── Road length requirement (WTH Ch.5) ───────────────────────────────────────
// Total km of road needed = inhabited hexes × 500 km.
// Credit cost = km × ref_transport_tl.cost_mcr_per_km (caller's responsibility).

export function computeRoadRequirement(inhabited_hex_count: number): number {
  return inhabited_hex_count * 500;
}
