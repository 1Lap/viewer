(function (app) {
  let getActiveLap = () => null;
  let setViewWindow = () => {};
  let setCursorDistance = () => {};

  function initProgressControls(deps) {
    getActiveLap = deps.getActiveLap;
    setViewWindow = deps.setViewWindow;
    setCursorDistance = deps.setCursorDistance;

    const elements = app.elements;
    if (!elements?.progressTrack || !elements.sectorButtons) {
      console.warn('Progress controls initialised before DOM was ready.');
      return;
    }

    const dragState = {
      active: false,
      startRatio: 0,
      endRatio: 1
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

    elements.progressTrack.addEventListener('pointerdown', (event) => {
      const lap = getActiveLap();
      if (!lap) return;
      elements.progressTrack.setPointerCapture(event.pointerId);
      dragState.active = true;
      const ratio = getProgressRatio(event);
      dragState.startRatio = ratio;
      dragState.endRatio = ratio;
      applyDragSelection();
    });

    elements.progressTrack.addEventListener('pointermove', (event) => {
      if (!dragState.active) return;
      dragState.endRatio = getProgressRatio(event);
      applyDragSelection();
    });

    function endDrag(event) {
      if (!dragState.active) return;
      dragState.endRatio = getProgressRatio(event);
      dragState.active = false;
      try { elements.progressTrack.releasePointerCapture(event.pointerId); } catch (_) {}
      applyDragSelection();
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
      setViewWindow(lap, Number(button.dataset.start), Number(button.dataset.end));
    });
  }

  function updateProgressWindow(lap) {
    const elements = app.elements;
    const cursor = app.getSectorCursor();
    if (!elements?.progressWindow) return;
    if (!lap) {
      elements.progressWindow.style.left = '0%';
      elements.progressWindow.style.width = '0%';
      if (cursor) cursor.style.opacity = 0;
      return;
    }
    const total = lap.metadata.lapLength || lap.samples[lap.samples.length - 1].distance;
    const minDistance = lap.samples[0].distance;
    const span = (total - minDistance) || total || 1;
    const start = (app.state.viewWindow?.start ?? minDistance) - minDistance;
    const end = (app.state.viewWindow?.end ?? total) - minDistance;
    const left = (start / span) * 100;
    const width = ((end - start) / span) * 100;
    elements.progressWindow.style.left = `${Math.max(0, Math.min(100, left))}%`;
    elements.progressWindow.style.width = `${Math.max(0, Math.min(100, width))}%`;
  }

  function updateSectorCursor(distance) {
    const lap = getActiveLap();
    const cursor = app.getSectorCursor();
    if (!cursor) return;
    if (!lap || distance == null) {
      cursor.style.opacity = 0;
      return;
    }
    const minDistance = lap.samples[0].distance;
    const maxDistance = lap.metadata.lapLength || lap.samples[lap.samples.length - 1].distance;
    const ratio = (distance - minDistance) / ((maxDistance - minDistance) || 1);
    cursor.style.opacity = 1;
    cursor.style.left = `${Math.max(0, Math.min(100, ratio * 100))}%`;
  }

  function renderSectorButtons(lap) {
    const elements = app.elements;
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
    const endDistance = (lap.metadata.lapLength || lap.samples[lap.samples.length - 1]?.distance) ?? startDistance;
    const viewStart = app.state.viewWindow?.start ?? startDistance;
    const viewEnd = app.state.viewWindow?.end ?? endDistance;

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
    return Math.abs(viewStart - targetStart) <= tolerance && Math.abs(viewEnd - targetEnd) <= tolerance;
  }

  app.initProgressControls = initProgressControls;
  app.updateProgressWindow = updateProgressWindow;
  app.updateSectorCursor = updateSectorCursor;
  app.renderSectorButtons = renderSectorButtons;
})(window.LMUApp = window.LMUApp || {});
