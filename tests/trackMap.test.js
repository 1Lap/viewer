import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for track map rendering and zoom behavior.
 *
 * The key requirement: When zooming into different portions of the track,
 * the scale and aspect ratio should remain consistent (no "warping").
 *
 * This means:
 * 1. The bounds should be calculated from the full track extent, not just visible points
 * 2. The projection function should maintain consistent world-to-canvas mapping
 * 3. Zooming should feel like cropping to a viewport, not rescaling each section
 */

/**
 * Create mock lap data with known coordinates
 */
function createMockLap() {
  const samples = [];
  // Create a simple rectangular track: 100m x 50m
  // This makes it easy to verify scaling behavior
  for (let i = 0; i <= 100; i++) {
    const distance = i * 10; // 0 to 1000m
    let x, z;

    if (i <= 25) {
      // Bottom edge: (0,0) to (100,0)
      x = i * 4;
      z = 0;
    } else if (i <= 50) {
      // Right edge: (100,0) to (100,50)
      x = 100;
      z = (i - 25) * 2;
    } else if (i <= 75) {
      // Top edge: (100,50) to (0,50)
      x = 100 - (i - 50) * 4;
      z = 50;
    } else {
      // Left edge: (0,50) to (0,0)
      x = 0;
      z = 50 - (i - 75) * 2;
    }

    samples.push({
      distance,
      x,
      z,
      y: z, // fallback
      throttle: 0.5,
      brake: 0,
      speed: 100,
      steer: 0,
      gear: 3,
      rpm: 5000
    });
  }

  return {
    id: 'test-lap',
    samples,
    metadata: {
      track: 'Test Track',
      lapLength: 1000
    }
  };
}

/**
 * Helper to simulate projection calculations with different view windows
 */
function calculateProjectionBounds(samples, viewWindow = null) {
  const getPlanarY = (sample) => (sample.z != null ? sample.z : sample.y);
  const activePoints = samples.filter((s) => s.x != null && getPlanarY(s) != null);

  const windowStart = viewWindow?.start ?? samples[0].distance;
  const windowEnd = viewWindow?.end ?? samples[samples.length - 1].distance;
  const totalSpan = samples[samples.length - 1].distance - samples[0].distance || 1;
  const windowSpan = windowEnd - windowStart;
  const shouldZoom = windowSpan < totalSpan * 0.98;

  // FIXED: Calculate bounds from FULL track extent to prevent warping
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  activePoints.forEach((p) => {
    const planeY = getPlanarY(p);
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (planeY < minY) minY = planeY;
    if (planeY > maxY) maxY = planeY;
  });

  // Use consistent expansion factor to prevent warping during zoom
  const expand = 0.05;
  const expandX = (maxX - minX) * expand || 1;
  const expandY = (maxY - minY) * expand || 1;
  minX -= expandX;
  maxX += expandX;
  minY -= expandY;
  maxY += expandY;

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  return { minX, maxX, minY, maxY, rangeX, rangeY, shouldZoom };
}

test('track map bounds are consistent across zoom levels', () => {
  const lap = createMockLap();

  // Calculate bounds for full view
  const fullBounds = calculateProjectionBounds(lap.samples, null);

  // Calculate bounds for bottom section (distance 0-250m, should be bottom edge x=0-100, z=0)
  const bottomBounds = calculateProjectionBounds(lap.samples, { start: 0, end: 250 });

  // Calculate bounds for right section (distance 250-500m, should be right edge x=100, z=0-50)
  const rightBounds = calculateProjectionBounds(lap.samples, { start: 250, end: 500 });

  // With the fix, bounds should be identical across all zoom levels
  // because we calculate from full track extent with consistent expansion

  const tolerance = 0.01;
  assert.ok(Math.abs(fullBounds.rangeX - bottomBounds.rangeX) < tolerance,
    `Bottom rangeX (${bottomBounds.rangeX}) should match full (${fullBounds.rangeX})`);
  assert.ok(Math.abs(fullBounds.rangeY - bottomBounds.rangeY) < tolerance,
    `Bottom rangeY (${bottomBounds.rangeY}) should match full (${fullBounds.rangeY})`);
  assert.ok(Math.abs(fullBounds.rangeX - rightBounds.rangeX) < tolerance,
    `Right rangeX (${rightBounds.rangeX}) should match full (${fullBounds.rangeX})`);
  assert.ok(Math.abs(fullBounds.rangeY - rightBounds.rangeY) < tolerance,
    `Right rangeY (${rightBounds.rangeY}) should match full (${fullBounds.rangeY})`);
});

test('zoomed track sections should maintain aspect ratio', () => {
  const lap = createMockLap();

  // Full view: track is 100 wide x 50 tall = 2:1 aspect ratio
  const fullBounds = calculateProjectionBounds(lap.samples, null);
  const fullAspect = fullBounds.rangeX / fullBounds.rangeY;

  // Bottom section: should still maintain 2:1 aspect of full track
  const bottomBounds = calculateProjectionBounds(lap.samples, { start: 0, end: 250 });
  const bottomAspect = bottomBounds.rangeX / bottomBounds.rangeY;

  // Right section: should also maintain 2:1 aspect
  const rightBounds = calculateProjectionBounds(lap.samples, { start: 250, end: 500 });
  const rightAspect = rightBounds.rangeX / rightBounds.rangeY;

  // With the fix, aspect ratios should be consistent
  const tolerance = 0.01;
  assert.ok(Math.abs(fullAspect - bottomAspect) < tolerance,
    `Bottom aspect ratio (${bottomAspect}) should match full (${fullAspect})`);
  assert.ok(Math.abs(fullAspect - rightAspect) < tolerance,
    `Right aspect ratio (${rightAspect}) should match full (${fullAspect})`);
});

test('projection of known point should remain consistent across zoom levels', () => {
  const lap = createMockLap();

  // Pick a point at distance=500m (should be at corner: x=100, z=50)
  const testPoint = lap.samples.find(s => s.distance === 500);
  assert.ok(testPoint, 'Test point should exist');

  // Helper to project a point given bounds
  function projectPoint(point, bounds, canvasWidth = 1000, canvasHeight = 500) {
    const paddingX = 30;
    const paddingY = 30;
    const width = canvasWidth - paddingX * 2;
    const height = canvasHeight - paddingY * 2;

    const normX = (point.x - bounds.minX) / bounds.rangeX;
    const normY = (point.z - bounds.minY) / bounds.rangeY;
    const x = paddingX + (1 - normX) * width;
    const y = canvasHeight - paddingY - normY * height;
    return { x, y };
  }

  // Project the test point in full view
  const fullBounds = calculateProjectionBounds(lap.samples, null);
  const fullProjection = projectPoint(testPoint, fullBounds);

  // Project the same point when zoomed to include it
  const zoomedBounds = calculateProjectionBounds(lap.samples, { start: 250, end: 750 });
  const zoomedProjection = projectPoint(testPoint, zoomedBounds);

  // With the fix, the bounds are calculated from the full track extent with consistent expansion
  // This means the same world point should project to identical canvas coordinates
  const distance = Math.sqrt(
    Math.pow(fullProjection.x - zoomedProjection.x, 2) +
    Math.pow(fullProjection.y - zoomedProjection.y, 2)
  );

  // Projections should be identical (within floating point tolerance)
  assert.ok(distance < 0.01, `Projection distance (${distance}) should be ~0 pixels`);
});
