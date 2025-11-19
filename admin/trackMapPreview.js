import { parseLapFile } from '../js/parser.js';
import { resampleCalibrationLaps } from '../js/trackMapGenerator/resampler.js';
import { validateCenterline } from '../js/trackMapGenerator/centerline.js';
import { computeGeometry, computeSignedAngles } from '../js/trackMapGenerator/geometry.js';
import {
  calculateWidths,
  detectWidthOutliers,
  clampWidths,
  computeTargetWidth,
  buildConstantWidthEnvelope
} from '../js/trackMapGenerator/width.js';
import { smoothCenterline, smoothWidths } from '../js/trackMapGenerator/smoothing.js';
import { generateEdges, validateEdges } from '../js/trackMapGenerator/edges.js';
import { createTrackMapData, generateSummary } from '../js/trackMapGenerator/exporter.js';
import { enforceWidthConstraints } from '../js/trackMapGenerator/constraints.js';
import { buildCenterSplineSamples } from '../js/trackMapGenerator/spline.js';

const PREVIEW_STORAGE_KEY = 'trackMapPreview';

const elements = {
  fileInput: document.getElementById('fileInput'),
  fileList: document.getElementById('fileList'),
  trackInfo: document.getElementById('trackInfo'),
  samplesInput: document.getElementById('samplesInput'),
  smoothInput: document.getElementById('smoothInput'),
  clampInput: document.getElementById('clampInput'),
  guardrailToggle: document.getElementById('guardrailToggle'),
  generateBtn: document.getElementById('generateBtn'),
  statusMessage: document.getElementById('statusMessage'),
  summaryOutput: document.getElementById('summaryOutput'),
  canvas: document.getElementById('previewCanvas'),
  downloadBtn: document.getElementById('downloadBtn'),
  openSpaBtn: document.getElementById('openSpaBtn'),
  previewHint: document.getElementById('previewHint')
};

const state = {
  files: [],
  trackMapData: null,
  guardrailStats: null
};

elements.fileInput.addEventListener('change', handleFileSelection);
elements.generateBtn.addEventListener('click', handleGenerate);
elements.downloadBtn.addEventListener('click', handleDownload);
elements.openSpaBtn.addEventListener('click', handleOpenSpa);

function setStatus(message, isWarning = false) {
  elements.statusMessage.textContent = message || '';
  elements.statusMessage.classList.toggle('warning', Boolean(isWarning));
}

function normalizeTrackId(trackName) {
  return trackName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function guessTypeFromName(name) {
  const lower = name.toLowerCase();
  if (lower.includes('left')) return 'left';
  if (lower.includes('right')) return 'right';
  if (lower.includes('center') || lower.includes('centre') || lower.includes('middle')) {
    return 'center';
  }
  return '';
}

async function handleFileSelection(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    state.files = [];
    renderFileList();
    return;
  }
  setStatus('Parsing telemetry files...');

  const parsed = [];
  const errors = [];

  for (const file of files) {
    try {
      const text = await file.text();
      const lap = parseLapFile(text, file.name);
      parsed.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        name: file.name,
        lap,
        type: guessTypeFromName(file.name),
        trackName: lap?.metadata?.track || 'Unknown',
        sampleCount: lap.samples.length
      });
    } catch (error) {
      errors.push(`${file.name}: ${error.message}`);
    }
  }

  state.files = parsed;
  state.trackMapData = null;
  state.guardrailStats = null;
  updateActionButtons();
  renderFileList();
  renderTrackInfo();
  renderCanvas(null, []);
  elements.summaryOutput.textContent = 'No preview generated yet.';

  if (errors.length) {
    setStatus(`Some files failed to parse:\n${errors.join('\n')}`, true);
  } else {
    setStatus(`Loaded ${parsed.length} file(s).`);
  }

  elements.generateBtn.disabled = !parsed.length;
}

function renderTrackInfo() {
  if (!state.files.length) {
    elements.trackInfo.textContent = '';
    return;
  }
  const tracks = Array.from(
    new Set(state.files.map((file) => file.trackName || 'Unknown track'))
  ).filter(Boolean);
  if (tracks.length === 1) {
    elements.trackInfo.textContent = `Track detected: ${tracks[0]}`;
  } else {
    elements.trackInfo.textContent = `Multiple track names detected: ${tracks.join(', ')}`;
  }
}

