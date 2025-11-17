import { loadLapFiles } from './fileLoader.js';
import { elements, initDomElements } from './elements.js';
import {
  telemetryState,
  uiState,
  getActiveLap,
  setActiveLapId,
  resetState,
  syncLapColorsToOrder,
  getLapColor
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
import { ensureLapSignature } from './signature.js';
import { buildShareLink, importSharedLap } from './share.js';

const PREFS_KEY = 'lmuLapViewerPrefs';
const SESSION_KEY = 'lmuLapViewerSession';
const DEFAULT_THEME = 'light';
let preferences = loadPreferences();
if (preferences.windowRatio) {
  uiState.persistentWindowRatio = preferences.windowRatio;
}
applyTheme(preferences.theme || DEFAULT_THEME, false);

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
  if (elements.themeToggle) {
    elements.themeToggle.addEventListener('click', () => {
      const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
    });
    updateThemeToggle(document.documentElement.dataset.theme || DEFAULT_THEME);
  }

  elements.shareLapBtn?.addEventListener('click', () => shareActiveLap());

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

  const restored = restoreLapSession();
  if (restored) {
    const preferred = findPreferredLapId() || telemetryState.laps[0]?.id || null;
    if (preferred) {
      activateLap(preferred);
    } else {
      updateMetadata(null);
      renderTrackMap(null);
      renderLapList();
      renderSectorButtons(null);
    }
  } else {
    renderTrackMap(null);
    renderLapList();
    renderSectorButtons(null);
  }

  handleSharedLapParam();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => bootstrap(), { once: true });
} else {
  bootstrap();
}

async function handleFiles(files) {
  if (!files.length) return;
  showMessage('Loading...');

  const {
    loadedCount,
    failedCount,
    duplicateCount,
    duplicateFiles,
    lastLoadedId,
    errors
  } = await loadLapFiles(files);
  const preferredLapId = findPreferredLapId();
  if (preferredLapId) {
    activateLap(preferredLapId);
  } else if (lastLoadedId) {
    activateLap(lastLoadedId);
  } else if (!telemetryState.laps.length) {
    clearLaps();
  } else {
    renderLapList();
  }
  persistLapSession();

  errors.forEach(({ fileName, error }) =>
    showError(`Failed to load ${fileName}. Check console for details.`, error)
  );

  const messages = [];
  if (loadedCount) messages.push(`Loaded ${loadedCount} lap${loadedCount === 1 ? '' : 's'}.`);
  if (duplicateCount) {
    const namePreview =
      duplicateFiles && duplicateFiles.length
        ? ` (${duplicateFiles.slice(0, 3).join(', ')}${duplicateFiles.length > 3 ? '…' : ''})`
        : '';
    messages.push(`Skipped ${duplicateCount} duplicate lap${duplicateCount === 1 ? '' : 's'}${namePreview}.`);
  }
  if (failedCount && !errors.length) {
    messages.push(`Failed ${failedCount}. Check console for details.`);
  }
  if (!messages.length) messages.push('No laps loaded.');
  const variant = failedCount || duplicateCount ? 'warning' : 'info';
  showMessage(messages.join(' '), variant);
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
  rememberActiveLap(lap);
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
  persistLapSession();
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
  persistLapSession();
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
  clearStoredSession();
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
  const signature = getLapSignature(lap);
  if (signature) {
    const lapWindows = { ...(preferences.lapWindows || {}), [signature]: ratio };
    savePreferences({ lapWindows });
  }
}

function applyPersistentWindow(lap) {
  const ratio = getStoredWindowRatio(lap);
  if (!ratio) return false;
  const range = getWindowFromRatio(lap, ratio);
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
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed.lapWindows || typeof parsed.lapWindows !== 'object') {
      parsed.lapWindows = {};
    }
    return parsed;
  } catch {
    return { lapWindows: {} };
  }
}

function savePreferences(next) {
  if (typeof localStorage === 'undefined') return;
  preferences = { ...preferences, ...next };
  localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
}

function rememberActiveLap(lap) {
  const signature = getLapSignature(lap);
  if (!signature) return;
  savePreferences({ activeLapSignature: signature });
}

function findPreferredLapId() {
  if (!preferences.activeLapSignature) return null;
  const match = telemetryState.laps.find(
    (lap) => getLapSignature(lap) === preferences.activeLapSignature
  );
  return match?.id ?? null;
}

function getStoredWindowRatio(lap) {
  const signature = getLapSignature(lap);
  if (signature && preferences.lapWindows?.[signature]) {
    uiState.persistentWindowRatio = preferences.lapWindows[signature];
    return preferences.lapWindows[signature];
  }
  const fallback = preferences.windowRatio || uiState.persistentWindowRatio || null;
  if (fallback) {
    uiState.persistentWindowRatio = fallback;
  }
  return fallback;
}

