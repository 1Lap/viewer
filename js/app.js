(function (app) {
  function init() {
    app.initDomElements();
    const elements = app.elements;

    app.initCharts({ setCursorDistance, setViewWindow });
    app.initTrackHover({ getActiveLap: app.getActiveLap, setCursorDistance });
    app.initProgressControls({ getActiveLap: app.getActiveLap, setViewWindow, setCursorDistance });
    app.initLapListInteractions({
      activateLap,
      handleVisibilityChange
    });

    if (elements.dropzone) {
      elements.dropzone.addEventListener('click', () => elements.fileInput?.click());
      elements.dropzone.addEventListener('dragover', (event) => {
        event.preventDefault();
        elements.dropzone.classList.add('dragover');
      });
      elements.dropzone.addEventListener('dragleave', () => elements.dropzone.classList.remove('dragover'));
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

    app.renderTrackMap(null);
    app.renderLapList();
    app.renderSectorButtons(null);
  }

  async function handleFiles(files) {
    if (!files.length) return;
    app.setStatus('Loading...');

    const { loadedCount, failedCount, lastLoadedId } = await app.loadLapFiles(files);

    if (lastLoadedId) {
      activateLap(lastLoadedId);
    } else if (!app.state.laps.length) {
      clearLaps();
    } else {
      app.renderLapList();
    }

    const messages = [];
    if (loadedCount) messages.push(`Loaded ${loadedCount} lap${loadedCount === 1 ? '' : 's'}.`);
    if (failedCount) messages.push(`Failed ${failedCount}. Check console for details.`);
    if (!messages.length) messages.push('No laps loaded.');
    app.setStatus(messages.join(' '));
  }

  function setViewWindow(lap, start, end) {
    const state = app.state;
    if (!lap) {
      state.viewWindow = null;
      app.updateProgressWindow(null);
      app.renderTrackMap(null);
      app.renderSectorButtons(null);
      app.applyWindowToCharts();
      return;
    }
    const minDistance = lap.samples[0].distance;
    const maxDistance = lap.metadata.lapLength || lap.samples[lap.samples.length - 1].distance;
    const windowStart = start ?? minDistance;
    const windowEnd = end ?? maxDistance;
    state.viewWindow = {
      start: Math.max(minDistance, Math.min(maxDistance, windowStart)),
      end: Math.max(minDistance, Math.min(maxDistance, windowEnd))
    };
    app.updateProgressWindow(lap);
    app.renderTrackMap(lap);
    app.renderSectorButtons(lap);
    app.applyWindowToCharts();
  }

  function setCursorDistance(distance) {
    app.state.cursorDistance = distance;
    app.renderTrackMap(app.getActiveLap());
    app.updateSectorCursor(distance);
    app.refreshCharts();
  }

  function activateLap(lapId) {
    const state = app.state;
    const lap = state.laps.find((l) => l.id === lapId);
    if (!lap) return;
    app.setActiveLapId(lapId);
    state.cursorDistance = null;
    state.lapVisibility.add(lapId);
    setViewWindow(lap);
    app.updateMetadata(lap);
    app.updateLaneData();
    app.renderLapList();
  }

  function handleVisibilityChange(lapId, visible) {
    const state = app.state;
    if (visible) {
      state.lapVisibility.add(lapId);
    } else {
      state.lapVisibility.delete(lapId);
      if (!state.lapVisibility.size && state.activeLapId) {
        state.lapVisibility.add(state.activeLapId);
      }
    }
    app.updateLaneData();
    app.renderTrackMap(app.getActiveLap());
    app.renderLapList();
  }

  function clearLaps() {
    app.resetState();
    app.updateMetadata(null);
    app.updateLaneData();
    app.renderTrackMap(null);
    app.updateProgressWindow(null);
    app.renderSectorButtons(null);
    app.renderLapList();
    app.setStatus('Cleared all laps.');
  }

  window.addEventListener('DOMContentLoaded', init);
})(window.LMUApp = window.LMUApp || {});
