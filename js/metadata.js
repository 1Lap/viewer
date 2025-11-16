(function (app) {
  function updateMetadata(lap) {
    const elements = app.elements;
    if (!elements) return;
    if (!lap) {
      elements.metaTrack.textContent = '—';
      elements.metaCar.textContent = '—';
      elements.metaDriver.textContent = '—';
      elements.metaLapTime.textContent = '—';
      elements.metaSamples.textContent = '—';
      return;
    }

    elements.metaTrack.textContent = lap.metadata.track;
    elements.metaCar.textContent = lap.metadata.car;
    elements.metaDriver.textContent = lap.metadata.driver || '—';
    elements.metaLapTime.textContent = app.formatSeconds(lap.metadata.lapTime);
    elements.metaSamples.textContent = lap.samples.length.toLocaleString();
  }

  app.updateMetadata = updateMetadata;
})(window.LMUApp = window.LMUApp || {});
