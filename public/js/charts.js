/* global Chart */
import { telemetryState, uiState, chartRegistry, getActiveLap, getLapColor } from './state.js';
import { CHART_BASE_OPTIONS } from './config.js';
import { formatLapLabel, interpolateLapValue } from './utils.js';

let setCursorDistance = () => {};
let setViewWindow = () => {};

const GEAR_SHIFT_MASK_DISTANCE = 1.2;

function colorWithAlpha(hexColor, alpha) {
  if (typeof hexColor !== 'string' || !hexColor.startsWith('#')) return hexColor;
  const normalized =
    hexColor.length === 4
      ? `#${[...hexColor.slice(1)].map((char) => char + char).join('')}`
      : hexColor;
  if (normalized.length !== 7) return hexColor;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const laneConfigs = [
  {
    key: 'throttle',
    canvasId: 'throttleLane',
    buildDatasets: buildThrottleDatasets,
    options: {}
  },
  {
    key: 'brake',
    canvasId: 'brakeLane',
    buildDatasets: createBasicDatasetBuilder('brake'),
    options: {}
  },
  {
    key: 'speed',
    canvasId: 'speedLane',
    buildDatasets: createBasicDatasetBuilder('speed', 'Speed'),
    options: {
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Speed (km/h)' }
        }
      }
    }
  },
  {
    key: 'rpm',
    canvasId: 'rpmLane',
    buildDatasets: createBasicDatasetBuilder('rpm', 'RPM'),
    options: {
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'RPM' },
          grid: { display: false }
        }
      }
    }
  },
  {
    key: 'gear',
    canvasId: 'gearLane',
    buildDatasets: buildGearDatasets,
    options: {
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 7,
          ticks: { stepSize: 1, precision: 0 },
          title: { display: true, text: 'Gear' }
        }
      }
    }
  },
  {
    key: 'steering',
    canvasId: 'steeringLane',
    buildDatasets: createBasicDatasetBuilder('steer', 'Steering'),
    options: {}
  },
  {
    key: 'delta',
    canvasId: 'deltaLane',
    buildDatasets: buildDeltaDatasets,
    options: {
      scales: {
        y: {
          title: { display: true, text: 'Delta (s)' },
          beginAtZero: false,
          grid: { color: '#eef1f6' }
        }
      }
    }
  }
];

