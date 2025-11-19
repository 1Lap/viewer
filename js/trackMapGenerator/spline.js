/**
 * Utilities for sampling smooth splines from calibration lap averages.
 * Uses closed cubic Bézier segments derived from averaged anchor points.
 */

import { computeSignedAngles, computeTangents, computeNormals } from './geometry.js';

const DEFAULT_TENSION = 0.5;
const DEFAULT_POINT_TARGET = 40;

function wrap(points, index) {
  const n = points.length;
  return points[(index % n + n) % n];
}

function evaluateBezier(p0, c1, c2, p3, t) {
  const it = 1 - t;
  const it2 = it * it;
  const it3 = it2 * it;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: it3 * p0.x + 3 * it2 * t * c1.x + 3 * it * t2 * c2.x + t3 * p3.x,
    y: it3 * p0.y + 3 * it2 * t * c1.y + 3 * it * t2 * c2.y + t3 * p3.y
  };
}

function sampleClosedBezier(points, sampleCount, tension = DEFAULT_TENSION) {
  if (!points || points.length < 3) {
    throw new Error('Spline sampling requires at least 3 points per lap.');
  }
  const n = points.length;
  const tangents = points.map((point, idx) => {
    const prev = wrap(points, idx - 1);
    const next = wrap(points, idx + 1);
    return {
      x: (next.x - prev.x) * tension,
      y: (next.y - prev.y) * tension
    };
  });

  const samples = [];
  for (let i = 0; i < sampleCount; i++) {
    const position = (i / sampleCount) * n;
    const segIndex = Math.floor(position) % n;
    const localT = position - Math.floor(position);
    const p0 = points[segIndex];
    const p3 = points[(segIndex + 1) % n];
    const outTangent = tangents[segIndex];
    const inTangent = tangents[(segIndex + 1) % n];
    const c1 = {
      x: p0.x + outTangent.x / 3,
      y: p0.y + outTangent.y / 3
    };
    const c2 = {
      x: p3.x - inTangent.x / 3,
      y: p3.y - inTangent.y / 3
    };
    samples.push(evaluateBezier(p0, c1, c2, p3, localT));
  }

  return samples;
}

function curvatureScore(points, index) {
  const prev = wrap(points, index - 1);
  const curr = wrap(points, index);
  const next = wrap(points, index + 1);
  const v1x = curr.x - prev.x;
  const v1y = curr.y - prev.y;
  const v2x = next.x - curr.x;
  const v2y = next.y - curr.y;
  const cross = v1x * v2y - v1y * v2x;
  const dot = v1x * v2x + v1y * v2y;
  return Math.abs(Math.atan2(cross, dot));
}

function buildAnchorBudget(points, targetCount, options = {}) {
  const { biasIndices = [], spacingMeters = 1, straightSpacing = 80 } = options;
  const n = points.length;
  if (n <= targetCount || targetCount < 4) {
    return points;
  }
  const indexSet = new Set(biasIndices.map((idx) => ((idx % n) + n) % n));
  const straightSamples = Math.max(1, Math.round(straightSpacing / Math.max(spacingMeters, 1e-3)));

  for (let idx = 0; idx < n && indexSet.size < targetCount; idx += straightSamples) {
    indexSet.add(idx);
  }

  const curvatureScores = points.map((_, idx) => ({
    idx,
    score: curvatureScore(points, idx)
  }));

  curvatureScores
    .sort((a, b) => b.score - a.score)
    .forEach(({ idx }) => {
      if (indexSet.size < targetCount) {
        indexSet.add(idx);
      }
    });

  if (indexSet.size > targetCount) {
    const sortedByCurvature = Array.from(indexSet).map((idx) => ({
      idx,
      score: curvatureScore(points, idx)
    }));
    sortedByCurvature
      .sort((a, b) => a.score - b.score)
      .slice(0, sortedByCurvature.length - targetCount)
      .forEach(({ idx }) => indexSet.delete(idx));
  }

  const sortedIndices = Array.from(indexSet).sort((a, b) => a - b);
  const selected = sortedIndices.map((idx) => points[idx]);
  if (selected.length < 4) return points;
  return selected;
}

