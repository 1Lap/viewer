import { parseLapFile } from './parser.js';
import { telemetryState, getLapColor } from './state.js';
import { ensureLapSignature } from './signature.js';

export async function loadLapFiles(files) {
  let loadedCount = 0;
  let failedCount = 0;
  let lastLoadedId = null;
  let duplicateCount = 0;
  const duplicateFiles = [];
  const errors = [];
  const knownSignatures = new Set(
    telemetryState.laps
      .map((lap) => ensureLapSignature(lap))
      .filter((signature) => typeof signature === 'string')
  );

  for (const file of files) {
    try {
      const text = await file.text();
      const lap = parseLapFile(text, file.name);
      const signature = ensureLapSignature(lap);
      if (signature && knownSignatures.has(signature)) {
        duplicateCount++;
        duplicateFiles.push(file.name || lap.metadata.track || 'duplicate lap');
        continue;
      }
      if (signature) {
        knownSignatures.add(signature);
      }
      telemetryState.laps.push(lap);
      telemetryState.lapOrder.push(lap.id);
      telemetryState.lapVisibility.add(lap.id);
      lastLoadedId = lap.id;
      getLapColor(lap.id);
      loadedCount++;
    } catch (error) {
      console.error(error);
      failedCount++;
      errors.push({ fileName: file.name, error });
    }
  }

  return { loadedCount, failedCount, duplicateCount, duplicateFiles, lastLoadedId, errors };
}