function renderFileList() {
  if (!state.files.length) {
    elements.fileList.innerHTML =
      '<p style="color:#94a3b8;font-size:14px;">No calibration laps loaded yet.</p>';
    return;
  }

  const header =
    '<tr><th>File</th><th>Track</th><th>Samples</th><th>Assign role</th><th>Lap length</th></tr>';

  const rows = state.files
    .map((file) => {
      const lapLength = file.lap?.metadata?.lapLength;
      const lengthLabel =
        lapLength && Number.isFinite(lapLength) ? `${lapLength.toFixed(1)} m` : '—';
      return `<tr>
        <td>${file.name}</td>
        <td>${file.trackName || 'Unknown'}</td>
        <td>${file.sampleCount}</td>
        <td>
          <select data-id="${file.id}">
            <option value="">Unassigned</option>
            <option value="left"${file.type === 'left' ? ' selected' : ''}>Left limit</option>
            <option value="right"${file.type === 'right' ? ' selected' : ''}>Right limit</option>
            <option value="center"${file.type === 'center' ? ' selected' : ''}>Center</option>
          </select>
        </td>
        <td>${lengthLabel}</td>
      </tr>`;
    })
    .join('');

  elements.fileList.innerHTML = `<table>${header}${rows}</table>`;
  elements.fileList.querySelectorAll('select').forEach((select) => {
    select.addEventListener('change', (event) => {
      const { id } = event.target.dataset;
      const file = state.files.find((entry) => entry.id === id);
      if (file) {
        file.type = event.target.value;
      }
    });
  });
}

function ensureAssignments() {
  const classified = state.files.filter((file) => file.type === 'left' || file.type === 'right' || file.type === 'center');
  const left = classified.find((file) => file.type === 'left');
  const right = classified.find((file) => file.type === 'right');

  if (!left || !right) {
    throw new Error('Assign at least one left-limit lap and one right-limit lap.');
  }

  const trackNames = new Set(classified.map((file) => file.trackName));
  if (trackNames.size > 1) {
    throw new Error(
      `All assigned laps must be from the same track. Currently detected: ${Array.from(
        trackNames
      ).join(', ')}`
    );
  }

  const trackName = left.trackName || right.trackName;
  if (!trackName) {
    throw new Error('Track metadata missing from calibration laps.');
  }

  return {
    trackName,
    trackId: normalizeTrackId(trackName),
    laps: classified.map((file) => ({
      type: file.type,
      filename: file.name,
      lap: file.lap
    }))
  };
}

