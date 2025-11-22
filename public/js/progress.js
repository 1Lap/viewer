import { uiState, getActiveLap } from './state.js';
import { elements, getSectorCursor } from './elements.js';

let setViewWindow = () => {};
let setCursorDistance = () => {};

export function initProgressControls(deps) {
  setViewWindow = deps.setViewWindow;
  setCursorDistance = deps.setCursorDistance;

  if (!elements?.progressTrack || !elements.sectorButtons) {
    return;
  }

  const dragState = {
    active: false,
    startRatio: 0,
    endRatio: 1,
    mode: 'select',
    windowStartRatio: 0,
    windowWidthRatio: 1
  };

  function getProgressRatio(event) {
    const rect = elements.progressTrack.getBoundingClientRect();
    const raw = (event.clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, raw));
  }

  function applyDragSelection() {
    const lap = getActiveLap();
    if (!lap) return;
    const total = lap.metadata.lapLength || lap.samples[lap.samples.length - 1].distance;
    const minDistance = lap.samples[0].distance;
    const span = total - minDistance;
    let startRatio = Math.min(dragState.startRatio, dragState.endRatio);
    let endRatio = Math.max(dragState.startRatio, dragState.endRatio);
    if (endRatio - startRatio < 0.005) {
      const center = (startRatio + endRatio) / 2;
      startRatio = Math.max(0, center - 0.0025);
      endRatio = Math.min(1, center + 0.0025);
    }
    const start = minDistance + span * startRatio;
    const end = minDistance + span * endRatio;
    setViewWindow(lap, start, end);
    setCursorDistance((start + end) / 2);
  }

  function applySlide(currentRatio) {
    const lap = getActiveLap();
    if (!lap) return;
    const minDistance = lap.samples[0].distance;
    const maxDistance = lap.metadata.lapLength || lap.samples[lap.samples.length - 1].distance;
    const totalSpan = maxDistance - minDistance || 1;
    const widthRatio = dragState.windowWidthRatio;
    let startRatio = dragState.windowStartRatio + (currentRatio - dragState.startRatio);
    startRatio = Math.max(0, Math.min(1 - widthRatio, startRatio));
    const endRatio = startRatio + widthRatio;
    const start = minDistance + totalSpan * startRatio;
    const end = minDistance + totalSpan * endRatio;
    setViewWindow(lap, start, end);
    setCursorDistance((start + end) / 2);
  }

  function getWindowRatios(lap) {
    if (!lap) {
      return { start: 0, width: 1 };
    }
    const minDistance = lap.samples[0].distance;
    const maxDistance = lap.metadata.lapLength || lap.samples[lap.samples.length - 1].distance;
    const span = maxDistance - minDistance || 1;
    const viewStart = uiState.viewWindow?.start ?? minDistance;
    const viewEnd = uiState.viewWindow?.end ?? maxDistance;
    const startRatio = Math.max(0, Math.min(1, (viewStart - minDistance) / span));
    const endRatio = Math.max(0, Math.min(1, (viewEnd - minDistance) / span));
    return {
      start: startRatio,
      width: Math.max(0.0025, endRatio - startRatio || 1)
    };
  }

  elements.progressTrack.addEventListener('pointerdown', (event) => {
    const lap = getActiveLap();
    if (!lap) return;
    elements.progressTrack.setPointerCapture(event.pointerId);
    dragState.active = true;
    const ratio = getProgressRatio(event);
    const windowRatios = getWindowRatios(lap);

    // Check if viewing the full lap
    const isFullLap =
      Math.abs(windowRatios.start) < 0.01 && Math.abs(windowRatios.width - 1) < 0.01;

    const isWithinWindow =
      !isFullLap &&
      ((elements.progressWindow && elements.progressWindow.contains(event.target)) ||
        (ratio >= windowRatios.start && ratio <= windowRatios.start + windowRatios.width));

    if (isWithinWindow) {
      dragState.mode = 'slide';
      dragState.windowStartRatio = windowRatios.start;
      dragState.windowWidthRatio = windowRatios.width;
      dragState.startRatio = ratio;
    } else {
      dragState.mode = 'select';
      dragState.startRatio = ratio;
      dragState.endRatio = ratio;
      applyDragSelection();
    }
  });

  elements.progressTrack.addEventListener('pointermove', (event) => {
    if (!dragState.active) return;
    if (dragState.mode === 'slide') {
      applySlide(getProgressRatio(event));
    } else {
      dragState.endRatio = getProgressRatio(event);
      applyDragSelection();
    }
  });

  function endDrag(event) {
    if (!dragState.active) return;
    if (dragState.mode === 'slide') {
      applySlide(getProgressRatio(event));
    } else {
      dragState.endRatio = getProgressRatio(event);
      applyDragSelection();
    }
    dragState.active = false;
    dragState.mode = 'select';
    try {
      elements.progressTrack.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore release failures since pointer may already be uncaptured.
    }
  }

  elements.progressTrack.addEventListener('pointerup', endDrag);
  elements.progressTrack.addEventListener('pointerleave', (event) => {
    if (!dragState.active) return;
    endDrag(event);
  });

  elements.progressTrack.addEventListener('mousemove', (event) => {
    if (dragState.active) return;
    const lap = getActiveLap();
    if (!lap) return;
    const ratio = getProgressRatio(event);
    const minDistance = lap.samples[0].distance;
    const maxDistance = lap.metadata.lapLength || lap.samples[lap.samples.length - 1].distance;
    const distance = minDistance + (maxDistance - minDistance) * ratio;
    setCursorDistance(distance);
  });

  elements.progressTrack.addEventListener('mouseleave', () => {
    if (dragState.active) return;
    setCursorDistance(null);
  });

  elements.sectorButtons.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-start]');
    if (!button) return;
    const lap = getActiveLap();
    if (!lap) return;
    const start = Number(button.dataset.start);
    const end = Number(button.dataset.end);
    if (event.metaKey || event.ctrlKey) {
      const existing = uiState.savedWindows.get(lap.id) ?? uiState.viewWindow ?? { start, end };
      const merged = {
        start: Math.min(existing.start, start),
        end: Math.max(existing.end, end)
      };
      setViewWindow(lap, merged.start, merged.end);
    } else {
      setViewWindow(lap, start, end);
    }
  });
}

