(function (app) {
  function findSampleAtDistance(samples, target) {
    if (!samples.length || target == null) return null;
    let left = 0;
    let right = samples.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const value = samples[mid].distance;
      if (value === target) return samples[mid];
      if (value < target) left = mid + 1;
      else right = mid - 1;
    }
    return samples[Math.max(0, Math.min(samples.length - 1, left))];
  }

  function formatLapLabel(lap) {
    return lap.metadata.driver && lap.metadata.driver !== '—'
      ? `${lap.metadata.driver} (${lap.metadata.track})`
      : lap.name;
  }

  app.findSampleAtDistance = findSampleAtDistance;
  app.formatLapLabel = formatLapLabel;
})(window.LMUApp = window.LMUApp || {});
