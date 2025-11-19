import { savitzkyGolaySmooth } from './smoothing.js';

/**
 * Track width calculation from calibration laps.
 *
 * This module projects left and right edge points onto the centerline normals
 * to determine track half-widths at each sample point.
 */

/**
 * Dot product of two 2D vectors.
 *
 * @param {number} ax - First vector X
 * @param {number} ay - First vector Y
 * @param {number} bx - Second vector X
 * @param {number} by - Second vector Y
 * @returns {number} Dot product
 */
function dot(ax, ay, bx, by) {
  return ax * bx + ay * by;
}

/**
 * Calculate track widths by projecting edge laps onto centerline normals.
 *
 * For each point:
 * 1. Compute the vector from centerline to left/right edge
 * 2. Project this vector onto the normal to get the perpendicular distance
 * 3. This distance is the half-width on that side
 *
 * @param {Array<[number, number]>} centerline - Centerline coordinates
 * @param {Array<[number, number]>} normals - Normal vectors at each centerline point
 * @param {Object} grids - Resampled calibration grids
 * @param {Array<{x: number, y: number}>} grids.left - Left edge grid
 * @param {Array<{x: number, y: number}>} grids.right - Right edge grid
 * @returns {{halfWidthLeft: Float64Array, halfWidthRight: Float64Array}}
 */
export function calculateWidths(centerline, normals, grids) {
  const n = centerline.length;

  if (!grids.left || !grids.right) {
    throw new Error('Both left and right grids are required for width calculation.');
  }

  if (grids.left.length !== n || grids.right.length !== n) {
    throw new Error(
      `Grid size mismatch: centerline has ${n} points, ` +
        `left has ${grids.left.length}, right has ${grids.right.length}.`
    );
  }

  if (normals.length !== n) {
    throw new Error(`Normal count mismatch: expected ${n}, got ${normals.length}.`);
  }

  const halfWidthLeft = new Float64Array(n);
  const halfWidthRight = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const [cx, cy] = centerline[i];
    const [nx, ny] = normals[i];

    // Left edge point
    const leftX = grids.left[i].x;
    const leftY = grids.left[i].y;

    // Vector from center to left edge
    const leftDx = leftX - cx;
    const leftDy = leftY - cy;

    // Project onto normal (normal points left, so positive = left of center)
    const leftProjection = dot(leftDx, leftDy, nx, ny);
    halfWidthLeft[i] = leftProjection;

    // Right edge point
    const rightX = grids.right[i].x;
    const rightY = grids.right[i].y;

    // Vector from center to right edge
    const rightDx = rightX - cx;
    const rightDy = rightY - cy;

    // Project onto normal (normal points left, so negative = right of center)
    // We negate to get positive width value
    const rightProjection = dot(rightDx, rightDy, nx, ny);
    halfWidthRight[i] = -rightProjection;
  }

  return { halfWidthLeft, halfWidthRight };
}

export function symmetriseWidths(halfWidthLeft, halfWidthRight) {
  const n = halfWidthLeft.length;
  const symmetricLeft = new Float64Array(n);
  const symmetricRight = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const left = Math.max(0, halfWidthLeft[i]);
    const right = Math.max(0, halfWidthRight[i]);
    const symmetric = Math.min(left, right);
    symmetricLeft[i] = symmetric;
    symmetricRight[i] = symmetric;
  }

  return { halfWidthLeft: symmetricLeft, halfWidthRight: symmetricRight };
}

export function computeTargetWidth(halfWidthLeft, halfWidthRight) {
  const totals = [];
  for (let i = 0; i < halfWidthLeft.length; i++) {
    const total = halfWidthLeft[i] + halfWidthRight[i];
    if (Number.isFinite(total) && total > 0) totals.push(total);
  }
  if (!totals.length) return 0;
  totals.sort((a, b) => a - b);
  const mid = Math.floor(totals.length / 2);
  if (totals.length % 2 === 1) return totals[mid];
  return (totals[mid - 1] + totals[mid]) / 2;
}

