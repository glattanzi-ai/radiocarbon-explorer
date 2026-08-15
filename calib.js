/* calib.js — Radiocarbon calibration math engine.
 * Implements the standard probabilistic calibration method used by
 * CALIB / OxCal: convolve the lab-measured Gaussian likelihood with the
 * calibration-curve uncertainty at every calendar year, normalize to a
 * proper density, then derive Highest Posterior Density (HPD) ranges.
 *
 * Reference: Bronk Ramsey, C. (2009) "Bayesian analysis of radiocarbon
 * dates." Radiocarbon 51(1), 337-360.  Stuiver, M. & Reimer, P.J. (1993)
 * "Extended 14C data base and revised CALIB radiocarbon calibration
 * program." Radiocarbon 35, 215-230.
 */

const Calib = (() => {
  /** Binary-search linear interpolation of [calBP, age, sigma] rows. */
  function interpAt(curve, t) {
    const n = curve.length;
    if (t <= curve[0][0]) return { age: curve[0][1], sigma: curve[0][2] };
    if (t >= curve[n - 1][0]) return { age: curve[n - 1][1], sigma: curve[n - 1][2] };
    let lo = 0,
      hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (curve[mid][0] <= t) lo = mid;
      else hi = mid;
    }
    const [t0, a0, s0] = curve[lo];
    const [t1, a1, s1] = curve[hi];
    const f = (t - t0) / (t1 - t0);
    return { age: a0 + f * (a1 - a0), sigma: s0 + f * (s1 - s0) };
  }

  /** Unnormalized Gaussian likelihood density at calendar year t. */
  function densityAt(curve, t, bp, err, deltaR, deltaRErr) {
    const { age, sigma } = interpAt(curve, t);
    const adjAge = age + deltaR;
    const variance = err * err + sigma * sigma + deltaRErr * deltaRErr;
    const diff = bp - adjAge;
    return Math.exp(-(diff * diff) / (2 * variance)) / Math.sqrt(2 * Math.PI * variance);
  }

  /**
   * Compute the full calibrated probability distribution for one date.
   * Two-pass approach: coarse scan on the curve's native grid to locate
   * the non-negligible window, then a fine uniform re-sample for accurate
   * HPD extraction (mirrors how CALIB/OxCal resample onto an internal grid).
   */
  function calibrate({ bp, err, curve, deltaR = 0, deltaRErr = 0, resolution = 1200 }) {
    const domainMin = curve[0][0];
    const domainMax = curve[curve.length - 1][0];

    // Pass 1: coarse scan on native grid
    let maxDensity = 0;
    const coarse = new Array(curve.length);
    for (let i = 0; i < curve.length; i++) {
      const t = curve[i][0];
      const d = densityAt(curve, t, bp, err, deltaR, deltaRErr);
      coarse[i] = d;
      if (d > maxDensity) maxDensity = d;
    }
    if (maxDensity <= 0 || !isFinite(maxDensity)) {
      return { grid: [], density: [], ranges1: [], ranges2: [], median: null, outOfRange: true };
    }
    const threshold = maxDensity * 1e-5;
    let firstIdx = -1,
      lastIdx = -1;
    for (let i = 0; i < coarse.length; i++) {
      if (coarse[i] >= threshold) {
        if (firstIdx === -1) firstIdx = i;
        lastIdx = i;
      }
    }
    if (firstIdx === -1) {
      return { grid: [], density: [], ranges1: [], ranges2: [], median: null, outOfRange: true };
    }
    // pad window by 8% of its width on each side (captures tails / wiggle plateaus)
    const rawMin = curve[firstIdx][0];
    const rawMax = curve[lastIdx][0];
    const pad = Math.max(20, (rawMax - rawMin) * 0.08);
    const tMin = Math.max(domainMin, rawMin - pad);
    const tMax = Math.min(domainMax, rawMax + pad);

    // Pass 2: fine uniform grid
    const n = Math.max(200, Math.min(resolution, Math.round(tMax - tMin) || resolution));
    const dt = (tMax - tMin) / (n - 1);
    const grid = new Array(n);
    const density = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = tMin + i * dt;
      grid[i] = t;
      density[i] = densityAt(curve, t, bp, err, deltaR, deltaRErr);
    }
    // Normalize via trapezoidal integration so sum(density*dt) ≈ 1
    let area = 0;
    for (let i = 0; i < n - 1; i++) area += ((density[i] + density[i + 1]) / 2) * dt;
    if (area > 0) {
      for (let i = 0; i < n; i++) density[i] /= area;
    }

    const ranges1 = hpdRanges(grid, density, dt, 0.6827);
    const ranges2 = hpdRanges(grid, density, dt, 0.9545);
    const median = weightedMedian(grid, density, dt);

    return { grid, density, ranges1, ranges2, median, outOfRange: false };
  }

  /** Highest Posterior Density ranges at a given confidence level. */
  function hpdRanges(grid, density, dt, level) {
    const n = grid.length;
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => density[b] - density[a]);
    let cum = 0;
    let thresholdDensity = 0;
    for (const idx of order) {
      cum += density[idx] * dt;
      thresholdDensity = density[idx];
      if (cum >= level) break;
    }
    const segments = [];
    let start = null;
    for (let i = 0; i < n; i++) {
      if (density[i] >= thresholdDensity) {
        if (start === null) start = i;
      } else if (start !== null) {
        segments.push([start, i - 1]);
        start = null;
      }
    }
    if (start !== null) segments.push([start, n - 1]);

    return segments.map(([s, e]) => {
      let prob = 0;
      for (let i = s; i < e; i++) prob += ((density[i] + density[i + 1]) / 2) * dt;
      return { startBP: grid[e], endBP: grid[s], prob };
    });
  }

  function weightedMedian(grid, density, dt) {
    const n = grid.length;
    let cum = 0;
    const target = 0.5;
    for (let i = 0; i < n - 1; i++) {
      const seg = ((density[i] + density[i + 1]) / 2) * dt;
      if (cum + seg >= target) {
        const f = seg > 0 ? (target - cum) / seg : 0;
        return grid[i] + f * (grid[i + 1] - grid[i]);
      }
      cum += seg;
    }
    return grid[n - 1];
  }

  /** Convert a cal BP value (1950 epoch) to a {year, era} calendar label. */
  function calBPtoCalendar(calBP) {
    const astronomicalYear = 1950 - calBP;
    if (astronomicalYear > 0) return { year: Math.round(astronomicalYear), era: 'AD' };
    return { year: Math.round(1 - astronomicalYear), era: 'BC' };
  }

  function formatCalendar(calBP) {
    const { year, era } = calBPtoCalendar(calBP);
    return `${year.toLocaleString()} ${era}`;
  }

  function formatRangeBPCal(range) {
    return `${Math.round(range.startBP).toLocaleString()}–${Math.round(range.endBP).toLocaleString()} cal BP`;
  }

  function formatRangeCalendar(range) {
    const a = calBPtoCalendar(range.startBP);
    const b = calBPtoCalendar(range.endBP);
    if (a.era === b.era) {
      return `${a.year.toLocaleString()}–${b.year.toLocaleString()} ${b.era}`;
    }
    return `${a.year.toLocaleString()} ${a.era}–${b.year.toLocaleString()} ${b.era}`;
  }

  return {
    interpAt,
    densityAt,
    calibrate,
    hpdRanges,
    calBPtoCalendar,
    formatCalendar,
    formatRangeBPCal,
    formatRangeCalendar,
  };
})();
