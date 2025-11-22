/**
 * Enforce geometric constraints so generated edges stay within recorded calibration laps.
 *
 * This prevents smoothing or centreline drift from pushing the exported limits
 * outside the raw left/right traces.
 */

function projectOntoNormal(point, center, normal) {
  const dx = point.x - center[0];
  const dy = point.y - center[1];
  return dx * normal[0] + dy * normal[1];
}

/**
 * Clamp half-width arrays so they never exceed the raw laps.
 *
 * @param {Object} params
 * @param {Array<[number, number]>} params.centerline
 * @param {Array<[number, number]>} params.normals
 * @param {Object} params.rawSamples - Resampled grids grouped by type
 * @param {Array<Array<{x:number,y:number}>>} params.rawSamples.left
 * @param {Array<Array<{x:number,y:number}>>} params.rawSamples.right
 * @param {Float64Array} params.halfWidthLeft
 * @param {Float64Array} params.halfWidthRight
 * @param {number} [params.clampScale=1] - Fraction of the recorded span to allow (<=1)
 * @returns {{halfWidthLeft: Float64Array, halfWidthRight: Float64Array, stats: Object}}
 */
export function enforceWidthConstraints({
  centerline,
  normals,
  rawSamples,
  halfWidthLeft,
  halfWidthRight,
  clampScale = 1
}) {
  const n = centerline.length;
  const leftResult = new Float64Array(halfWidthLeft);
  const rightResult = new Float64Array(halfWidthRight);
  const leftLaps = rawSamples?.left ?? [];
  const rightLaps = rawSamples?.right ?? [];
  const stats = {
    clampScale,
    leftClamped: 0,
    rightClamped: 0,
    leftIndices: [],
    rightIndices: []
  };

  const safeScale = Number.isFinite(clampScale) ? Math.max(0.1, Math.min(clampScale, 1)) : 1;

  for (let i = 0; i < n; i++) {
    const center = centerline[i];
    const normal = normals[i];

    if (leftLaps.length) {
      let limit = 0;
      for (const lap of leftLaps) {
        const point = lap[i];
        if (!point) continue;
        const projection = projectOntoNormal(point, center, normal);
        if (projection > limit) limit = projection;
      }
      limit *= safeScale;
      if (limit > 0 && leftResult[i] > limit) {
        leftResult[i] = limit;
        stats.leftClamped += 1;
        stats.leftIndices.push(i);
      }
    }

    if (rightLaps.length) {
      let limit = 0;
      for (const lap of rightLaps) {
        const point = lap[i];
        if (!point) continue;
        const projection = -projectOntoNormal(point, center, normal);
        if (projection > limit) limit = projection;
      }
      limit *= safeScale;
      if (limit > 0 && rightResult[i] > limit) {
        rightResult[i] = limit;
        stats.rightClamped += 1;
        stats.rightIndices.push(i);
      }
    }
  }

  return {
    halfWidthLeft: leftResult,
    halfWidthRight: rightResult,
    stats
  };
}
