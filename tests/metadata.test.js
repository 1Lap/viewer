import test from 'node:test';
import assert from 'node:assert/strict';

import { updateMetadata } from '../public/js/metadata.js';
import { telemetryState, resetState, setActiveLapId } from '../public/js/state.js';
import { elements } from '../public/js/elements.js';

function stubMetaElements() {
  const createStub = () => ({ textContent: '' });
  elements.metaTrack = createStub();
  elements.metaCar = createStub();
  elements.metaDriver = createStub();
  elements.metaLapTime = createStub();
  elements.metaSamples = createStub();
  return () => {
    elements.metaTrack = null;
    elements.metaCar = null;
    elements.metaDriver = null;
    elements.metaLapTime = null;
    elements.metaSamples = null;
  };
}

test('updateMetadata reflects driver of the active lap', (t) => {
  resetState();
  const restore = stubMetaElements();
  t.after(() => {
    restore();
    resetState();
  });

  telemetryState.laps.push(
    {
      id: 'lap-a',
      metadata: { track: 'Spa', car: 'GT3', driver: 'Driver A', lapTime: 92 },
      samples: [{ distance: 0 }, { distance: 10 }]
    },
    {
      id: 'lap-b',
      metadata: { track: 'Nurburgring', car: 'GT4', driver: 'Driver B', lapTime: 110 },
      samples: [{ distance: 0 }, { distance: 10 }, { distance: 20 }]
    }
  );
  telemetryState.lapOrder.push('lap-a', 'lap-b');

  setActiveLapId('lap-b');
  updateMetadata();

  assert.equal(elements.metaTrack.textContent, 'Nurburgring');
  assert.equal(elements.metaDriver.textContent, 'Driver B');
  assert.equal(elements.metaSamples.textContent, '3');

  setActiveLapId('lap-a');
  updateMetadata();
  assert.equal(elements.metaDriver.textContent, 'Driver A');

  updateMetadata(null);
  assert.equal(elements.metaDriver.textContent, '—');
});
