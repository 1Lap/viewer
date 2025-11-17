/**
 * Generate a canonical signature for a lap using its metadata and sample stats.
 * @param {Object} params
 * @param {string} [params.name]
 * @param {string} [params.track]
 * @param {string} [params.car]
 * @param {string} [params.driver]
 * @param {number|null} [params.lapTime]
 * @param {number|null} [params.lapLength]
 * @param {number} [params.sampleCount]
 * @returns {string}
 */
/** @typedef {import('./parser.js').Lap} Lap */

export function createLapSignature({ name, track, car, driver, lapTime, lapLength, sampleCount }) {
  const safe = (value, fallback = 'unknown') =>
    value == null || value === '' ? fallback : String(value).toLowerCase();
  const timePart =
    typeof lapTime === 'number' && Number.isFinite(lapTime) ? lapTime.toFixed(3) : 'na';
  const lengthPart =
    typeof lapLength === 'number' && Number.isFinite(lapLength) ? lapLength.toFixed(2) : 'na';
  const countPart = Number.isFinite(sampleCount) ? sampleCount : '0';
  return [
    safe(name, 'file'),
    safe(track, 'track'),
    safe(car, 'car'),
    safe(driver, 'driver'),
    timePart,
    lengthPart,
    countPart
  ].join('|');
}

/**
 * Ensure a lap object contains a signature using its metadata and samples as fallback.
 * @param {import('./parser.js').Lap} lap
 * @returns {string|null}
 */
export function ensureLapSignature(lap) {
  if (!lap) return null;
  if (lap.signature) return lap.signature;
  const metadata = lap.metadata || {};
  lap.signature = createLapSignature({
    name: lap.name,
    track: metadata.track,
    car: metadata.car,
    driver: metadata.driver,
    lapTime: metadata.lapTime,
    lapLength: metadata.lapLength,
    sampleCount: Array.isArray(lap.samples) ? lap.samples.length : 0
  });
  return lap.signature;
}