/**
 * Build spline-sampled left/right edges plus a centreline that stays inside.
 *
 * @param {Object} grids - Averaged calibration grids (left/right/optional center)
 * @param {number} sampleCount - Number of points to sample along the lap
 * @returns {{leftSamples:Array<{x:number,y:number}>, rightSamples:Array<{x:number,y:number}>, centerline:Array<[number,number]>}}
 */
export function buildCenterSplineSamples(grids, sampleCount, options = {}) {
  const allowSingleSide = options.allowSingleSide ?? false;
  if (!grids?.left || !grids?.right) {
    if (!allowSingleSide) {
      throw new Error('Spline sampling requires averaged left and right grids.');
    }
    cloneMissingSide(grids, options.defaultTrackWidth || 12);
  }

  const pointTarget = options.pointTarget || DEFAULT_POINT_TARGET;
  const tension = options.tension ?? DEFAULT_TENSION;
  const spacingMeters = options.spacingMeters || 1;
  const biasOptions = {
    spacingMeters,
    straightSpacing: options.straightSpacing || 80
  };

  const leftPoints = grids.left.map(({ x, y }) => ({ x, y }));
  const rightPoints = grids.right.map(({ x, y }) => ({ x, y }));
  const centerCandidates = grids.center
    ? grids.center.map(({ x, y }) => ({ x, y }))
    : leftPoints.map((point, idx) => {
        const outer = rightPoints[idx] || point;
        return { x: (point.x + outer.x) / 2, y: (point.y + outer.y) / 2 };
      });

  const centerPairs = centerCandidates.map((p) => [p.x, p.y]);
  const leftPairs = leftPoints.map((p) => [p.x, p.y]);
  const rightPairs = rightPoints.map((p) => [p.x, p.y]);

  const insideInfo = determineInsideEdges(
    centerPairs,
    leftPairs,
    rightPairs,
    {
      spacingMeters,
      hysteresisMeters: options.hysteresisMeters || 8
    },
    leftPoints,
    rightPoints
  );
  const apexIndices = detectApexIndices(insideInfo.insidePoints, spacingMeters);

  const leftControl = buildAnchorBudget(leftPoints, pointTarget, {
    ...biasOptions,
    biasIndices: apexIndices
  });
  const rightControl = buildAnchorBudget(rightPoints, pointTarget, {
    ...biasOptions,
    biasIndices: apexIndices
  });
  const centerControls = buildAnchorBudget(centerCandidates, pointTarget, {
    ...biasOptions,
    biasIndices: apexIndices
  });

  const leftSamples = sampleClosedBezier(leftControl, sampleCount, tension);
  const rightSamples = sampleClosedBezier(rightControl, sampleCount, tension);
  const centerSamples = sampleClosedBezier(centerControls, sampleCount, tension);
  const centerline = centerSamples.map((sample) => [sample.x, sample.y]);

  return {
    leftSamples,
    rightSamples,
    centerline,
    insideSamples: insideInfo.insidePoints,
    metadata: {
      leftControlCount: leftControl.length,
      rightControlCount: rightControl.length,
      centerControlCount: centerControls.length,
      insideFlipCount: insideInfo.flipCount,
      apexCount: apexIndices.length
    }
  };
}

function cloneMissingSide(grids, widthMeters) {
  const sourceKey = grids.left ? 'left' : grids.right ? 'right' : null;
  if (!sourceKey) {
    throw new Error('At least one calibration lap is required.');
  }
  const source = grids[sourceKey];
  const points = source.map(({ x, y }) => [x, y]);
  const tangents = computeTangents(points);
  const normals = computeNormals(tangents);
  const offset = widthMeters;
  const direction = sourceKey === 'left' ? -1 : 1;
  const clone = source.map((point, idx) => ({
    progress: point.progress,
    x: point.x + normals[idx][0] * offset * direction,
    y: point.y + normals[idx][1] * offset * direction
  }));
  if (sourceKey === 'left') grids.right = clone;
  else grids.left = clone;
}

