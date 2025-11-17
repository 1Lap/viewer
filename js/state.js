import { PALETTE } from './config.js';

/** @typedef {import('./parser.js').Lap} Lap */
/** @typedef {import('./parser.js').LapSample} LapSample */

export const telemetryState = {
  laps: /** @type {Lap[]} */ ([]),
  lapVisibility: new Set(),
  lapColors: new Map(),
  lapOrder: /** @type {string[]} */ ([])
};

export const uiState = {
  activeLapId: /** @type {string|null} */ (null),
  viewWindow: /** @type {{start: number, end: number}|null} */ (null),
  cursorDistance: /** @type {number|null} */ (null),
  savedWindows: new Map(),
  persistentWindowRatio: /** @type {{startRatio: number, endRatio: number}|null} */ (null)
};

export const projectionState = {
  sourceLapId: /** @type {string|null} */ (null),
  points: /** @type {Array<{distance: number, x: number, y: number}>} */ ([])
};

export const chartRegistry = {
  throttle: /** @type {import('chart.js').Chart|null} */ (null),
  brake: /** @type {import('chart.js').Chart|null} */ (null)
};

export const state = {
  telemetry: telemetryState,
  ui: uiState,
  projection: projectionState,
  charts: chartRegistry
};

/**
 * Determine the paint colour assigned to a lap, generating one if needed.
 * @param {string} lapId
 * @returns {string}
 */
export function getLapColor(lapId) {
  if (!telemetryState.lapColors.has(lapId)) {
    const nextColor = PALETTE[telemetryState.lapColors.size % PALETTE.length];
    telemetryState.lapColors.set(lapId, nextColor);
  }
  return telemetryState.lapColors.get(lapId);
}

/**
 * Recompute lap colours so palette indices always follow lapOrder.
 */
export function syncLapColorsToOrder() {
  const orderedIds = telemetryState.lapOrder.length
    ? telemetryState.lapOrder.filter((lapId) => telemetryState.laps.some((lap) => lap.id === lapId))
    : telemetryState.laps.map((lap) => lap.id);

  telemetryState.lapColors.clear();
  orderedIds.forEach((lapId, index) => {
    const color = PALETTE[index % PALETTE.length];
    telemetryState.lapColors.set(lapId, color);
  });

  telemetryState.laps
    .map((lap) => lap.id)
    .filter((lapId) => !telemetryState.lapColors.has(lapId))
    .forEach((lapId) => {
      const color = PALETTE[telemetryState.lapColors.size % PALETTE.length];
      telemetryState.lapColors.set(lapId, color);
    });
}

/**
 * Retrieve the currently active lap, or fall back to the first loaded lap.
 * @returns {Lap|null}
 */
export function getActiveLap() {
  if (!telemetryState.laps.length) return null;
  if (!uiState.activeLapId) {
    return telemetryState.laps[0];
  }
  return (
    telemetryState.laps.find((lap) => lap.id === uiState.activeLapId) ||
    telemetryState.laps[0] ||
    null
  );
}

/**
 * Set the active lap identifier.
 * @param {string} lapId
 */
export function setActiveLapId(lapId) {
  uiState.activeLapId = lapId;
}

/**
 * Reset the shared runtime state, clearing laps and cached Chart.js instances.
 */
export function resetState() {
  telemetryState.laps = [];
  telemetryState.lapVisibility.clear();
  telemetryState.lapColors.clear();
  telemetryState.lapOrder = [];
  uiState.activeLapId = null;
  uiState.viewWindow = null;
  uiState.cursorDistance = null;
  uiState.savedWindows.clear();
  uiState.persistentWindowRatio = null;
  projectionState.sourceLapId = null;
  projectionState.points = [];
  Object.keys(chartRegistry).forEach((key) => {
    const chart = chartRegistry[key];
    if (chart && typeof chart.destroy === 'function') {
      chart.destroy();
    }
    chartRegistry[key] = null;
  });
}
