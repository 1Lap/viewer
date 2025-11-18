import { elements } from './elements.js';
import { telemetryState, uiState, projectionState, getLapColor, getActiveLap } from './state.js';
import { findSampleAtDistance } from './utils.js';
import { loadTrackMapByName } from './trackMapLoader.js';

const panState = {
  active: false,
  pointerId: null,
  startX: 0,
  windowStart: 0,
  windowEnd: 0,
  minDistance: 0,
  maxDistance: 0
};

const hoverDeps = {
  setCursorDistance: () => {},
  setViewWindow: null
};

export async function renderTrackMap(lap) {
  if (!elements?.trackCanvas) return;
  const canvas = elements.trackCanvas;
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const cssWidth = rect.width || canvas.clientWidth;
  const cssHeight = rect.height || canvas.clientHeight;
  if (!cssWidth || !cssHeight) return;
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = Math.floor(cssWidth * dpr);
  const displayHeight = Math.floor(cssHeight * dpr);
  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  if (!lap || !telemetryState.lapVisibility.size) {
    ctx.fillStyle = '#adb3c2';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Load a lap to view the track map', cssWidth / 2, cssHeight / 2);
    projectionState.sourceLapId = null;
    projectionState.points = [];
    return;
  }

  const getPlanarY = (sample) => (sample.z != null ? sample.z : sample.y);
  const activePoints = lap.samples.filter((s) => s.x != null && getPlanarY(s) != null);
  if (!activePoints.length) {
    ctx.fillStyle = '#adb3c2';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Track coordinates unavailable in this export.',
      canvas.width / 2,
      canvas.height / 2
    );
    projectionState.sourceLapId = null;
    projectionState.points = [];
    return;
  }

  const windowStart = uiState.viewWindow?.start ?? lap.samples[0].distance;
  const windowEnd = uiState.viewWindow?.end ?? lap.samples[lap.samples.length - 1].distance;
  const totalSpan = lap.samples[lap.samples.length - 1].distance - lap.samples[0].distance || 1;
  const windowSpan = windowEnd - windowStart;
  const shouldZoom = windowSpan < totalSpan * 0.98;
  const windowPoints = shouldZoom
    ? activePoints.filter((p) => p.distance >= windowStart && p.distance <= windowEnd)
    : activePoints;
  const drawingPoints = shouldZoom && windowPoints.length >= 2 ? windowPoints : activePoints;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  drawingPoints.forEach((p) => {
    const planeY = getPlanarY(p);
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (planeY < minY) minY = planeY;
    if (planeY > maxY) maxY = planeY;
  });

  const expand = shouldZoom ? 0.15 : 0.05;
  const expandX = (maxX - minX) * expand || 1;
  const expandY = (maxY - minY) * expand || 1;
  minX -= expandX;
  maxX += expandX;
  minY -= expandY;
  maxY += expandY;

  const paddingX = 30;
  const paddingY = 30;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const width = cssWidth - paddingX * 2;
  const height = cssHeight - paddingY * 2;

  function toCanvasCoords(sample) {
    const planeY = getPlanarY(sample);
    const normX = (sample.x - minX) / rangeX;
    const normY = (planeY - minY) / rangeY;
    const x = paddingX + (1 - normX) * width;
    const y = cssHeight - paddingY - normY * height;
    return { x, y };
  }

  // Load and render track map (if available)
  if (lap.metadata?.track) {
    const trackMap = await loadTrackMapByName(lap.metadata.track);
    if (trackMap) {
      renderTrackLimits(ctx, trackMap, toCanvasCoords);
    }
  }

  telemetryState.laps.forEach((lapItem) => {
    if (!telemetryState.lapVisibility.has(lapItem.id)) return;
    const lapPoints = lapItem.samples.filter((s) => s.x != null && getPlanarY(s) != null);
    if (!lapPoints.length) return;
    const lapColor = getLapColor(lapItem.id);
    ctx.lineWidth = 2;
    ctx.strokeStyle = lapColor;
    ctx.globalAlpha = lapItem.id === lap.id ? 0.8 : 0.35;
    ctx.beginPath();
    lapPoints.forEach((sample, idx) => {
      const { x, y } = toCanvasCoords(sample);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
  ctx.globalAlpha = 1;

  if (windowEnd > windowStart) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = getLapColor(lap.id);
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    let drawing = false;
    activePoints.forEach((sample) => {
      if (sample.distance < windowStart || sample.distance > windowEnd) {
        drawing = false;
        return;
      }
      const { x, y } = toCanvasCoords(sample);
      if (!drawing) {
        ctx.moveTo(x, y);
        drawing = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  projectionState.sourceLapId = lap.id;
  projectionState.points = lap.samples
    .map((sample) => {
      const planeY = getPlanarY(sample);
      if (sample.x == null || planeY == null) return null;
      const { x, y } = toCanvasCoords(sample);
      return { distance: sample.distance, x, y };
    })
    .filter(Boolean);

  if (uiState.cursorDistance != null) {
    telemetryState.laps.forEach((lapItem) => {
      if (!telemetryState.lapVisibility.has(lapItem.id)) return;
      const sample = findSampleAtDistance(lapItem.samples, uiState.cursorDistance);
      const planeY = sample ? getPlanarY(sample) : null;
      if (sample && sample.x != null && planeY != null) {
        const { x, y } = toCanvasCoords(sample);
        ctx.fillStyle = getLapColor(lapItem.id);
        ctx.beginPath();
        ctx.arc(x, y, lapItem.id === lap.id ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  }
}

/**
 * Render track limit lines from track map data.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} trackMap - Track map data
 * @param {Function} transform - Transform function (world coords → canvas coords)
 */
function renderTrackLimits(ctx, trackMap, transform) {
  const { leftEdge, rightEdge, centerline } = trackMap;

  if (!leftEdge || !rightEdge) return;

  ctx.save();

  // Draw left edge
  ctx.strokeStyle = '#6b7280';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.4;
  ctx.setLineDash([]);
  ctx.beginPath();

  for (let i = 0; i < leftEdge.length; i++) {
    const [x, z] = leftEdge[i];
    const screen = transform({ x, z });
    if (i === 0) {
      ctx.moveTo(screen.x, screen.y);
    } else {
      ctx.lineTo(screen.x, screen.y);
    }
  }
  ctx.stroke();

  // Draw right edge
  ctx.beginPath();
  for (let i = 0; i < rightEdge.length; i++) {
    const [x, z] = rightEdge[i];
    const screen = transform({ x, z });
    if (i === 0) {
      ctx.moveTo(screen.x, screen.y);
    } else {
      ctx.lineTo(screen.x, screen.y);
    }
  }
  ctx.stroke();

  // Optionally draw centerline (dashed, subtle)
  if (centerline && centerline.length > 0) {
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();

    for (let i = 0; i < centerline.length; i++) {
      const [x, z] = centerline[i];
      const screen = transform({ x, z });
      if (i === 0) {
        ctx.moveTo(screen.x, screen.y);
      } else {
        ctx.lineTo(screen.x, screen.y);
      }
    }
    ctx.stroke();
  }

  ctx.restore();
}

export function initTrackHover({ setCursorDistance, setViewWindow }) {
  if (!elements?.trackCanvas) return;
  hoverDeps.setCursorDistance = setCursorDistance;
  hoverDeps.setViewWindow = setViewWindow ?? null;

  elements.trackCanvas.addEventListener('pointermove', handlePointerMove);
  elements.trackCanvas.addEventListener('pointerdown', handlePointerDown);
  elements.trackCanvas.addEventListener('pointerup', handlePointerUp);
  elements.trackCanvas.addEventListener('pointerleave', handlePointerLeave);
  elements.trackCanvas.addEventListener('pointercancel', handlePointerLeave);
  elements.trackCanvas.addEventListener('wheel', handleWheelZoom, { passive: false });
}

function handlePointerMove(event) {
  if (panState.active && event.pointerId === panState.pointerId) {
    handlePan(event);
    return;
  }
  updateCursorFromEvent(event);
}

function handlePointerDown(event) {
  if (event.button !== 0) return;
  const lap = getActiveLap();
  if (!lap) return;
  const bounds = getDistanceBounds(lap);
  panState.active = true;
  panState.pointerId = event.pointerId;
  panState.startX = event.clientX;
  panState.windowStart = bounds.start;
  panState.windowEnd = bounds.end;
  panState.minDistance = bounds.minDistance;
  panState.maxDistance = bounds.maxDistance;
  hoverDeps.setCursorDistance(null);
  try {
    event.target.setPointerCapture(event.pointerId);
  } catch {
    // Ignore capture failures.
  }
  event.target.style.cursor = 'grabbing';
}

function handlePointerUp(event) {
  if (panState.active && event.pointerId === panState.pointerId) {
    endPan(event);
  }
}

function handlePointerLeave(event) {
  if (panState.active && event.pointerId === panState.pointerId) {
    endPan(event);
  }
  hoverDeps.setCursorDistance(null);
}

function handleWheelZoom(event) {
  if (!hoverDeps.setViewWindow) return;
  const lap = getActiveLap();
  if (!lap) return;
  const bounds = getDistanceBounds(lap);
  const span = bounds.end - bounds.start || bounds.maxDistance - bounds.minDistance || 1;
  if (!Number.isFinite(span)) return;
  const zoomFactor = event.deltaY < 0 ? 0.85 : 1.15;
  let newSpan = span * zoomFactor;
  const totalSpan = bounds.maxDistance - bounds.minDistance || 1;
  const minSpan = Math.max(totalSpan * 0.02, 5);
  newSpan = Math.min(Math.max(newSpan, minSpan), totalSpan);
  const targetDistance = getPointerDistance(event) ?? bounds.start + span / 2;
  const ratio = newSpan / span;
  let newStart = targetDistance - (targetDistance - bounds.start) * ratio;
  let newEnd = newStart + newSpan;
  if (newStart < bounds.minDistance) {
    newStart = bounds.minDistance;
    newEnd = newStart + newSpan;
  }
  if (newEnd > bounds.maxDistance) {
    newEnd = bounds.maxDistance;
    newStart = newEnd - newSpan;
  }
  event.preventDefault();
  hoverDeps.setViewWindow(lap, newStart, newEnd);
}

function handlePan(event) {
  if (!hoverDeps.setViewWindow) return;
  const span = panState.windowEnd - panState.windowStart;
  if (!span) return;
  const rect = elements.trackCanvas.getBoundingClientRect();
  const dxRatio = rect.width ? (event.clientX - panState.startX) / rect.width : 0;
  const shift = -dxRatio * span;
  let newStart = panState.windowStart + shift;
  let newEnd = panState.windowEnd + shift;
  if (newStart < panState.minDistance) {
    newStart = panState.minDistance;
    newEnd = newStart + span;
  }
  if (newEnd > panState.maxDistance) {
    newEnd = panState.maxDistance;
    newStart = newEnd - span;
  }
  const lap = getActiveLap();
  if (!lap) return;
  hoverDeps.setViewWindow(lap, newStart, newEnd);
  event.preventDefault();
}

function endPan(event) {
  panState.active = false;
  if (panState.pointerId != null) {
    try {
      event.target.releasePointerCapture(panState.pointerId);
    } catch {
      // Ignore failures.
    }
  }
  panState.pointerId = null;
  event.target.style.cursor = '';
}

function updateCursorFromEvent(event) {
  const nearestDistance = getPointerDistance(event);
  if (nearestDistance != null) {
    hoverDeps.setCursorDistance(nearestDistance);
  } else {
    hoverDeps.setCursorDistance(null);
  }
}

function getPointerDistance(event) {
  const lap = getActiveLap();
  if (!lap || projectionState.sourceLapId !== lap.id || !projectionState.points.length) return null;
  const rect = elements.trackCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let nearest = null;
  let best = Infinity;
  for (const point of projectionState.points) {
    const dx = point.x - x;
    const dy = point.y - y;
    const dist = dx * dx + dy * dy;
    if (dist < best) {
      best = dist;
      nearest = point;
      if (dist < 25) break;
    }
  }
  return nearest ? nearest.distance : null;
}

function getDistanceBounds(lap) {
  const minDistance = lap.samples[0].distance;
  const maxDistance = lap.metadata.lapLength || lap.samples[lap.samples.length - 1].distance;
  const start = uiState.viewWindow?.start ?? minDistance;
  const end = uiState.viewWindow?.end ?? maxDistance;
  return { minDistance, maxDistance, start, end };
}