export function buildConstantWidthEnvelope(
  halfWidthLeft,
  halfWidthRight,
  signedAngles,
  targetWidth
) {
  const n = halfWidthLeft.length;
  const resultLeft = new Float64Array(n);
  const resultRight = new Float64Array(n);
  let insideLeftCount = 0;
  let insideRightCount = 0;
  let lastInsideLeft = true;
  const minWidth = targetWidth > 0 ? targetWidth : 6;

  for (let i = 0; i < n; i++) {
    const angle = signedAngles ? signedAngles[i] : 0;
    let insideLeft;
    if (Math.abs(angle) < 1e-3) insideLeft = lastInsideLeft;
    else insideLeft = angle >= 0;
    lastInsideLeft = insideLeft;

    const insideHalf = Math.max(0, insideLeft ? halfWidthLeft[i] : halfWidthRight[i]);
    const desiredTotal = Math.max(minWidth, targetWidth * 0.95 || insideHalf * 2);
    let outsideHalf = desiredTotal - insideHalf;
    if (outsideHalf < insideHalf * 0.4) {
      outsideHalf = insideHalf * 0.4;
    }
    if (outsideHalf < 0.75) outsideHalf = 0.75;

    if (insideLeft) {
      resultLeft[i] = insideHalf;
      resultRight[i] = outsideHalf;
      insideLeftCount++;
    } else {
      resultRight[i] = insideHalf;
      resultLeft[i] = outsideHalf;
      insideRightCount++;
    }
  }

  return {
    halfWidthLeft: resultLeft,
    halfWidthRight: resultRight,
    stats: {
      targetWidth: minWidth,
      insideLeftCount,
      insideRightCount
    }
  };
}

/**
 * Detect and report outliers in width data.
 *
 * Outliers can indicate:
 * - Driver going off-track during calibration
 * - Data corruption
 * - Pit entry/exit (legitimate width changes)
 *
 * @param {Float64Array} halfWidthLeft - Left half-widths
 * @param {Float64Array} halfWidthRight - Right half-widths
 * @param {Object} [options] - Detection options
 * @param {number} [options.maxWidthChange=5] - Max allowed width change between points (meters)
 * @param {number} [options.minWidth=3] - Minimum plausible track width (meters)
 * @param {number} [options.maxWidth=20] - Maximum plausible track width (meters)
 * @returns {{outliers: Array<{index: number, reason: string}>, stats: Object}}
 */
export function detectWidthOutliers(
  halfWidthLeft,
  halfWidthRight,
  { maxWidthChange = 5, minWidth = 3, maxWidth = 20 } = {}
) {
  const outliers = [];
  const n = halfWidthLeft.length;

  // Statistics
  let sumLeft = 0;
  let sumRight = 0;
  let minLeft = Infinity;
  let maxLeft = -Infinity;
  let minRight = Infinity;
  let maxRight = -Infinity;

  for (let i = 0; i < n; i++) {
    const wl = halfWidthLeft[i];
    const wr = halfWidthRight[i];
    const totalWidth = wl + wr;

    sumLeft += wl;
    sumRight += wr;
    minLeft = Math.min(minLeft, wl);
    maxLeft = Math.max(maxLeft, wl);
    minRight = Math.min(minRight, wr);
    maxRight = Math.max(maxRight, wr);

    // Check for negative widths (edge on wrong side of centerline)
    if (wl < 0) {
      outliers.push({
        index: i,
        reason: `Negative left width: ${wl.toFixed(2)}m. Left edge is right of centerline.`
      });
    }

    if (wr < 0) {
      outliers.push({
        index: i,
        reason: `Negative right width: ${wr.toFixed(2)}m. Right edge is left of centerline.`
      });
    }

    // Check for implausible total width
    if (totalWidth < minWidth) {
      outliers.push({
        index: i,
        reason: `Total width too narrow: ${totalWidth.toFixed(2)}m (min: ${minWidth}m).`
      });
    }

    if (totalWidth > maxWidth) {
      outliers.push({
        index: i,
        reason: `Total width too wide: ${totalWidth.toFixed(2)}m (max: ${maxWidth}m).`
      });
    }

    // Check for sudden changes (discontinuities)
    if (i > 0) {
      const prevLeft = halfWidthLeft[i - 1];
      const prevRight = halfWidthRight[i - 1];
      const deltaLeft = Math.abs(wl - prevLeft);
      const deltaRight = Math.abs(wr - prevRight);

      if (deltaLeft > maxWidthChange) {
        outliers.push({
          index: i,
          reason: `Large left width change: ${deltaLeft.toFixed(2)}m from previous point.`
        });
      }

      if (deltaRight > maxWidthChange) {
        outliers.push({
          index: i,
          reason: `Large right width change: ${deltaRight.toFixed(2)}m from previous point.`
        });
      }
    }
  }

  const avgLeft = sumLeft / n;
  const avgRight = sumRight / n;

  return {
    outliers,
    stats: {
      avgLeft: avgLeft.toFixed(2),
      avgRight: avgRight.toFixed(2),
      avgTotal: (avgLeft + avgRight).toFixed(2),
      minLeft: minLeft.toFixed(2),
      maxLeft: maxLeft.toFixed(2),
      minRight: minRight.toFixed(2),
      maxRight: maxRight.toFixed(2)
    }
  };
}

