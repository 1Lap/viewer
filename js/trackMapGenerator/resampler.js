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
 * @param {number} gridSize - Number of samples in output grid
 * @returns {Object} Map of lap types to resampled grids
 */
export function resampleCalibrationLaps(classifiedLaps, gridSize) {
  const grids = {};

  for (const { type, lap } of classifiedLaps) {
    grids[type] = resampleOnGrid(lap.samples, gridSize);
  }

  return grids;
}
