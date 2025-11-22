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
