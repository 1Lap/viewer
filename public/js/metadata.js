import { elements } from './elements.js';
import { formatSeconds } from './parser.js';
import { getActiveLap } from './state.js';

export function updateMetadata(lapArg) {
  const lap = lapArg === undefined ? getActiveLap() : lapArg;
  if (!elements.metaTrack) return;
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
  elements.metaLapTime.textContent = formatSeconds(lap.metadata.lapTime);
  elements.metaSamples.textContent = lap.samples.length.toLocaleString();
}