export function initCharts(deps) {
  setCursorDistance = deps.setCursorDistance;
  setViewWindow = deps.setViewWindow;
  if (!window.Chart) return;

  Chart.register({
    id: 'sharedCursor',
    afterDatasetsDraw(chart) {
      if (uiState.cursorDistance == null) return;
      const xScale = chart.scales.x;
      if (!xScale) return;
      const xPixel = xScale.getPixelForValue(uiState.cursorDistance);
      if (Number.isNaN(xPixel)) return;
      const ctx = chart.ctx;
      ctx.save();
      const cursorColor =
        getComputedStyle(document.documentElement).getPropertyValue('--cursor-color')?.trim() ||
        '#f97316';
      ctx.strokeStyle = cursorColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.shadowColor =
        getComputedStyle(document.documentElement).getPropertyValue('--cursor-glow')?.trim() ||
        'rgba(249, 115, 22, 0.35)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(xPixel, chart.chartArea.top);
      ctx.lineTo(xPixel, chart.chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    }
  });
}

export function updateLaneData() {
  const visibleLaps = telemetryState.laps.filter((lap) => telemetryState.lapVisibility.has(lap.id));

  laneConfigs.forEach((config) => {
    const chart = ensureChart(config.key, config.canvasId, config.options);
    chart.data.datasets = visibleLaps.flatMap((lap) => config.buildDatasets(lap));
    if (config.key === 'delta') {
      applyDeltaScale(chart);
    }
    applyWindowToChart(chart);
  });
}

export function applyWindowToCharts() {
  Object.values(chartRegistry).forEach((chart) => chart && applyWindowToChart(chart));
}

export function refreshCharts() {
  Object.values(chartRegistry).forEach((chart) => chart && chart.update('none'));
}

function ensureChart(key, canvasId, laneOptions) {
  if (chartRegistry[key]) return chartRegistry[key];
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    throw new Error(`Canvas ${canvasId} not found`);
  }
  const ctx = canvas.getContext('2d');
  const overlay = document.createElement('div');
  overlay.className = 'lane-selection';
  ctx.canvas.parentElement.appendChild(overlay);

  const chart = new Chart(ctx, {
    type: 'line',
    data: { datasets: [] },
    options: mergeOptions(cloneChartOptions(), laneOptions)
  });

  const pointerState = { active: false, start: null, end: null };

  function getXValueFromEvent(event) {
    const rect = chart.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const xScale = chart.scales.x;
    if (!xScale) return null;
    const value = xScale.getValueForPixel(x);
    return Number.isFinite(value) ? value : null;
  }

  chart.canvas.addEventListener('mousemove', (event) => {
    const points = chart.getElementsAtEventForMode(event, 'nearest', { intersect: false }, true);
    const xValue = getXValueFromEvent(event);
    if (points.length) {
      const first = points[0];
      const point = chart.data.datasets[first.datasetIndex].data[first.index];
      setCursorDistance(point.x);
    } else if (xValue != null) {
      setCursorDistance(xValue);
    } else {
      setCursorDistance(null);
    }

    if (pointerState.active && xValue != null) {
      pointerState.end = xValue;
      setOverlayRange(chart, pointerState.start, pointerState.end, 0.4);
    }
  });

  chart.canvas.addEventListener('mouseleave', () => {
    setCursorDistance(null);
    if (!pointerState.active) {
      syncLaneSelectionOverlay(chart);
    }
  });

  chart.canvas.addEventListener('pointerdown', (event) => {
    const xValue = getXValueFromEvent(event);
    if (xValue == null) return;
    chart.canvas.setPointerCapture(event.pointerId);
    pointerState.active = true;
    pointerState.start = xValue;
    pointerState.end = xValue;
    setOverlayRange(chart, pointerState.start, pointerState.end, 0.5);
    setCursorDistance(xValue);
  });

  chart.canvas.addEventListener('pointermove', (event) => {
    if (!pointerState.active) return;
    const xValue = getXValueFromEvent(event);
    if (xValue == null) return;
    pointerState.end = xValue;
    setOverlayRange(chart, pointerState.start, pointerState.end, 0.5);
  });

  function endLaneDrag(event) {
    if (!pointerState.active) return;
    const xValue = getXValueFromEvent(event);
    if (xValue != null) {
      pointerState.end = xValue;
    }
    pointerState.active = false;
    try {
      chart.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore release failures – pointer may already be uncaptured.
    }
    syncLaneSelectionOverlay(chart);
    if (pointerState.start != null && pointerState.end != null) {
      const lap = getActiveLap();
      if (lap) {
        let start = Math.min(pointerState.start, pointerState.end);
        let end = Math.max(pointerState.start, pointerState.end);
        if (Math.abs(end - start) < 0.5) {
          const center = (start + end) / 2;
          start = center - 0.25;
          end = center + 0.25;
        }
        setViewWindow(lap, start, end);
      }
    }
    pointerState.start = null;
    pointerState.end = null;
  }

  chart.canvas.addEventListener('pointerup', endLaneDrag);
  chart.canvas.addEventListener('pointerleave', endLaneDrag);

  chart._selectionOverlay = overlay;
  chartRegistry[key] = chart;
  return chart;
}

