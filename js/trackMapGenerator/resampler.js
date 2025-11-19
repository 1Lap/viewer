/**
 * Resampler for calibration laps onto a common progress grid (0→1).
 *
 * This module handles the conversion of irregularly-sampled telemetry data
 * into a uniform progress-based grid, enabling direct comparison and averaging
 * across different calibration laps.
 */

/**
 * Get the planar Y coordinate (preferring Z if available, falling back to Y).
 * LMU uses Z as the vertical coordinate in its world space.
 *
 * @param {Object} sample - Telemetry sample
 * @returns {number|null} Planar Y coordinate
 */
function getPlanarY(sample) {
  return sample.z != null ? sample.z : sample.y;
}

/**
 * Calculate cumulative distance along the lap from sample distances.
 * Uses the actual distance values from telemetry rather than computing from X/Y.
 *
 * @param {Array<Object>} samples - Lap samples with distance field
 * @returns {Float64Array} Cumulative distances
 */
export function calculateCumulativeDistance(samples) {
  const cumulative = new Float64Array(samples.length);

  if (samples.length === 0) return cumulative;

  // First sample starts at its distance value
  cumulative[0] = samples[0].distance;

  // Each subsequent sample uses its distance value directly
  for (let i = 1; i < samples.length; i++) {
    cumulative[i] = samples[i].distance;
  }

  return cumulative;
}

/**
 * Normalize cumulative distances to progress values (0→1).
 *
 * @param {Float64Array} cumulativeDistance - Array of cumulative distances
 * @returns {Float64Array} Progress values (0→1)
 */
export function normalizeToProgress(cumulativeDistance) {
  const progress = new Float64Array(cumulativeDistance.length);

  if (cumulativeDistance.length === 0) return progress;

  const minDistance = cumulativeDistance[0];
  const maxDistance = cumulativeDistance[cumulativeDistance.length - 1];
  const span = maxDistance - minDistance;

  if (span === 0) {
    // All samples at same distance - shouldn't happen but handle gracefully
    progress.fill(0);
    return progress;
  }

  for (let i = 0; i < cumulativeDistance.length; i++) {
    progress[i] = (cumulativeDistance[i] - minDistance) / span;
  }

  return progress;
}

/**
 * Linear interpolation between two values.
 *
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0→1)
 * @returns {number} Interpolated value
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Find the index of the first element >= target using binary search.
 *
 * @param {Float64Array} arr - Sorted array
 * @param {number} target - Search target
 * @returns {number} Index of first element >= target, or arr.length if not found
 */
function binarySearchGE(arr, target) {
  let left = 0;
  let right = arr.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] < target) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left;
}

/**
 * Resample lap samples onto a uniform progress grid using linear interpolation.
 *
 * @param {Array<Object>} samples - Lap samples with x, y/z, distance fields
 * @param {number} gridSize - Number of samples in output grid (e.g., 1024)
 * @returns {Array<{progress: number, x: number, y: number}>} Resampled grid
 */
export function resampleOnGrid(samples, gridSize) {
  // Filter to only samples with valid spatial coordinates
  const validSamples = samples.filter((s) => s.x != null && getPlanarY(s) != null);

  if (validSamples.length < 2) {
    throw new Error(
      `Insufficient spatial data for resampling: only ${validSamples.length} valid samples found. Need at least 2.`
    );
  }

  // Calculate cumulative distance and normalize to progress
  const cumulative = calculateCumulativeDistance(validSamples);
  const progress = normalizeToProgress(cumulative);

  // Create uniform progress grid
  const grid = [];

  for (let i = 0; i < gridSize; i++) {
    const targetProgress = i / (gridSize - 1); // 0 to 1 inclusive

    // Find the two samples that bracket this progress value
    const rightIdx = binarySearchGE(progress, targetProgress);

    let x, y;

    if (rightIdx === 0) {
      // Before first sample - use first sample
      x = validSamples[0].x;
      y = getPlanarY(validSamples[0]);
    } else if (rightIdx >= progress.length) {
      // After last sample - use last sample
      const last = validSamples.length - 1;
      x = validSamples[last].x;
      y = getPlanarY(validSamples[last]);
    } else {
      // Interpolate between samples
      const leftIdx = rightIdx - 1;
      const p0 = progress[leftIdx];
      const p1 = progress[rightIdx];

      // Calculate interpolation factor
      const span = p1 - p0;
      const t = span > 0 ? (targetProgress - p0) / span : 0;

      // Interpolate X and Y coordinates
      x = lerp(validSamples[leftIdx].x, validSamples[rightIdx].x, t);
      y = lerp(getPlanarY(validSamples[leftIdx]), getPlanarY(validSamples[rightIdx]), t);
    }

    grid.push({
      progress: targetProgress,
      x,
      y
    });
  }

  return grid;
}

