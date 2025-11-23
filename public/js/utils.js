/** @typedef {import('./parser.js').LapSample} LapSample */
/** @typedef {import('./parser.js').Lap} Lap */

/**
 * Binary-search lookup for the sample nearest to the requested lap distance.
 * @param {LapSample[]} samples
 * @param {number|null} target
 * @returns {LapSample|null}
 */
export function findSampleAtDistance(samples, target) {
  if (!samples.length || target == null) return null;
  let left = 0;
  let right = samples.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const value = samples[mid].distance;
    if (value === target) return samples[mid];
    if (value < target) left = mid + 1;
    else right = mid - 1;
  }
  return samples[Math.max(0, Math.min(samples.length - 1, left))];
}

/**
 * Produce a concise label for UI legends (prefers driver + track).
 * @param {Lap} lap
 * @returns {string}
 */
export function formatLapLabel(lap) {
  return lap.metadata.driver && lap.metadata.driver !== '—'
    ? `${lap.metadata.driver} (${lap.metadata.track})`
    : lap.name;
}

/**
 * Linearly interpolate a numeric sample field at the requested distance.
 * @param {LapSample[]} samples
 * @param {number} distance
 * @param {keyof LapSample} field
 * @returns {number|null}
 */
export function interpolateLapValue(samples, distance, field) {
  if (!samples.length || distance == null) return null;
  if (distance <= samples[0].distance) {
    return samples[0][field] ?? null;
  }
  const last = samples[samples.length - 1];
  if (distance >= last.distance) {
    return last[field] ?? null;
  }

  let left = 0;
  let right = samples.length - 1;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (samples[mid].distance < distance) left = mid + 1;
    else right = mid;
  }
  const upper = left;
  const lower = Math.max(0, upper - 1);
  const lowerSample = samples[lower];
  const upperSample = samples[upper];
  if (!lowerSample || !upperSample) return null;
  const lowerValue = lowerSample[field];
  const upperValue = upperSample[field];
  if (lowerValue == null || upperValue == null) return null;
  const deltaDistance = upperSample.distance - lowerSample.distance;
  if (!deltaDistance) return lowerValue;
  const ratio = (distance - lowerSample.distance) / deltaDistance;
  return lowerValue + (upperValue - lowerValue) * ratio;
}

/**
 * Remove consecutive duplicate y-values from chart data points.
 * Keeps first and last point of each constant segment to preserve visual appearance.
 * @param {Array<{x: number, y: number|null}>} data - Array of {x, y} points
 * @returns {Array<{x: number, y: number|null}>} Sparse array with duplicate runs reduced
 */
export function sparsenData(data) {
  if (!data || data.length <= 2) return data;

  const result = [data[0]];
  let runStart = 0;

  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];

    // Check if y value changed (treating null/undefined as distinct values)
    const yChanged = prev.y !== curr.y;

    if (yChanged) {
      // If we had a run of duplicates, keep the last point of that run
      if (i - 1 > runStart) {
        result.push(data[i - 1]);
      }
      // Start a new run
      runStart = i;
      result.push(curr);
    }
  }

  // Always include the last point if not already included
  const lastIdx = data.length - 1;
  if (result[result.length - 1] !== data[lastIdx]) {
    result.push(data[lastIdx]);
  }

  return result;
}