function determineInsideEdges(centerPairs, leftPairs, rightPairs, options, leftPoints, rightPoints) {
  const { spacingMeters = 1, hysteresisMeters = 8 } = options;
  const centerAngles = computeSignedAngles(centerPairs);
  const leftAngles = leftPairs ? computeSignedAngles(leftPairs) : null;
  const rightAngles = rightPairs ? computeSignedAngles(rightPairs) : null;
  const n = centerAngles.length;
  const insideSides = new Array(n);
  const insidePoints = new Array(n);
  const minSamples = Math.max(1, Math.round(hysteresisMeters / Math.max(spacingMeters, 1e-3)));
  let current = 'left';
  let lastSign = 1;
  let pending = null;
  let pendingCount = 0;
  let flipCount = 0;

  const pickCandidate = (index) => {
    const angleSign = Math.abs(centerAngles[index]) > 1e-4 ? Math.sign(centerAngles[index]) : lastSign;
    const leftAngle = leftAngles ? leftAngles[index] : null;
    const rightAngle = rightAngles ? rightAngles[index] : null;
    const leftScore = leftAngle != null ? Math.abs(leftAngle) : -1;
    const rightScore = rightAngle != null ? Math.abs(rightAngle) : -1;
    const leftMatch = leftAngle != null && Math.sign(leftAngle) === angleSign && leftScore > 1e-4;
    const rightMatch = rightAngle != null && Math.sign(rightAngle) === angleSign && rightScore > 1e-4;

    if (leftMatch && !rightMatch) return 'left';
    if (rightMatch && !leftMatch) return 'right';
    if (leftMatch && rightMatch) return leftScore >= rightScore ? 'left' : 'right';
    if (leftScore >= 0 && rightScore >= 0) {
      return leftScore >= rightScore ? 'left' : 'right';
    }
    if (leftScore >= 0) return 'left';
    if (rightScore >= 0) return 'right';
    return current;
  };

  for (let i = 0; i < n; i++) {
    if (Math.abs(centerAngles[i]) > 1e-4) {
      lastSign = Math.sign(centerAngles[i]) || lastSign;
    }
    const candidate = pickCandidate(i) || current;
    if (insideSides[i - 1] == null) {
      current = candidate;
    } else if (candidate !== current) {
      if (pending === candidate) {
        pendingCount += 1;
      } else {
        pending = candidate;
        pendingCount = 1;
      }
      if (pendingCount >= minSamples) {
        current = candidate;
        pending = null;
        pendingCount = 0;
        flipCount += 1;
      }
    } else {
      pending = null;
      pendingCount = 0;
    }
    insideSides[i] = current;
    const sourcePoints = current === 'left' ? leftPoints : rightPoints;
    const safeIndex = ((i % sourcePoints.length) + sourcePoints.length) % sourcePoints.length;
    insidePoints[i] = { ...sourcePoints[safeIndex] };
  }

  return { insideSides, insidePoints, flipCount };
}

function detectApexIndices(points, spacingMeters) {
  const pairPoints = points.map((p) => [p.x, p.y]);
  const curvature = computeSignedAngles(pairPoints).map((angle) => Math.abs(angle));
  const n = curvature.length;
  const peaks = [];
  for (let i = 0; i < n; i++) {
    const prev = curvature[(i - 1 + n) % n];
    const next = curvature[(i + 1) % n];
    if (curvature[i] >= prev && curvature[i] >= next && curvature[i] > 1e-4) {
      peaks.push(i);
    }
  }
  peaks.sort((a, b) => curvature[b] - curvature[a]);
  const mergeSamples = Math.max(1, Math.round(5 / Math.max(spacingMeters, 1e-3)));
  const merged = [];
  for (const idx of peaks) {
    if (!merged.length) {
      merged.push(idx);
      continue;
    }
    const last = merged[merged.length - 1];
    const delta = Math.min(Math.abs(idx - last), n - Math.abs(idx - last));
    if (delta <= mergeSamples) {
      if (curvature[idx] > curvature[last]) {
        merged[merged.length - 1] = idx;
      }
    } else {
      merged.push(idx);
    }
  }
  return merged;
}