function setOverlayRange(chart, startValue, endValue, opacity = 0.25) {
  const overlay = chart?._selectionOverlay;
  if (!overlay) return;
  if (startValue == null || endValue == null) {
    overlay.style.opacity = 0;
    return;
  }
  const xScale = chart.scales.x;
  if (!xScale) {
    overlay.style.opacity = 0;
    return;
  }
  const left = xScale.getPixelForValue(startValue);
  const right = xScale.getPixelForValue(endValue);
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    overlay.style.opacity = 0;
    return;
  }
  overlay.style.opacity = opacity;
  overlay.style.left = `${Math.min(left, right)}px`;
  overlay.style.width = `${Math.max(2, Math.abs(right - left))}px`;
}

function syncLaneSelectionOverlay(chart) {
  const lap = getActiveLap();
  if (!lap || !uiState.viewWindow) {
    setOverlayRange(chart, null, null);
    return;
  }

  // Hide overlay if viewing the full lap
  const minDistance = lap.samples[0].distance;
  const maxDistance = lap.samples[lap.samples.length - 1].distance;
  const tolerance = Math.max(1, (maxDistance - minDistance) * 0.01);
  const isFullLap =
    Math.abs(uiState.viewWindow.start - minDistance) <= tolerance &&
    Math.abs(uiState.viewWindow.end - maxDistance) <= tolerance;

  if (isFullLap) {
    setOverlayRange(chart, null, null);
    return;
  }

  setOverlayRange(chart, uiState.viewWindow.start, uiState.viewWindow.end, 0.2);
}

function applyWindowToChart(chart) {
  if (!chart) return;
  const lap = getActiveLap();
  if (!lap) {
    chart.update('none');
    return;
  }
  const start = uiState.viewWindow?.start ?? lap.samples[0].distance;
  const end = uiState.viewWindow?.end ?? lap.samples[lap.samples.length - 1].distance;
  chart.options.scales.x.min = start;
  chart.options.scales.x.max = end;
  chart.update('none');
  syncLaneSelectionOverlay(chart);
}

function cloneChartOptions() {
  return typeof structuredClone === 'function'
    ? structuredClone(CHART_BASE_OPTIONS)
    : JSON.parse(JSON.stringify(CHART_BASE_OPTIONS));
}

function mergeOptions(base, overrides = {}) {
  if (!overrides) return base;
  Object.entries(overrides).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      base[key] = mergeOptions(base[key] || {}, value);
    } else {
      base[key] = value;
    }
  });
  return base;
}

function createBasicDatasetBuilder(sampleKey, labelSuffix = '') {
  return (lap) => {
    const data = lap.samples
      .filter((s) => s[sampleKey] != null)
      .map((s) => ({ x: s.distance, y: s[sampleKey] }));
    if (!data.length) return [];
    const label = labelSuffix ? `${formatLapLabel(lap)} ${labelSuffix}` : formatLapLabel(lap);
    return [
      {
        label,
        borderColor: getLapColor(lap.id),
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        cubicInterpolationMode: 'monotone',
        tension: 0.3,
        spanGaps: false,
        data
      }
    ];
  };
}

function buildGearDatasets(lap) {
  const color = getLapColor(lap.id);
  const gearSamples = lap.samples
    .filter((sample) => sample.gear != null && sample.distance != null)
    .map((sample) => ({ x: sample.distance, y: sample.gear }));
  if (!gearSamples.length) return [];
  return [
    {
      label: `${formatLapLabel(lap)} gear`,
      borderColor: color,
      backgroundColor: colorWithAlpha(color, 0.2),
      borderWidth: 1.5,
      pointRadius: 0,
      stepped: true,
      fill: 'origin',
      tension: 0,
      data: gearSamples
    }
  ];
}