export function savitzkyGolayWidthSmooth(
  halfWidthLeft,
  halfWidthRight,
  { windowSize = 9, order = 3, spacing = 1 } = {}
) {
  return {
    halfWidthLeft: savitzkyGolaySmooth(halfWidthLeft, windowSize, { order, spacing }),
    halfWidthRight: savitzkyGolaySmooth(halfWidthRight, windowSize, { order, spacing })
  };
}

export function clampWidthDeltas(
  halfWidthLeft,
  halfWidthRight,
  { spacingMeters = 1, maxDeltaPer10m = 0.25, sectorLength = 100 } = {}
) {
  const limitPerMeter = maxDeltaPer10m / 10;
  const perSampleLimit = limitPerMeter * Math.max(spacingMeters, 1e-3);
  const leftClamp = applySlopeClamp(halfWidthLeft, perSampleLimit);
  const rightClamp = applySlopeClamp(halfWidthRight, perSampleLimit);

  return {
    halfWidthLeft: leftClamp.values,
    halfWidthRight: rightClamp.values,
    diagnostics: {
      perSampleLimit,
      maxDeltaPer10m,
      leftClamped: leftClamp.clampedCount,
      rightClamped: rightClamp.clampedCount,
      leftSectors: summariseClampBySector(leftClamp.flags, spacingMeters, sectorLength),
      rightSectors: summariseClampBySector(rightClamp.flags, spacingMeters, sectorLength)
    }
  };
}

function applySlopeClamp(values, perSampleLimit) {
  const n = values.length;
  const result = new Float64Array(values);
  const flags = new Array(n).fill(false);
  let changed = true;
  let iterations = 0;
  while (changed && iterations < n * 2) {
    changed = false;
    iterations += 1;
    for (let i = 0; i < n; i++) {
      const prevIndex = (i - 1 + n) % n;
      const prevValue = result[prevIndex];
      let current = result[i];
      const delta = current - prevValue;
      if (delta > perSampleLimit) {
        current = prevValue + perSampleLimit;
        result[i] = current;
        flags[i] = true;
        changed = true;
      } else if (delta < -perSampleLimit) {
        current = prevValue - perSampleLimit;
        result[i] = current;
        flags[i] = true;
        changed = true;
      }
    }
  }
  const clampedCount = flags.filter(Boolean).length;
  return { values: result, flags, clampedCount };
}

function summariseClampBySector(flags, spacingMeters, sectorLength) {
  if (!flags.length) return [];
  const samplesPerSector = Math.max(1, Math.round(sectorLength / Math.max(spacingMeters, 1e-3)));
  const sectorCount = Math.ceil(flags.length / samplesPerSector);
  const summary = [];
  for (let sector = 0; sector < sectorCount; sector++) {
    const start = sector * samplesPerSector;
    const end = Math.min(flags.length, start + samplesPerSector);
    let clamped = 0;
    for (let idx = start; idx < end; idx++) {
      if (flags[idx]) clamped++;
    }
    summary.push({
      sector,
      samples: end - start,
      clamped,
      ratio: (end - start) > 0 ? clamped / (end - start) : 0
    });
  }
  return summary;
}

/**
 * Clamp width values to reasonable bounds.
 *
 * This can be used to handle minor outliers by clamping them to plausible values.
 * For serious outliers, interpolation (in smoothing.js) is more appropriate.
 *
 * @param {Float64Array} halfWidthLeft - Left half-widths
 * @param {Float64Array} halfWidthRight - Right half-widths
 * @param {Object} [options] - Clamping options
 * @param {number} [options.minHalfWidth=2] - Minimum half-width (meters)
 * @param {number} [options.maxHalfWidth=15] - Maximum half-width (meters)
 * @returns {{halfWidthLeft: Float64Array, halfWidthRight: Float64Array}}
 */
export function clampWidths(
  halfWidthLeft,
  halfWidthRight,
  { minHalfWidth = 2, maxHalfWidth = 15 } = {}
) {
  const n = halfWidthLeft.length;
  const clampedLeft = new Float64Array(n);
  const clampedRight = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    clampedLeft[i] = Math.max(minHalfWidth, Math.min(maxHalfWidth, halfWidthLeft[i]));
    clampedRight[i] = Math.max(minHalfWidth, Math.min(maxHalfWidth, halfWidthRight[i]));
  }

  return {
    halfWidthLeft: clampedLeft,
    halfWidthRight: clampedRight
  };
}