async function handleGenerate() {
  try {
    const { trackName, trackId, laps } = ensureAssignments();
    const sampleCount = clampNumber(parseInt(elements.samplesInput.value, 10), 256, 4096, 1024);
    const smoothWindow = clampNumber(parseInt(elements.smoothInput.value, 10), 5, 200, 30);
    const clampPercent = clampNumber(parseFloat(elements.clampInput.value), 10, 120, 100);
    const guardrailsEnabled = Boolean(elements.guardrailToggle?.checked);

    setStatus('Processing calibration laps...');

    const { grids, rawSamples } = resampleCalibrationLaps(laps, { sampleCount });
    const splineSamples = buildCenterSplineSamples(grids, sampleCount);
    const centerlineRaw = splineSamples.centerline;
    const centerlineValidation = validateCenterline(centerlineRaw);
    const centerline = smoothCenterline(centerlineRaw, smoothWindow);
    const { normals } = computeGeometry(centerline);
    const signedAngles = computeSignedAngles(centerline);
    const widthResult = calculateWidths(centerline, normals, {
      left: splineSamples.leftSamples,
      right: splineSamples.rightSamples
    });
    const targetWidth = computeTargetWidth(widthResult.halfWidthLeft, widthResult.halfWidthRight);
    const constantEnvelope = buildConstantWidthEnvelope(
      widthResult.halfWidthLeft,
      widthResult.halfWidthRight,
      signedAngles,
      targetWidth
    );
    const outlierReport = detectWidthOutliers(
      constantEnvelope.halfWidthLeft,
      constantEnvelope.halfWidthRight
    );
    const clamped = clampWidths(constantEnvelope.halfWidthLeft, constantEnvelope.halfWidthRight);
    const smoothed = smoothWidths(clamped.halfWidthLeft, clamped.halfWidthRight, smoothWindow);
    const extraWindow = Math.max(5, Math.round(smoothWindow / 2));
    const extraSmoothed = smoothWidths(
      smoothed.halfWidthLeft,
      smoothed.halfWidthRight,
      extraWindow
    );
    let constrained = {
      halfWidthLeft: smoothed.halfWidthLeft,
      halfWidthRight: smoothed.halfWidthRight,
      stats: null
    };
    if (guardrailsEnabled) {
      constrained = enforceWidthConstraints({
        centerline,
        normals,
        rawSamples,
        halfWidthLeft: extraSmoothed.halfWidthLeft,
        halfWidthRight: extraSmoothed.halfWidthRight,
        clampScale: clampPercent / 100
      });
    }
    const { leftEdge, rightEdge } = generateEdges(
      centerline,
      normals,
      constrained.halfWidthLeft,
      constrained.halfWidthRight
    );
    const edgeValidation = validateEdges(leftEdge, rightEdge);

    const calibrationLaps = {
      left: laps.find((lap) => lap.type === 'left')?.filename || null,
      center: laps.find((lap) => lap.type === 'center')?.filename || null,
      right: laps.find((lap) => lap.type === 'right')?.filename || null
    };

    const trackMapData = createTrackMapData({
      sim: 'lmu',
      trackId,
      trackName,
      sampleCount,
      centerline,
      halfWidthLeft: constrained.halfWidthLeft,
      halfWidthRight: constrained.halfWidthRight,
      leftEdge,
      rightEdge,
      smoothingWindow: smoothWindow,
      calibrationLaps
    });

    const enrichedTrackMap = {
      ...trackMapData,
      metadata: {
        ...(trackMapData.metadata || {}),
        leftControlCount: splineSamples.metadata.leftControlCount,
        rightControlCount: splineSamples.metadata.rightControlCount,
        centerControlCount: splineSamples.metadata.centerControlCount,
        algorithm: 'center-spline + constant-width',
        targetWidth,
        insideLeftCount: constantEnvelope.stats.insideLeftCount,
        insideRightCount: constantEnvelope.stats.insideRightCount,
        guardrailClamps: constrained.stats
      }
    };
    state.trackMapData = enrichedTrackMap;
    state.guardrailStats = constrained.stats;
    updateActionButtons();
    renderCanvas(trackMapData, laps);
    renderSummary(
      enrichedTrackMap,
      centerlineValidation,
      outlierReport,
      edgeValidation,
      constrained.stats
    );
    setStatus(`Generated track map for ${trackName}.`);
  } catch (error) {
    setStatus(error.message, true);
    state.trackMapData = null;
    state.guardrailStats = null;
    updateActionButtons();
    renderCanvas(null, []);
  }
}

function renderSummary(
  trackMapData,
  centerlineValidation,
  outlierReport,
  edgeValidation,
  guardrailStats
) {
  if (!trackMapData) {
    elements.summaryOutput.textContent = 'No preview generated yet.';
    return;
  }

  const summaryChunks = [generateSummary(trackMapData)];

  if (!centerlineValidation.valid && centerlineValidation.errors.length) {
    summaryChunks.push(
      'Centerline warnings:\n' +
        centerlineValidation.errors.map((err) => `  - ${err}`).join('\n')
    );
  }

  if (outlierReport.outliers.length) {
    summaryChunks.push(
      `Width outliers (${outlierReport.outliers.length}):\n` +
        outlierReport.outliers
          .slice(0, 5)
          .map((o) => `  - Point ${o.index}: ${o.reason}`)
          .join('\n')
    );
  }

  if (!edgeValidation.valid && edgeValidation.warnings.length) {
    summaryChunks.push(
      'Edge warnings:\n' + edgeValidation.warnings.map((warn) => `  - ${warn}`).join('\n')
    );
  }

  if (guardrailStats && (guardrailStats.leftClamped || guardrailStats.rightClamped)) {
    summaryChunks.push(
      `Guardrails: clamp ${guardrailStats.clampScale * 100}% span → adjusted ${guardrailStats.leftClamped} left / ${guardrailStats.rightClamped} right samples`
    );
  }

  elements.summaryOutput.textContent = summaryChunks.join('\n\n');
}

