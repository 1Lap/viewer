import test from 'node:test';
import assert from 'node:assert/strict';

import { state, getLapColor, resetState, setActiveLapId } from '../js/state.js';

test('getLapColor cycles palette deterministically', () => {
  resetState();
  const first = getLapColor('lap-a');
  const second = getLapColor('lap-b');
  assert.notEqual(first, second);
  assert.equal(getLapColor('lap-a'), first, 'existing lap should reuse colour');
});

test('resetState clears laps and visibility', () => {
  state.laps.push({ id: 'lap-a', samples: [], metadata: {} });
  state.lapVisibility.add('lap-a');
  setActiveLapId('lap-a');
  resetState();
  assert.equal(state.laps.length, 0);
  assert.equal(state.lapVisibility.size, 0);
  assert.equal(state.activeLapId, null);
});
