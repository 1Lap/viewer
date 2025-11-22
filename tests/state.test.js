import test from 'node:test';
import assert from 'node:assert/strict';

import {
  telemetryState,
  uiState,
  getLapColor,
  resetState,
  setActiveLapId
} from '../public/js/state.js';

test('getLapColor cycles palette deterministically', () => {
  resetState();
  const first = getLapColor('lap-a');
  const second = getLapColor('lap-b');
  assert.notEqual(first, second);
  assert.equal(getLapColor('lap-a'), first, 'existing lap should reuse colour');
});

test('resetState clears laps and visibility', () => {
  telemetryState.laps.push({ id: 'lap-a', samples: [], metadata: {} });
  telemetryState.lapVisibility.add('lap-a');
  telemetryState.lapOrder.push('lap-a');
  setActiveLapId('lap-a');
  resetState();
  assert.equal(telemetryState.laps.length, 0);
  assert.equal(telemetryState.lapVisibility.size, 0);
  assert.equal(telemetryState.lapOrder.length, 0);
  assert.equal(uiState.activeLapId, null);
});
