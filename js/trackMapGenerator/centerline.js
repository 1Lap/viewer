/**
 * Centerline extraction from calibration laps.
 *
 * This module determines the track centerline by either using a dedicated
 * center lap or averaging the left and right limit laps.
 */

/**
 * Extract centerline from resampled calibration grids.
 *
 * Strategy:
 * 1. If a center lap exists, use it directly as the centerline
 * 2. Otherwise, average the left and right laps at each progress point
 *
 * @param {Object} grids - Map of lap types to resampled grids
 * @param {Array<{progress: number, x: number, y: number}>} [grids.left] - Left limit grid
 * @param {Array<{progress: number, x: number, y: number}>} [grids.center] - Center/racing line grid
 * @param {Array<{progress: number, x: number, y: number}>} [grids.right] - Right limit grid
 * @returns {Array<[number, number]>} Centerline as array of [x, y] coordinates
 */
export function extractCenterline(grids) {
  // Validate inputs
  if (!grids.left || !grids.right) {
    throw new Error('Both left and right limit grids are required for centerline extraction.');
  }

  if (grids.left.length !== grids.right.length) {
    throw new Error(
      `Grid size mismatch: left has ${grids.left.length} points, right has ${grids.right.length} points.`
    );
  }

  const gridSize = grids.left.length;

  // If center lap exists and has matching size, use it
  if (grids.center && grids.center.length === gridSize) {
    return grids.center.map((point) => [point.x, point.y]);
  }

  // Otherwise, average left and right laps
  const centerline = [];

  for (let i = 0; i < gridSize; i++) {
    const leftPoint = grids.left[i];
    const rightPoint = grids.right[i];

    const centerX = (leftPoint.x + rightPoint.x) / 2;
    const centerY = (leftPoint.y + rightPoint.y) / 2;

    centerline.push([centerX, centerY]);
  }

  return centerline;
}

/**
 * Validate that the centerline forms a reasonable closed loop.
 *
 * Checks:
 * 1. Start and end points are close together (circuit closure)
 * 2. No discontinuities (large jumps between consecutive points)
 *
 * @param {Array<[number, number]>} centerline - Centerline coordinates
 * @param {Object} [options] - Validation options
 * @param {number} [options.maxClosureDistance=50] - Max distance between start/end (meters)
 * @param {number} [options.maxSegmentLength=100] - Max distance between consecutive points (meters)
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validateCenterline(
  centerline,
  { maxClosureDistance = 50, maxSegmentLength = 100 } = {}
) {
  const errors = [];

  if (centerline.length < 100) {
    errors.push(
      `Centerline has only ${centerline.length} points. Expected at least 100 for a typical track.`
    );
  }

  // Check closure
  const start = centerline[0];
  const end = centerline[centerline.length - 1];
  const closureDistance = Math.hypot(end[0] - start[0], end[1] - start[1]);

  if (closureDistance > maxClosureDistance) {
    errors.push(
      `Track does not close properly: start and end points are ${closureDistance.toFixed(1)}m apart (max allowed: ${maxClosureDistance}m). ` +
        'Check calibration lap quality - ensure laps complete a full circuit.'
    );
  }

  // Check for discontinuities
  let maxSegment = 0;
  let maxSegmentIndex = -1;

  for (let i = 1; i < centerline.length; i++) {
    const prev = centerline[i - 1];
    const curr = centerline[i];
    const segmentLength = Math.hypot(curr[0] - prev[0], curr[1] - prev[1]);

    if (segmentLength > maxSegment) {
      maxSegment = segmentLength;
      maxSegmentIndex = i;
    }

    if (segmentLength > maxSegmentLength) {
      errors.push(
        `Large discontinuity detected at point ${i}: ${segmentLength.toFixed(1)}m gap. ` +
          'This may indicate missing data or the driver going off-track.'
      );
      break; // Only report first discontinuity to avoid spam
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      pointCount: centerline.length,
      closureDistance: closureDistance.toFixed(1),
      maxSegmentLength: maxSegment.toFixed(1),
      maxSegmentIndex
    }
  };
}