function buildDeltaDatasets(lap) {
  const reference = getActiveLap();
  if (!reference || !reference.samples.length || !lap.samples.length) return [];
  const hasComparison = telemetryState.laps.some(
    (candidate) => candidate.id !== reference.id && telemetryState.lapVisibility.has(candidate.id)
  );
  if (lap.id === reference.id) {
    if (!hasComparison) return [];
    return [
      {
        label: `${formatLapLabel(reference)} (reference)`,
        borderColor: '#94a3b8',
        borderDash: [6, 4],
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        pointRadius: 0,
        data: buildZeroLine(reference.samples)
      }
    ];
  }
  const deltaData = computeDeltaDataset(reference, lap);
  if (!deltaData.length) return [];
  return [
    {
      label: `${formatLapLabel(lap)} delta`,
      borderColor: getLapColor(lap.id),
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      data: deltaData
    }
  ];
}

function buildZeroLine(samples) {
  return samples.map((sample) => ({ x: sample.distance, y: 0 }));
}

function computeDeltaDataset(referenceLap, comparisonLap) {
  const refSamples = referenceLap.samples;
  const comparisonSamples = comparisonLap.samples;
  if (!refSamples.length || !comparisonSamples.length) return [];
  const comparisonMin = comparisonSamples[0].distance;
  const comparisonMax = comparisonSamples[comparisonSamples.length - 1].distance;
  if (comparisonMin == null || comparisonMax == null) return [];
  const result = [];
  refSamples.forEach((sample) => {
    if (
      sample.distance == null ||
      sample.distance < comparisonMin ||
      sample.distance > comparisonMax ||
      sample.time == null
    ) {
      return;
    }
    const comparisonTime = interpolateLapValue(comparisonSamples, sample.distance, 'time');
    if (comparisonTime == null) return;
    result.push({ x: sample.distance, y: comparisonTime - sample.time });
  });
  return result;
}

function applyDeltaScale(chart) {
  if (!chart?.options?.scales?.y) return;
  const values = chart.data.datasets.flatMap((dataset) =>
    Array.isArray(dataset.data)
      ? dataset.data.map((point) => point?.y).filter((value) => Number.isFinite(value))
      : []
  );
  const maxMagnitude = values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const range = maxMagnitude > 0 ? maxMagnitude * 1.1 : 1;
  chart.options.scales.y.min = -range;
  chart.options.scales.y.max = range;
}

function buildThrottleDatasets(lap) {
  const color = getLapColor(lap.id);
  const samples = buildMaskedThrottleData(lap.samples);
  if (!samples.length) return [];
  return [
    {
      label: formatLapLabel(lap),
      borderColor: color,
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      cubicInterpolationMode: 'monotone',
      tension: 0.3,
      spanGaps: true,
      data: samples
    }
  ];
}

function buildMaskedThrottleData(samples) {
  if (!samples?.length) return [];
  const windows = computeShiftWindows(samples, GEAR_SHIFT_MASK_DISTANCE);
  const data = [];
  let windowIndex = 0;
  samples.forEach((sample) => {
    if (sample.throttle == null || sample.distance == null) return;
    while (windowIndex < windows.length && sample.distance > windows[windowIndex].end) {
      windowIndex++;
    }
    const inWindow =
      windowIndex < windows.length &&
      sample.distance >= windows[windowIndex].start &&
      sample.distance <= windows[windowIndex].end;
    data.push({ x: sample.distance, y: inWindow ? null : sample.throttle });
  });
  return data;
}

function computeShiftWindows(samples, windowSizeMeters) {
  if (!samples?.length) return [];
  const windows = [];
  let previousGear = null;
  samples.forEach((sample) => {
    const gear = sample.gear;
    if (gear == null) return;
    if (previousGear != null && gear !== previousGear && sample.distance != null) {
      const center = sample.distance;
      windows.push({
        start: Math.max(0, center - windowSizeMeters),
        end: center + windowSizeMeters
      });
    }
    previousGear = gear;
  });
  if (!windows.length) return windows;
  windows.sort((a, b) => a.start - b.start);
  const merged = [windows[0]];
  for (let i = 1; i < windows.length; i++) {
    const last = merged[merged.length - 1];
    const current = windows[i];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }
  return merged;
}
