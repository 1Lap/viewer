import test from 'node:test';
import assert from 'node:assert/strict';

import { loadLapFiles } from '../public/js/fileLoader.js';
import { telemetryState, resetState } from '../public/js/state.js';

const SAMPLE_FILE = `Player, 1, Jane Doe
Game,Track,Car,LapTime [s],S1,S2
Game,Silverstone,LMH Prototype,95.432,35.123,60.309
TrackID,TrackLen [m]
TrackID,5900
LapDistance [m],LapTime [s],ThrottlePercentage [%],BrakePercentage [%],Speed [km/h],X [m],Y [m]
0,0,0,100,40,0,0
50,2.5,100,0,180,20,5
`;

function mockFile(name, contents) {
  return {
    name,
    async text() {
      return contents;
    }
  };
}

test('loadLapFiles skips duplicate lap signatures', async () => {
  resetState();
  const first = mockFile('lap1.csv', SAMPLE_FILE);
  const duplicate = mockFile('lap1.csv', SAMPLE_FILE);
  const result = await loadLapFiles([first, duplicate]);
  assert.equal(result.loadedCount, 1);
  assert.equal(result.duplicateCount, 1);
  assert.equal(telemetryState.laps.length, 1);
  assert.ok(telemetryState.laps[0].signature);
});
