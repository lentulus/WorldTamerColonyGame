// Pure functions for colony founding calculations. No DB access.

// ── Weather factor (WTH Ch.4) ─────────────────────────────────────────────────
// Sum of three DMs: star spectral class, axial tilt band, hydrographics code.

export function computeWeatherFactor(
  starSpectral: string,
  axialTiltDeg: number,
  hydrographicsCode: number,
): number {
  let dm = 0;

  // Star spectral — only the first character matters
  switch (starSpectral.trim()[0].toUpperCase()) {
    case 'A': dm += 4; break;
    case 'F': dm += 2; break;
    case 'K': dm -= 1; break;
    case 'M': dm -= 2; break;
    // G and all others: 0
  }

  // Axial tilt
  if      (axialTiltDeg === 0)  dm -= 2;
  else if (axialTiltDeg <= 10)  dm -= 1;
  else if (axialTiltDeg <= 19)  { /* 0 */ }
  else if (axialTiltDeg <= 29)  dm += 1;
  else if (axialTiltDeg <= 44)  dm += 2;
  else                          dm += 4;  // >= 45°

  // Hydrographics
  if (hydrographicsCode >= 5) dm += 1;

  return dm;
}

// ── Growing season floor (from colony_export.py formula) ─────────────────────
// phi_min is the minimum seasonal multiplier on agricultural output.

export function computePhiMin(axialTiltDeg: number, tidallyLocked: boolean): number {
  if (tidallyLocked) return 0.25;
  const raw = 0.80 - (axialTiltDeg / 90) * 0.70;
  return Math.max(0.10, Math.min(0.90, raw));
}
