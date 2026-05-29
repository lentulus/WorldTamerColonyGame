// Pure infrastructure functions. No DB access.
import type { TransportLine } from '@worldtamer/shared';

// Cost in Cr/km from ref_transport_tl (cost_mcr_per_km × 1 000 000), keyed by TL.
const ROAD_COST_CR_PER_KM: Record<number, number> = {
  0:   500, 1:  1_000, 2:  1_500, 3:  3_000,
  4: 4_000, 5:  5_000, 6:  6_000, 7:  8_000,
  8: 10_000,
};

// ── computeRoadNetworkStatus ──────────────────────────────────────────────────
// inhabited_km2 → hexes (1 hex = 1000 km², rounded up) → 500 km/hex.
// required_cr = required_km × cost_cr_per_km (from TL table).
// complete when spent_cr ≥ required_cr, or when there is no inhabited area.

export function computeRoadNetworkStatus(
  inhabited_km2: number,
  construction_credits_spent: number,
  tl: number,
): { required_cr: number; spent_cr: number; complete: boolean } {
  const hexes       = inhabited_km2 > 0 ? Math.ceil(inhabited_km2 / 1000) : 0;
  const required_km = hexes * 500;
  const cost_cr_per_km = ROAD_COST_CR_PER_KM[tl] ?? 10_000;
  const required_cr = required_km * cost_cr_per_km;
  const spent_cr    = construction_credits_spent;
  const complete    = required_cr === 0 || spent_cr >= required_cr;
  return { required_cr, spent_cr, complete };
}

// ── computeTransportCapacity ──────────────────────────────────────────────────
// Total capacity = sum of each installed line's capacity_mt_per_month.
// Unit: million-tonne-km/month.

export function computeTransportCapacity(installed_lines: TransportLine[]): number {
  return installed_lines.reduce((sum, line) => sum + line.capacity_mt_per_month, 0);
}

// ── computeTransportDemand ────────────────────────────────────────────────────
// Demand driven by raw materials freight and labour supply loads.
// Unit: million-tonne-km/month.

export function computeTransportDemand(raw_materials_t: number, total_laborers: number): number {
  return raw_materials_t / 1000 + total_laborers / 500;
}
