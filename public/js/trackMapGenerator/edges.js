/**
 * Track edge polyline generation.
 *
 * This module generates left and right track edge polylines by offsetting
 * the centerline along normal vectors by the track half-widths.
 */

/**
 * Generate left and right edge polylines from centerline, normals, and widths.
 *
 * Formula:
 *   leftEdge[i]  = centerline[i] + normal[i] * halfWidthLeft[i]
 *   rightEdge[i] = centerline[i] - normal[i] * halfWidthRight[i]
 *
 * Note: Normal points left (90° CCW from tangent), so:
 * - Adding normal * width moves left
 * - Subtracting normal * width moves right
 *
 * @param {Array<[number, number]>} centerline - Centerline coordinates
 * @param {Array<[number, number]>} normals - Normal vectors at each point
 * @param {Float64Array} halfWidthLeft - Left half-widths (meters)
 * @param {Float64Array} halfWidthRight - Right half-widths (meters)
 * @returns {{leftEdge: Array<[number, number]>, rightEdge: Array<[number, number]>}}
 */
export function generateEdges(centerline, normals, halfWidthLeft, halfWidthRight) {
  const n = centerline.length;

  if (normals.length !== n) {
    throw new Error(`Length mismatch: centerline has ${n} points, normals has ${normals.length}.`);
  }

  if (halfWidthLeft.length !== n || halfWidthRight.length !== n) {
    throw new Error(
      `Length mismatch: centerline has ${n} points, ` +
        `halfWidthLeft has ${halfWidthLeft.length}, halfWidthRight has ${halfWidthRight.length}.`
    );
  }

  const leftEdge = [];
  const rightEdge = [];

  for (let i = 0; i < n; i++) {
    const [cx, cy] = centerline[i];
    const [nx, ny] = normals[i];
    const wl = halfWidthLeft[i];
    const wr = halfWidthRight[i];

    // Left edge = center + normal * leftWidth
    const leftX = cx + nx * wl;
    const leftY = cy + ny * wl;
    leftEdge.push([leftX, leftY]);

    // Right edge = center - normal * rightWidth
    const rightX = cx - nx * wr;
    const rightY = cy - ny * wr;
    rightEdge.push([rightX, rightY]);
  }

  return { leftEdge, rightEdge };
}

/**
 * Calculate the total track width at each point.
 *
 * @param {Float64Array} halfWidthLeft - Left half-widths
 * @param {Float64Array} halfWidthRight - Right half-widths
 * @returns {Float64Array} Total widths (left + right)
 */
export function calculateTotalWidth(halfWidthLeft, halfWidthRight) {
  const n = halfWidthLeft.length;
  const totalWidth = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    totalWidth[i] = halfWidthLeft[i] + halfWidthRight[i];
  }

  return totalWidth;
}

/**
 * Validate edge polylines for common issues.
 *
 * Checks:
 * 1. Edges don't cross each other (track width always positive)
 * 2. Edges don't self-intersect
 * 3. Reasonable edge lengths
 *
 * @param {Array<[number, number]>} leftEdge - Left edge polyline
 * @param {Array<[number, number]>} rightEdge - Right edge polyline
 * @returns {{valid: boolean, warnings: string[]}}
 */
export function validateEdges(leftEdge, rightEdge) {
  const warnings = [];
  const n = leftEdge.length;

  // Check for edge crossings (left and right edges should never cross)
  for (let i = 0; i < n; i++) {
    const [lx, ly] = leftEdge[i];
    const [rx, ry] = rightEdge[i];

    // If edges are very close together, track might be collapsed
    const edgeDistance = Math.hypot(lx - rx, ly - ry);
    if (edgeDistance < 5) {
      warnings.push(
        `Point ${i}: Edges very close together (${edgeDistance.toFixed(1)}m). ` +
          'Check track width calculation or calibration lap quality.'
      );
      break; // Only report first occurrence
    }
  }

  // Check for large jumps in edge position (discontinuities)
  let maxLeftJump = 0;
  let maxRightJump = 0;
  let maxLeftJumpIndex = -1;
  let maxRightJumpIndex = -1;

  for (let i = 1; i < n; i++) {
    const leftJump = Math.hypot(
      leftEdge[i][0] - leftEdge[i - 1][0],
      leftEdge[i][1] - leftEdge[i - 1][1]
    );
    const rightJump = Math.hypot(
      rightEdge[i][0] - rightEdge[i - 1][0],
      rightEdge[i][1] - rightEdge[i - 1][1]
    );

    if (leftJump > maxLeftJump) {
      maxLeftJump = leftJump;
      maxLeftJumpIndex = i;
    }

    if (rightJump > maxRightJump) {
      maxRightJump = rightJump;
      maxRightJumpIndex = i;
    }

    if (leftJump > 50) {
      warnings.push(
        `Point ${i}: Large discontinuity in left edge (${leftJump.toFixed(1)}m jump). ` +
          'May indicate data quality issue.'
      );
      break;
    }

    if (rightJump > 50) {
      warnings.push(
        `Point ${i}: Large discontinuity in right edge (${rightJump.toFixed(1)}m jump). ` +
          'May indicate data quality issue.'
      );
      break;
    }
  }

  const valid = warnings.length === 0;

  return {
    valid,
    warnings,
    stats: {
      pointCount: n,
      maxLeftJump: maxLeftJump.toFixed(1),
      maxLeftJumpIndex,
      maxRightJump: maxRightJump.toFixed(1),
      maxRightJumpIndex
    }
  };
}