/**
 * Resample multiple classified laps onto a common grid.
 *
 * @param {Array<{type: string, lap: Object}>} classifiedLaps - Array of classified calibration laps
 * @param {Object} options
 * @param {number} [options.sampleCount] - Explicit grid size override
 * @param {number} [options.spacingMeters=0.5] - Target spacing when sampleCount omitted
 * @param {boolean} [options.alignHeading=true] - Align headings before averaging
 * @returns {{grids:Object, rawSamples:Object, metadata:Object}}
 */
export function resampleCalibrationLaps(classifiedLaps, options = {}) {
  const { sampleCount: explicitSampleCount, spacingMeters = 0.5, alignHeading = true } = options;

  const lapLengths = [];
  for (const { lap } of classifiedLaps) {
    const validSamples = lap.samples.filter((s) => s.x != null && getPlanarY(s) != null);
    if (validSamples.length < 2) continue;
    const cumulative = calculateCumulativeDistance(validSamples);
    const length = cumulative[cumulative.length - 1] - cumulative[0];
    if (Number.isFinite(length) && length > 0) {
      lapLengths.push(length);
    }
  }

  const averageLength = lapLengths.length
    ? lapLengths.reduce((sum, len) => sum + len, 0) / lapLengths.length
    : null;
  const resolvedSampleCount = explicitSampleCount
    ? explicitSampleCount
    : Math.max(200, Math.round((averageLength || 0) / Math.max(spacingMeters, 0.1))) || 1024;
  const gridSize = resolvedSampleCount;

  const grouped = {
    left: [],
    center: [],
    right: []
  };

  let referenceHeading = null;
  let headingOffsets = {};

  for (const { type, lap, filename } of classifiedLaps) {
    if (!grouped[type]) grouped[type] = [];
    const grid = resampleOnGrid(lap.samples, gridSize);
    if (alignHeading) {
      const headings = computeHeadings(grid);
      if (!referenceHeading) {
        referenceHeading = headings;
        headingOffsets[filename || type] = 0;
        grouped[type].push(grid);
      } else {
        const deltas = headings.map((angle, idx) => wrapAngle(angle - referenceHeading[idx]));
        const normalizedDelta = medianAngle(deltas.filter((value) => Number.isFinite(value)));
        headingOffsets[filename || type] = normalizedDelta;
        if (Number.isFinite(normalizedDelta) && Math.abs(normalizedDelta) > 1e-4) {
          grouped[type].push(rotateGrid(grid, -normalizedDelta));
        } else {
          grouped[type].push(grid);
        }
      }
    } else {
      grouped[type].push(grid);
    }
  }

  function averageGrid(gridList, label) {
    if (!gridList.length) return null;
    const length = gridList[0].length;
    for (const grid of gridList) {
      if (grid.length !== length) {
        throw new Error(
          `Grid size mismatch for ${label}: expected ${length} samples, got ${grid.length}.`
        );
      }
    }
    if (gridList.length === 1) {
      return gridList[0];
    }
    const averaged = new Array(length);
    for (let i = 0; i < length; i++) {
      let sumX = 0;
      let sumY = 0;
      let progress = gridList[0][i].progress;
      for (const grid of gridList) {
        sumX += grid[i].x;
        sumY += grid[i].y;
      }
      averaged[i] = {
        progress,
        x: sumX / gridList.length,
        y: sumY / gridList.length
      };
    }
    return averaged;
  }

  const leftGrid = averageGrid(grouped.left, 'left');
  const rightGrid = averageGrid(grouped.right, 'right');
  if (!leftGrid && !rightGrid) {
    throw new Error('At least one left or right calibration lap is required.');
  }

  return {
    grids: {
      left: leftGrid,
      right: rightGrid,
      center: grouped.center.length ? averageGrid(grouped.center, 'center') : null
    },
    rawSamples: grouped,
    metadata: {
      trackLength: averageLength,
      sampleCount: gridSize,
      spacingMeters: averageLength && gridSize > 1 ? averageLength / (gridSize - 1) : spacingMeters,
      headingOffsets
    }
  };
}

function computeHeadings(grid) {
  const n = grid.length;
  const headings = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const prev = grid[(i - 1 + n) % n];
    const next = grid[(i + 1) % n];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    headings[i] = Math.atan2(dy, dx);
  }
  return headings;
}

function wrapAngle(angle) {
  let result = angle;
  while (result <= -Math.PI) result += Math.PI * 2;
  while (result > Math.PI) result -= Math.PI * 2;
  return result;
}

function medianAngle(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function rotateGrid(grid, angle) {
  if (!Number.isFinite(angle) || Math.abs(angle) < 1e-6) return grid;
  let cx = 0;
  let cy = 0;
  for (const point of grid) {
    cx += point.x;
    cy += point.y;
  }
  cx /= grid.length;
  cy /= grid.length;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return grid.map((point) => {
    const dx = point.x - cx;
    const dy = point.y - cy;
    return {
      ...point,
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos
    };
  });
}
