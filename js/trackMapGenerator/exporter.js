import { writeFile } from 'fs/promises';

/**
 * Track map JSON exporter.
 *
 * This module exports the final track map data structure as JSON,
 * suitable for loading in the analysis SPA.
 */

/**
 * Calculate bounding box (viewBox) for the track.
 *
 * The viewBox defines the coordinate space that contains the entire track,
 * with a small padding margin for visual clarity.
 *
 * @param {Array<[number, number]>} leftEdge - Left edge polyline
 * @param {Array<[number, number]>} rightEdge - Right edge polyline
 * @param {number} [paddingFactor=0.05] - Padding as fraction of track dimensions (0.05 = 5%)
 * @returns {[number, number, number, number]} ViewBox as [minX, minY, width, height]
 */
export function calculateViewBox(leftEdge, rightEdge, paddingFactor = 0.05) {
  const allPoints = [...leftEdge, ...rightEdge];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of allPoints) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const width = maxX - minX;
  const height = maxY - minY;

  // Apply padding
  const paddingX = width * paddingFactor;
  const paddingY = height * paddingFactor;

  return [minX - paddingX / 2, minY - paddingY / 2, width + paddingX, height + paddingY];
}

/**
 * Round coordinates to a reasonable precision to reduce JSON file size.
 *
 * @param {number} value - Coordinate value
 * @param {number} [decimals=2] - Number of decimal places
 * @returns {number} Rounded value
 */
function round(value, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Create track map data structure.
 *
 * @param {Object} params - Track map parameters
 * @param {string} params.sim - Simulator name (e.g., 'lmu')
 * @param {string} params.trackId - Track identifier
 * @param {string} params.trackName - Full track name
 * @param {number} params.sampleCount - Number of grid samples
 * @param {Array<[number, number]>} params.centerline - Centerline coordinates
 * @param {Float64Array} params.halfWidthLeft - Left half-widths
 * @param {Float64Array} params.halfWidthRight - Right half-widths
 * @param {Array<[number, number]>} params.leftEdge - Left edge polyline
 * @param {Array<[number, number]>} params.rightEdge - Right edge polyline
 * @param {number} params.smoothingWindow - Smoothing window size used
 * @param {Object} params.calibrationLaps - Metadata about source laps
 * @returns {Object} Track map data structure
 */
export function createTrackMapData({
  sim,
  trackId,
  trackName,
  sampleCount,
  centerline,
  halfWidthLeft,
  halfWidthRight,
  leftEdge,
  rightEdge,
  smoothingWindow,
  calibrationLaps
}) {
  // Calculate viewBox
  const viewBox = calculateViewBox(leftEdge, rightEdge);

  // Round coordinates to reduce file size
  const roundedCenterline = centerline.map(([x, y]) => [round(x), round(y)]);
  const roundedLeftEdge = leftEdge.map(([x, y]) => [round(x), round(y)]);
  const roundedRightEdge = rightEdge.map(([x, y]) => [round(x), round(y)]);

  // Round widths
  const roundedHalfWidthLeft = Array.from(halfWidthLeft).map((w) => round(w));
  const roundedHalfWidthRight = Array.from(halfWidthRight).map((w) => round(w));

  // Round viewBox
  const roundedViewBox = viewBox.map((v) => round(v));

  return {
    sim,
    trackId,
    trackName,
    version: 1,
    generatedAt: new Date().toISOString(),
    sampleCount,
    centerline: roundedCenterline,
    halfWidthLeft: roundedHalfWidthLeft,
    halfWidthRight: roundedHalfWidthRight,
    leftEdge: roundedLeftEdge,
    rightEdge: roundedRightEdge,
    viewBox: roundedViewBox,
    smoothingWindow,
    calibrationLaps
  };
}

/**
 * Export track map to JSON file.
 *
 * @param {Object} trackMapData - Track map data structure (from createTrackMapData)
 * @param {string} outputPath - Path to output JSON file
 * @returns {Promise<void>}
 */
export async function exportTrackMap(trackMapData, outputPath) {
  const json = JSON.stringify(trackMapData, null, 2);
  await writeFile(outputPath, json, 'utf-8');
}

/**
 * Generate a human-readable summary of the track map.
 *
 * @param {Object} trackMapData - Track map data structure
 * @returns {string} Summary text
 */
export function generateSummary(trackMapData) {
  const {
    trackName,
    trackId,
    sampleCount,
    halfWidthLeft,
    halfWidthRight,
    smoothingWindow,
    calibrationLaps
  } = trackMapData;

  const avgLeft = halfWidthLeft.reduce((sum, w) => sum + w, 0) / halfWidthLeft.length;
  const avgRight = halfWidthRight.reduce((sum, w) => sum + w, 0) / halfWidthRight.length;
  const avgTotal = avgLeft + avgRight;

  const minLeft = Math.min(...halfWidthLeft);
  const maxLeft = Math.max(...halfWidthLeft);
  const minRight = Math.min(...halfWidthRight);
  const maxRight = Math.max(...halfWidthRight);

  return `
Track Map Summary
=================
Track: ${trackName}
Track ID: ${trackId}
Sample Count: ${sampleCount}
Smoothing Window: ${smoothingWindow}

Track Width Statistics:
  Average Total: ${avgTotal.toFixed(2)}m
  Average Left: ${avgLeft.toFixed(2)}m (range: ${minLeft.toFixed(2)}m - ${maxLeft.toFixed(2)}m)
  Average Right: ${avgRight.toFixed(2)}m (range: ${minRight.toFixed(2)}m - ${maxRight.toFixed(2)}m)

Calibration Laps:
  Left: ${calibrationLaps.left || 'none'}
  Center: ${calibrationLaps.center || 'none'}
  Right: ${calibrationLaps.right || 'none'}

Generated: ${trackMapData.generatedAt}
`.trim();
}
