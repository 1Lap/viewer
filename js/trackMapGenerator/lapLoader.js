import { readFile, readdir } from 'fs/promises';
import { join, basename } from 'path';
import { parseLapFile } from '../parser.js';

/**
 * @typedef {Object} ClassifiedLap
 * @property {'left'|'center'|'right'} type - Lap classification
 * @property {string} filename - Original filename
 * @property {import('../parser.js').Lap} lap - Parsed lap data
 */

/**
 * Load and classify calibration laps from a directory.
 *
 * @param {string} dirPath - Path to directory containing calibration CSV files
 * @param {Object} lapMap - Map of lap types to filenames
 * @param {string} [lapMap.left] - Filename for left-limit lap
 * @param {string} [lapMap.center] - Filename for center/racing-line lap
 * @param {string} [lapMap.right] - Filename for right-limit lap
 * @returns {Promise<{laps: ClassifiedLap[], trackId: string, trackName: string}>}
 */
export async function loadCalibrationLaps(dirPath, lapMap) {
  const laps = [];
  let trackId = null;
  let trackName = null;

  // Process each classified lap
  for (const [type, filename] of Object.entries(lapMap)) {
    if (!filename) continue;

    const filePath = join(dirPath, filename);
    const csvContent = await readFile(filePath, 'utf-8');
    const lap = parseLapFile(csvContent, basename(filename, '.csv'));

    // Validate this lap has X/Y or X/Z coordinates
    const hasSpatialData = lap.samples.some((s) => s.x != null && (s.y != null || s.z != null));
    if (!hasSpatialData) {
      throw new Error(
        `Lap file "${filename}" does not contain spatial coordinates (X/Y or X/Z). Cannot generate track map.`
      );
    }

    // Extract track identifier (normalize track name to slug format)
    const lapTrackId = normalizeTrackId(lap.metadata.track);
    const lapTrackName = lap.metadata.track;

    // Ensure all laps are from the same track
    if (trackId === null) {
      trackId = lapTrackId;
      trackName = lapTrackName;
    } else if (trackId !== lapTrackId) {
      throw new Error(
        `Track mismatch: expected "${trackName}" but lap "${filename}" is from "${lapTrackName}". All calibration laps must be from the same track.`
      );
    }

    laps.push({
      type,
      filename,
      lap
    });
  }

  if (laps.length === 0) {
    throw new Error(
      'No valid calibration laps provided. At minimum, left and right laps are required.'
    );
  }

  // Validate we have at least left and right laps
  const hasLeft = laps.some((l) => l.type === 'left');
  const hasRight = laps.some((l) => l.type === 'right');

  if (!hasLeft || !hasRight) {
    throw new Error(
      'Both left-limit and right-limit laps are required for track map generation. Missing: ' +
        [!hasLeft && 'left', !hasRight && 'right'].filter(Boolean).join(', ')
    );
  }

  return {
    laps,
    trackId,
    trackName
  };
}

/**
 * Auto-discover CSV files in a directory.
 * Useful for listing available calibration files.
 *
 * @param {string} dirPath - Path to directory
 * @returns {Promise<string[]>} Array of CSV filenames
 */
export async function listCalibrationFiles(dirPath) {
  const files = await readdir(dirPath);
  return files.filter((f) => f.toLowerCase().endsWith('.csv')).sort();
}

/**
 * Normalize track name to a consistent ID format.
 * Examples:
 *   "Algarve International Circuit" → "algarve_international_circuit"
 *   "Spa-Francorchamps" → "spa_francorchamps"
 *
 * @param {string} trackName - Original track name
 * @returns {string} Normalized track ID
 */
function normalizeTrackId(trackName) {
  return trackName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
