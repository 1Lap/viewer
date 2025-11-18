/**
 * Geometric calculations for track centerline.
 *
 * This module computes tangent and normal vectors along the centerline,
 * which are used for track width calculations and edge generation.
 */

/**
 * Normalize a 2D vector to unit length.
 *
 * @param {number} x - X component
 * @param {number} y - Y component
 * @returns {[number, number]} Unit vector [x, y]
 */
function normalize(x, y) {
  const length = Math.hypot(x, y);
  if (length === 0) {
    return [0, 0];
  }
  return [x / length, y / length];
}

/**
 * Compute tangent vectors along the centerline using central differences.
 *
 * The tangent at each point indicates the direction of travel.
 * For closed loops (racetracks), the calculation wraps around at the ends.
 *
 * @param {Array<[number, number]>} centerline - Centerline coordinates
 * @param {Object} [options] - Computation options
 * @param {boolean} [options.circular=true] - Treat as closed loop (wrap at ends)
 * @returns {Array<[number, number]>} Array of unit tangent vectors
 */
export function computeTangents(centerline, { circular = true } = {}) {
  const tangents = [];
  const n = centerline.length;

  if (n < 2) {
    throw new Error('Centerline must have at least 2 points to compute tangents.');
  }

  for (let i = 0; i < n; i++) {
    let prev, next;

    if (circular) {
      // Circular mode: wrap around at ends
      prev = centerline[(i - 1 + n) % n];
      next = centerline[(i + 1) % n];
    } else {
      // Linear mode: use forward/backward differences at ends
      if (i === 0) {
        prev = centerline[i];
        next = centerline[i + 1];
      } else if (i === n - 1) {
        prev = centerline[i - 1];
        next = centerline[i];
      } else {
        prev = centerline[i - 1];
        next = centerline[i + 1];
      }
    }

    // Central difference: tangent = normalize(next - prev)
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const tangent = normalize(dx, dy);

    tangents.push(tangent);
  }

  return tangents;
}

/**
 * Compute normal vectors from tangent vectors.
 *
 * The normal is perpendicular to the tangent, rotated 90° counter-clockwise.
 * This means the normal points "left" relative to the direction of travel.
 *
 * For track edges:
 * - Left edge = centerline + normal * halfWidthLeft
 * - Right edge = centerline - normal * halfWidthRight
 *
 * @param {Array<[number, number]>} tangents - Array of tangent vectors
 * @returns {Array<[number, number]>} Array of unit normal vectors
 */
export function computeNormals(tangents) {
  const normals = [];

  for (const [tx, ty] of tangents) {
    // Rotate tangent 90° counter-clockwise: (x, y) → (-y, x)
    const normal = [-ty, tx];
    normals.push(normal);
  }

  return normals;
}

/**
 * Compute both tangents and normals in a single pass.
 *
 * @param {Array<[number, number]>} centerline - Centerline coordinates
 * @param {Object} [options] - Computation options
 * @param {boolean} [options.circular=true] - Treat as closed loop
 * @returns {{tangents: Array<[number, number]>, normals: Array<[number, number]>}}
 */
export function computeGeometry(centerline, options = {}) {
  const tangents = computeTangents(centerline, options);
  const normals = computeNormals(tangents);

  return { tangents, normals };
}

/**
 * Compute curvature at each point along the centerline.
 *
 * Curvature measures how sharply the track is turning.
 * Higher values indicate tighter corners, lower values indicate straights.
 *
 * This can be used for future enhancements like apex detection.
 *
 * @param {Array<[number, number]>} centerline - Centerline coordinates
 * @param {Array<[number, number]>} tangents - Tangent vectors
 * @param {Object} [options] - Computation options
 * @param {boolean} [options.circular=true] - Treat as closed loop
 * @returns {Float64Array} Array of curvature values (1/meters)
 */
export function computeCurvature(centerline, tangents, { circular = true } = {}) {
  const curvature = new Float64Array(centerline.length);
  const n = centerline.length;

  if (n < 3) {
    return curvature; // All zeros
  }

  for (let i = 0; i < n; i++) {
    let prev, next;
    let tPrev, tNext;

    if (circular) {
      prev = centerline[(i - 1 + n) % n];
      next = centerline[(i + 1) % n];
      tPrev = tangents[(i - 1 + n) % n];
      tNext = tangents[(i + 1) % n];
    } else {
      if (i === 0 || i === n - 1) {
        curvature[i] = 0;
        continue;
      }
      prev = centerline[i - 1];
      next = centerline[i + 1];
      tPrev = tangents[i - 1];
      tNext = tangents[i + 1];
    }

    // Approximate curvature using change in tangent direction
    const dtx = tNext[0] - tPrev[0];
    const dty = tNext[1] - tPrev[1];
    const ds = Math.hypot(next[0] - prev[0], next[1] - prev[1]) / 2;

    if (ds > 0) {
      curvature[i] = Math.hypot(dtx, dty) / ds;
    }
  }

  return curvature;
}
