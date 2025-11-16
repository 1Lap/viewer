(function (app) {
  const elements = {
    dropzone: null,
    fileInput: null,
    status: null,
    metaTrack: null,
    metaCar: null,
    metaDriver: null,
    metaLapTime: null,
    metaSamples: null,
    lapList: null,
    clearLapsBtn: null,
    trackCanvas: null,
    sectorButtons: null,
    progressWindow: null,
    progressTrack: null
  };

  let sectorCursor = null;

  function initDomElements() {
    elements.dropzone = document.getElementById('dropzone');
    elements.fileInput = document.getElementById('fileInput');
    elements.status = document.getElementById('status');
    elements.metaTrack = document.getElementById('metaTrack');
    elements.metaCar = document.getElementById('metaCar');
    elements.metaDriver = document.getElementById('metaDriver');
    elements.metaLapTime = document.getElementById('metaLapTime');
    elements.metaSamples = document.getElementById('metaSamples');
    elements.lapList = document.getElementById('lapList');
    elements.clearLapsBtn = document.getElementById('clearLaps');
    elements.trackCanvas = document.getElementById('trackCanvas');
    elements.sectorButtons = document.getElementById('sectorButtons');
    elements.progressWindow = document.getElementById('progressWindow');
    elements.progressTrack = document.querySelector('.progress-track');

    if (!sectorCursor && elements.progressTrack) {
      sectorCursor = document.createElement('div');
      sectorCursor.className = 'progress-cursor';
      elements.progressTrack.appendChild(sectorCursor);
    }
  }

  function getSectorCursor() {
    return sectorCursor;
  }

  function setStatus(message) {
    if (elements.status) {
      elements.status.textContent = message;
    }
  }

  app.elements = elements;
  app.initDomElements = initDomElements;
  app.getSectorCursor = getSectorCursor;
  app.setStatus = setStatus;
})(window.LMUApp = window.LMUApp || {});
