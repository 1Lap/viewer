(function (app) {
  async function loadLapFiles(files) {
    const state = app.state;
    let loadedCount = 0;
    let failedCount = 0;
    let lastLoadedId = null;

    for (const file of files) {
      try {
        const text = await file.text();
        const lap = app.parseLapFile(text, file.name);
        state.laps.push(lap);
        state.lapVisibility.add(lap.id);
        lastLoadedId = lap.id;
        app.getLapColor(lap.id);
        loadedCount++;
      } catch (error) {
        console.error(error);
        failedCount++;
      }
    }

    return { loadedCount, failedCount, lastLoadedId };
  }

  app.loadLapFiles = loadLapFiles;
})(window.LMUApp = window.LMUApp || {});
