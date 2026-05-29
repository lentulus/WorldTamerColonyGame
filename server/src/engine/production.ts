// Pure functions for colony production calculations. No DB access.

// ── Labor-capital matching factor (WTH Ch.5) ──────────────────────────────────
// Each unit of capital supports up to 1.5× workers before becoming a bottleneck.
// Each worker can utilise up to 1.25× their capital share before it goes idle.

export function computeM(labor: number, capital: number): number {
  if (labor > capital) {
    return Math.min(labor, capital * 1.5);
  } else {
    return Math.min(capital, labor * 1.25);
  }
}

// ── Seasonal growing factor (WTH Ch.5) ───────────────────────────────────────
// φ(t) = phiMin + (1 − phiMin) × 0.5 × (1 + sin(2π(t − orbitMonths/4) / orbitMonths))
// Trough at t = 0, peak at t = orbitMonths/2.

export function computePhiT(t: number, orbitMonths: number, phiMin: number): number {
  const arg = (2 * Math.PI * (t - orbitMonths / 4)) / orbitMonths;
  return phiMin + (1 - phiMin) * 0.5 * (1 + Math.sin(arg));
}

// ── Agricultural output (WTH Ch.5) ───────────────────────────────────────────
// Q_A = M_A × q_A × R_A × phi × eta × powerFactor
// All six factors multiply together; any zero collapses the result to zero.

export function computeQA(
  M_A: number,
  q_A: number,
  R_A: number,
  phi: number,
  eta: number,
  powerFactor: number,
): number {
  return M_A * q_A * R_A * phi * eta * powerFactor;
}

// ── Raw materials output (WTH Ch.5) ──────────────────────────────────────────
// Q_M = M_M × q_M × richness_modifier × eta × powerFactor
// richness_modifier = 2^(rvm/3)  (rvm 0→×1, +3→×2, −3→×0.5)

export function computeQM(
  M_M: number,
  q_M: number,
  rvm: number,
  eta: number,
  powerFactor: number,
): number {
  return M_M * q_M * Math.pow(2, rvm / 3) * eta * powerFactor;
}

// ── Power adequacy factor (WTH Ch.5) ─────────────────────────────────────────
// powerFactor = min(1, available_kw / required_kw)
// Required KW = industrial capital × kw/unit + materials capital × kw/unit.
// Agriculture has no power draw in the WTH reference tables.

export function computePowerFactor(
  powerKw: number,
  icTotal: number,
  mc: number,
  industryKwPerUnit: number,
  materialsKwPerUnit: number,
): number {
  const required = icTotal * industryKwPerUnit + mc * materialsKwPerUnit;
  if (required === 0) return 1.0;
  return Math.min(1.0, powerKw / required);
}

// ── Industrial output (WTH Ch.5) ─────────────────────────────────────────────
// Q_I = M_I × q_I × eta × powerFactor
// No seasonal or R_A factor — materials supply is player-allocated separately.

export function computeQI(
  M_I: number,
  q_I: number,
  eta: number,
  powerFactor: number,
): number {
  return M_I * q_I * eta * powerFactor;
}

// ── Standard of Shelter (WTH Ch.5) ───────────────────────────────────────────
// SS = housing_m3 / totalLaborers (raw m³ per laborer family unit).
// Looked up in ref_ss_table by the caller.

export function computeSS(housing_m3: number, totalLaborers: number): number {
  if (totalLaborers === 0) return 0;
  return housing_m3 / totalLaborers;
}

// ── SL decay (WTH Ch.5) ──────────────────────────────────────────────────────
// Consumer goods depreciate 2% each month.

export function computeSLDecay(prev_sl_value: number): number {
  return prev_sl_value * 0.98;
}

// ── SL replenishment (WTH Ch.5) ──────────────────────────────────────────────
// Credits spent on consumer goods → additional SL value per person.

export function computeSLReplenishment(
  consumer_goods_credits: number,
  totalPeople: number,
): number {
  if (totalPeople === 0) return 0;
  return consumer_goods_credits / totalPeople;
}

// ── SL satisfaction index (WTH Ch.5) ─────────────────────────────────────────
// DM = f(sl_value / baseline_sl_value).
// Bands: ≥1.20→+2, [1.05,1.20)→+1, [0.95,1.05)→0,
//        [0.75,0.95)→−1, [0.50,0.75)→−2, <0.50→−3

export function computeSLIndex(sl_value: number, baseline_sl_value: number): number {
  if (baseline_sl_value === 0) return 0;
  const ratio = sl_value / baseline_sl_value;
  if (ratio >= 1.20) return  2;
  if (ratio >= 1.05) return  1;
  if (ratio >= 0.95) return  0;
  if (ratio >= 0.75) return -1;
  if (ratio >= 0.50) return -2;
  return -3;
}

// ── Standard of Nutrition (WTH Ch.5) ─────────────────────────────────────────
// SN = rations allocated to population / total laborers.
// SN = 1.0 when each laborer family receives exactly one ration.

export function computeSN(rationsToPop: number, totalLaborers: number): number {
  if (totalLaborers === 0) return 0;
  return rationsToPop / totalLaborers;
}
