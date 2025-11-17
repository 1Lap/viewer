import { loadLapFiles } from './fileLoader.js';
import { elements, initDomElements } from './elements.js';
import {
  telemetryState,
  uiState,
  getActiveLap,
  setActiveLapId,
  resetState,
  syncLapColorsToOrder
} from './state.js';
import { updateMetadata } from './metadata.js';
import { initCharts, updateLaneData, applyWindowToCharts, refreshCharts } from './charts.js';
import { renderTrackMap, initTrackHover } from './trackMap.js';
import {
  initProgressControls,
  updateProgressWindow,
  updateSectorCursor,
  renderSectorButtons
} from './progress.js';
import { initLapListInteractions, renderLapList } from './lapList.js';
import { showMessage, showError } from './notifications.js';

const PREFS_KEY = 'lmuLapViewerPrefs';
let preferences = loadPreferences();
if (preferences.windowRatio) {
  uiState.persistentWindowRatio = preferences.windowRatio;
}

function bootstrap() {
  initDomElements();

  initCharts({ setCursorDistance, setViewWindow });
  initTrackHover({ setCursorDistance, setViewWindow });
  initProgressControls({ getActiveLap, setViewWindow, setCursorDistance });
  initLapListInteractions({
    activateLap,
    handleVisibilityChange,
    moveLap
  });

  if (elements.dropzone) {
    elements.dropzone.addEventListener('click', () => elements.fileInput?.click());
    elements.dropzone.addEventListener('dragover', (event) => {
      event.preventDefault();
      elements.dropzone.classList.add('dragover');
    });
    elements.dropzone.addEventListener('dragleave', () =>
      elements.dropzone.classList.remove('dragover')
    );
    elements.dropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      elements.dropzone.classList.remove('dragover');
      const files = Array.from(event.dataTransfer.files);
      if (!files.length) return;
      handleFiles(files);
    });
  }

  if (elements.fileInput) {
    elements.fileInput.addEventListener('change', (event) => {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;
      handleFiles(files);
      elements.fileInput.value = '';
    });
  }

  elements.clearLapsBtn?.addEventListener('click', () => clearLaps());

  renderTrackMap(null);
  renderLapList();
  renderSectorButtons(null);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => bootstrap(), { once: true });
} else {
  bootstrap();
}

async function handleFiles(files) {
  if (!files.length) return;
  showMessage('Loading...');

  const { loadedCount, failedCount, lastLoadedId, errors } = await loadLapFiles(files);

  if (lastLoadedId) {
    activateLap(lastLoadedId);
  } else if (!telemetryState.laps.length) {
    clearLaps();
  } else {
    renderLapList();
  }

  errors.forEach(({ fileName, error }) =>
    showError(`Failed to load ${fileName}. Check console for details.`, error)
  );

  const messages = [];
  if (loadedCount) messages.push(`Loaded ${loadedCount} lap${loadedCount === 1 ? '' : 's'}.`);
  if (failedCount && !errors.length) {
    messages.push(`Failed ${failedCount}. Check console for details.`);
  }
  if (!messages.length) messages.push('No laps loaded.');
  showMessage(messages.join(' '), failedCount ? 'warning' : 'info');
}

function setViewWindow(lap, start, end) {
  if (!lap) {
    uiState.viewWindow = null;
    updateProgressWindow(null);
    renderTrackMap(null);
    renderSectorButtons(null);
    applyWindowToCharts();
    return;
  }
  const minDistance = lap.samples[0].distance;
  const maxDistance = lap.metadata.lapLength || lap.samples[lap.samples.length - 1].distance;
  const windowStart = start ?? minDistance;
  const windowEnd = end ?? maxDistance;
  uiState.viewWindow = {
    start: Math.max(minDistance, Math.min(maxDistance, windowStart)),
    end: Math.max(minDistance, Math.min(maxDistance, windowEnd))
  };
  uiState.savedWindows.set(lap.id, { ...uiState.viewWindow });
  persistWindowPreference(lap, uiState.viewWindow);
  updateProgressWindow(lap);
  renderTrackMap(lap);
  renderSectorButtons(lap);
  applyWindowToCharts();
}

function setCursorDistance(distance) {
  uiState.cursorDistance = distance;
  renderTrackMap(getActiveLap());
  updateSectorCursor(distance);
  refreshCharts();
}

function activateLap(lapId) {
  const lap = telemetryState.laps.find((l) => l.id === lapId);
  if (!lap) return;
  setActiveLapId(lapId);
  uiState.cursorDistance = null;
  telemetryState.lapVisibility.add(lapId);
  const savedWindow = uiState.savedWindows.get(lap.id);
  if (savedWindow) {
    setViewWindow(lap, savedWindow.start, savedWindow.end);
  } else if (!applyPersistentWindow(lap)) {
    setViewWindow(lap);
  }
  updateMetadata();
  updateLaneData();
  renderLapList();
}

function handleVisibilityChange(lapId, visible) {
  if (visible) {
    telemetryState.lapVisibility.add(lapId);
  } else {
    telemetryState.lapVisibility.delete(lapId);
    if (!telemetryState.lapVisibility.size && uiState.activeLapId) {
      telemetryState.lapVisibility.add(uiState.activeLapId);
    }
  }
  updateLaneData();
  renderTrackMap(getActiveLap());
  renderLapList();
}

function moveLap(lapId, direction) {
  const order = telemetryState.lapOrder;
  const index = order.indexOf(lapId);
  if (index === -1) return;
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= order.length) return;
  [order[index], order[targetIndex]] = [order[targetIndex], order[index]];
  syncLapColorsToOrder();
  renderLapList();
  updateLaneData();
}

function clearLaps() {
  resetState();
  updateMetadata(null);
  updateLaneData();
  renderTrackMap(null);
  updateProgressWindow(null);
  renderSectorButtons(null);
  renderLapList();
  showMessage('Cleared all laps.', 'success');
}

function persistWindowPreference(lap, window) {
  if (!lap || !window) return;
  const minDistance = lap.samples[0].distance;
  const maxDistance = lap.metadata.lapLength || lap.samples[lap.samples.length - 1].distance;
  const span = maxDistance - minDistance || 1;
  const ratio = {
    startRatio: Math.max(0, Math.min(1, (window.start - minDistance) / span)),
    endRatio: Math.max(0, Math.min(1, (window.end - minDistance) / span))
  };
  uiState.persistentWindowRatio = ratio;
  savePreferences({ windowRatio: ratio });
}

function applyPersistentWindow(lap) {
  if (!uiState.persistentWindowRatio) return false;
  const range = getWindowFromRatio(lap, uiState.persistentWindowRatio);
  setViewWindow(lap, range.start, range.end);
  return true;
}

function getWindowFromRatio(lap, ratio) {
  const minDistance = lap.samples[0].distance;
  const maxDistance = lap.metadata.lapLength || lap.samples[lap.samples.length - 1].distance;
  const span = maxDistance - minDistance || 1;
  return {
    start: minDistance + span * Math.max(0, Math.min(1, ratio.startRatio)),
    end: minDistance + span * Math.max(0, Math.min(1, ratio.endRatio))
  };
}

function loadPreferences() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePreferences(next) {
  if (typeof localStorage === 'undefined') return;
  preferences = { ...preferences, ...next };
  localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
}