function getLapSignature(lap) {
  return ensureLapSignature(lap);
}

function applyTheme(theme, persist = true) {
  const resolved = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = resolved;
  if (persist) {
    savePreferences({ theme: resolved });
  }
  updateThemeToggle(resolved);
}

function updateThemeToggle(theme) {
  if (!elements.themeToggle) return;
  elements.themeToggle.textContent = theme === 'dark' ? 'Dark mode' : 'Light mode';
}

function persistLapSession() {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload = {
      laps: telemetryState.laps.map(serializeLap),
      lapOrder: [...telemetryState.lapOrder],
      visibility: Array.from(telemetryState.lapVisibility),
      savedWindows: Array.from(uiState.savedWindows.entries())
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Failed to persist lap session', error);
  }
}

function restoreLapSession() {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const payload = JSON.parse(raw);
    if (!payload?.laps?.length) return false;
    telemetryState.laps = payload.laps.map(deserializeLap);
    telemetryState.lapOrder = Array.isArray(payload.lapOrder) && payload.lapOrder.length
      ? payload.lapOrder.filter((lapId) => telemetryState.laps.some((lap) => lap.id === lapId))
      : telemetryState.laps.map((lap) => lap.id);
    telemetryState.lapVisibility = new Set(
      Array.isArray(payload.visibility) && payload.visibility.length
        ? payload.visibility.filter((lapId) =>
            telemetryState.laps.some((lap) => lap.id === lapId)
          )
        : telemetryState.lapOrder
    );
    uiState.savedWindows.clear();
    if (Array.isArray(payload.savedWindows)) {
      payload.savedWindows.forEach(([lapId, window]) => {
        if (window && typeof window.start === 'number' && typeof window.end === 'number') {
          uiState.savedWindows.set(lapId, window);
        }
      });
    }
    syncLapColorsToOrder();
    return telemetryState.laps.length > 0;
  } catch (error) {
    console.warn('Failed to restore lap session', error);
    return false;
  }
}

function clearStoredSession() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}

function serializeLap(lap) {
  return {
    id: lap.id,
    name: lap.name,
     signature: ensureLapSignature(lap),
    metadata: { ...lap.metadata },
    sectors: Array.isArray(lap.sectors)
      ? lap.sectors.map((sector) => ({ ...sector }))
      : [],
    samples: lap.samples.map((sample) => ({
      distance: sample.distance,
      time: sample.time,
      throttle: sample.throttle,
      brake: sample.brake,
      speed: sample.speed,
      steer: sample.steer,
      gear: sample.gear,
      rpm: sample.rpm,
      x: sample.x,
      y: sample.y,
      z: sample.z,
      sector: sample.sector
    }))
  };
}

function deserializeLap(raw) {
  const lap = {
    id: raw.id,
    name: raw.name,
    signature: raw.signature || null,
    metadata: raw.metadata || {},
    sectors: raw.sectors || [],
    samples: Array.isArray(raw.samples) ? raw.samples : []
  };
  ensureLapSignature(lap);
  return lap;
}

async function shareActiveLap() {
  const lap = getActiveLap();
  if (!lap) {
    showMessage('Load a lap before sharing.', 'warning');
    return;
  }
  try {
    const windowRange = uiState.savedWindows.get(lap.id) ?? uiState.viewWindow ?? null;
    const link = await buildShareLink(lap, windowRange);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
      showMessage('Share link copied to clipboard.', 'success');
    } else {
      prompt('Copy this share link', link);
    }
  } catch (error) {
    console.error(error);
    showError('Failed to build share link.', error);
  }
}

async function handleSharedLapParam() {
  const params = new URLSearchParams(window.location.search);
  const payload = params.get('share');
  if (!payload) return;
  try {
    const { lap, window } = await importSharedLap(payload);
    telemetryState.laps.push(lap);
    telemetryState.lapOrder.push(lap.id);
    telemetryState.lapVisibility.add(lap.id);
    getLapColor(lap.id);
    if (window?.start != null && window?.end != null) {
      uiState.savedWindows.set(lap.id, window);
    }
    activateLap(lap.id);
    showMessage('Loaded shared lap.', 'success');
  } catch (error) {
    console.error(error);
    showError('Failed to import shared lap.', error);
  } finally {
    params.delete('share');
    const newQuery = params.toString();
    const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}`;
    window.history.replaceState({}, '', newUrl);
  }
}