function renderCanvas(trackMapData, laps) {
  const canvas = elements.canvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#010409';
  ctx.fillRect(0, 0, width, height);

  if (!trackMapData || !laps.length) {
    ctx.fillStyle = '#475569';
    ctx.font = '16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Load calibration laps and generate a preview.', width / 2, height / 2);
    return;
  }

  const rawPaths = laps.map((entry) => ({
    type: entry.type,
    points: entry.lap.samples
      .filter((sample) => sample.x != null && (sample.z != null || sample.y != null))
      .map((sample) => [sample.x, sample.z != null ? sample.z : sample.y])
  }));

  const edges = [
    ...(trackMapData.leftEdge || []),
    ...(trackMapData.rightEdge || []),
    ...(trackMapData.centerline || [])
  ];

  const bounds = computeBounds([...edges, ...rawPaths.flatMap((path) => path.points)]);
  const toCanvas = createProjector(bounds, width, height);

  // Draw generated edges
  drawPolyline(ctx, trackMapData.leftEdge, toCanvas, '#64748b', 2, 0.45);
  drawPolyline(ctx, trackMapData.rightEdge, toCanvas, '#64748b', 2, 0.45);
  drawPolyline(ctx, trackMapData.centerline, toCanvas, '#cbd5f5', 1.5, 0.25, [6, 6]);

  const markerStats = state.guardrailStats;
  if (markerStats) {
    const leftMarkers = markerStats.leftIndices || [];
    const rightMarkers = markerStats.rightIndices || [];
    if (leftMarkers.length) {
      ctx.fillStyle = '#f97316';
      leftMarkers.forEach((idx) => {
        if (!trackMapData.leftEdge[idx]) return;
        const [mx, my] = toCanvas(trackMapData.leftEdge[idx]);
        ctx.beginPath();
        ctx.arc(mx, my, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    if (rightMarkers.length) {
      ctx.fillStyle = '#facc15';
      rightMarkers.forEach((idx) => {
        if (!trackMapData.rightEdge[idx]) return;
        const [mx, my] = toCanvas(trackMapData.rightEdge[idx]);
        ctx.beginPath();
        ctx.arc(mx, my, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  // Draw raw laps
  const colors = {
    left: '#f43f5e',
    center: '#fbbf24',
    right: '#38bdf8'
  };
  rawPaths.forEach((path) => {
    if (path.points.length < 2) return;
    const color = colors[path.type] || '#a78bfa';
    drawPolyline(ctx, path.points, toCanvas, color, 1.5, 0.8);
  });

  // Legend
  ctx.font = '13px Inter, sans-serif';
  ctx.textAlign = 'left';
  const legendEntries = [
    { label: 'Left (raw)', color: colors.left },
    { label: 'Center (raw)', color: colors.center },
    { label: 'Right (raw)', color: colors.right },
    { label: 'Generated edges', color: '#94a3b8' }
  ];
  if (markerStats && (markerStats.leftClamped || markerStats.rightClamped)) {
    legendEntries.push({ label: 'Guardrail clamp', color: '#f97316' });
  }
  legendEntries.forEach((entry, idx) => {
    ctx.fillStyle = entry.color;
    ctx.fillRect(20, 20 + idx * 18, 14, 4);
    ctx.fillStyle = '#cbd5f5';
    ctx.fillText(entry.label, 40, 24 + idx * 18);
  });
}

function computeBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach(([x, y]) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    minX = minY = 0;
    maxX = maxY = 1;
  }
  return { minX, minY, maxX, maxY };
}

function createProjector(bounds, width, height) {
  const padding = 40;
  const drawableWidth = Math.max(width - padding * 2, 10);
  const drawableHeight = Math.max(height - padding * 2, 10);
  const rangeX = Math.max(bounds.maxX - bounds.minX, 1);
  const rangeY = Math.max(bounds.maxY - bounds.minY, 1);
  return ([x, y]) => {
    const normX = (x - bounds.minX) / rangeX;
    const normY = (y - bounds.minY) / rangeY;
    const canvasX = padding + normX * drawableWidth;
    const canvasY = height - padding - normY * drawableHeight;
    return [canvasX, canvasY];
  };
}

function drawPolyline(ctx, points, projector, strokeStyle, lineWidth = 1, alpha = 1, dash = []) {
  if (!points || points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.beginPath();
  points.forEach((point, idx) => {
    const [x, y] = projector(point);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function updateActionButtons() {
  const enabled = Boolean(state.trackMapData);
  elements.downloadBtn.disabled = !enabled;
  elements.openSpaBtn.disabled = !enabled;
  elements.previewHint.textContent = enabled
    ? `Ready: ${state.trackMapData.trackId}.`
    : 'Preview buttons unlock after generating a map.';
}

function handleDownload() {
  if (!state.trackMapData) return;
  const json = JSON.stringify(state.trackMapData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${state.trackMapData.trackId}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function handleOpenSpa() {
  if (!state.trackMapData) return;
  const payload = {
    trackId: state.trackMapData.trackId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 6 * 60 * 60 * 1000, // 6 hours
    trackMap: state.trackMapData
  };
  try {
    localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(payload));
    window.open('../index.html', '_blank', 'noopener');
  } catch (error) {
    setStatus(`Failed to store preview for SPA: ${error.message}`, true);
  }
}
