import { elements } from './elements.js';
import { telemetryState, uiState, projectionState, getLapColor, getActiveLap } from './state.js';
import { findSampleAtDistance } from './utils.js';

export function renderTrackMap(lap) {
  if (!elements?.trackCanvas) return;
  const canvas = elements.trackCanvas;
  const ctx = canvas.getContext('2d');
  const { clientWidth, clientHeight } = canvas;
  if (!clientWidth || !clientHeight) return;
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = Math.floor(clientWidth * dpr);
  const displayHeight = Math.floor(clientHeight * dpr);
  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, clientWidth, clientHeight);
  if (!lap || !telemetryState.lapVisibility.size) {
    ctx.fillStyle = '#adb3c2';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Load a lap to view the track map', clientWidth / 2, clientHeight / 2);
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
  const width = clientWidth - paddingX * 2;
  const height = clientHeight - paddingY * 2;

  function toCanvasCoords(sample) {
    const planeY = getPlanarY(sample);
    const normX = (sample.x - minX) / rangeX;
    const normY = (planeY - minY) / rangeY;
    const x = paddingX + (1 - normX) * width;
    const y = clientHeight - paddingY - normY * height;
    return { x, y };
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

export function initTrackHover({ setCursorDistance }) {
  if (!elements?.trackCanvas) return;
  elements.trackCanvas.addEventListener('mousemove', (event) => {
    const lap = getActiveLap();
    if (!lap || projectionState.sourceLapId !== lap.id || !projectionState.points.length) return;
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
    if (nearest) {
      setCursorDistance(nearest.distance);
    } else {
      setCursorDistance(null);
    }
  });

  elements.trackCanvas.addEventListener('mouseleave', () => setCursorDistance(null));
}