export function updateProgressWindow(lap) {
  const cursor = getSectorCursor();
  if (!elements?.progressWindow) return;
  if (!lap) {
    elements.progressWindow.style.left = '0%';
    elements.progressWindow.style.width = '0%';
    if (cursor) cursor.style.opacity = 0;
    return;
  }
  const total = lap.metadata.lapLength || lap.samples[lap.samples.length - 1].distance;
  const minDistance = lap.samples[0].distance;
  const span = total - minDistance || total || 1;
  const start = (uiState.viewWindow?.start ?? minDistance) - minDistance;
  const end = (uiState.viewWindow?.end ?? total) - minDistance;
  const left = (start / span) * 100;
  const width = ((end - start) / span) * 100;

  // Hide progress window if viewing the full lap
  const tolerance = Math.max(0.01, span * 0.01);
  const isFullLap = Math.abs(start) <= tolerance && Math.abs(end - span) <= tolerance;

  if (isFullLap) {
    elements.progressWindow.style.left = '0%';
    elements.progressWindow.style.width = '0%';
    return;
  }

  elements.progressWindow.style.left = `${Math.max(0, Math.min(100, left))}%`;
  elements.progressWindow.style.width = `${Math.max(0, Math.min(100, width))}%`;
}

export function updateSectorCursor(distance) {
  const lap = getActiveLap();
  const cursor = getSectorCursor();
  if (!cursor) return;
  if (!lap || distance == null) {
    cursor.style.opacity = 0;
    return;
  }
  const minDistance = lap.samples[0].distance;
  const maxDistance = lap.metadata.lapLength || lap.samples[lap.samples.length - 1].distance;
  const ratio = (distance - minDistance) / (maxDistance - minDistance || 1);
  cursor.style.opacity = 1;
  cursor.style.left = `${Math.max(0, Math.min(100, ratio * 100))}%`;
}

export function renderSectorButtons(lap) {
  if (!elements?.sectorButtons) return;
  elements.sectorButtons.innerHTML = '';
  if (!lap) {
    const span = document.createElement('span');
    span.className = 'sector-placeholder';
    span.textContent = 'Load a lap to view sectors.';
    elements.sectorButtons.appendChild(span);
    return;
  }
  const startDistance = lap.samples[0]?.distance ?? 0;
  const endDistance =
    (lap.metadata.lapLength || lap.samples[lap.samples.length - 1]?.distance) ?? startDistance;
  const viewStart = uiState.viewWindow?.start ?? startDistance;
  const viewEnd = uiState.viewWindow?.end ?? endDistance;

  const buttons = [];
  const createButton = (label, start, end) => {
    const isActive = isWindowMatch(viewStart, viewEnd, start, end);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `sector-button${isActive ? ' active' : ''}`;
    button.dataset.start = start;
    button.dataset.end = end;
    button.textContent = label;
    buttons.push(button);
  };

  createButton('All', startDistance, endDistance);

  const sectorEntries = lap.sectors || [];
  sectorEntries.forEach((sector, idx) => {
    const label = sector.label || `S${sector.index ?? idx + 1}`;
    const start = sector.start ?? startDistance;
    const end = sector.end ?? endDistance;
    createButton(label, start, end);
  });

  buttons.forEach((button) => elements.sectorButtons.appendChild(button));

  if (!sectorEntries.length) {
    const placeholder = document.createElement('span');
    placeholder.className = 'sector-placeholder';
    placeholder.textContent = 'No sector data available for this lap.';
    elements.sectorButtons.appendChild(placeholder);
  }
}

function isWindowMatch(viewStart, viewEnd, targetStart, targetEnd) {
  const tolerance = Math.max(1, (targetEnd - targetStart) * 0.01);
  return (
    Math.abs(viewStart - targetStart) <= tolerance && Math.abs(viewEnd - targetEnd) <= tolerance
  );
}
