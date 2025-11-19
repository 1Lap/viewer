import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTrackMap, clearTrackMapCache } from '../js/trackMapLoader.js';

const originalFetch = global.fetch;

test('loadTrackMap normalizes simple schema track maps', async () => {
  clearTrackMapCache();
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          left: [
            { x: 0, y: 0 },
            { x: 1, y: 0 }
          ],
          right: [
            { x: 0, y: 10 },
            { x: 1, y: 10 }
          ],
          center: [
            { x: 0, y: 5 },
            { x: 1, y: 5 }
          ],
          meta: {
            sampleCount: 100,
            smoothingWindow: 3
          }
        };
      }
    };
  };

  try {
    const trackMap = await loadTrackMap('simple_track');
    assert.equal(fetchCalls, 1);
    assert.deepEqual(trackMap.left, [
      [0, 0],
      [1, 0]
    ]);
    assert.deepEqual(trackMap.right, [
      [0, 10],
      [1, 10]
    ]);
    assert.deepEqual(trackMap.center, [
      [0, 5],
      [1, 5]
    ]);
    assert.equal(trackMap.sampleCount, 100);
    assert.equal(trackMap.smoothingWindow, 3);
    assert.deepEqual(trackMap.viewBox, [-0.025, -0.25, 1.05, 10.5]);
  } finally {
    global.fetch = originalFetch;
    clearTrackMapCache();
  }
});
