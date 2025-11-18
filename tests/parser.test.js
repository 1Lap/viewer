import test from 'node:test';
import assert from 'node:assert/strict';

import { parseLapFile, formatSeconds } from '../js/parser.js';

const SAMPLE_FILE = `Player, 1, Jane Doe
Game,Track,Car,LapTime [s],S1,S2
Game,Silverstone,LMH Prototype,95.432,35.123,60.309
TrackID,TrackLen [m]
TrackID,5900
LapDistance [m],LapTime [s],ThrottlePercentage [%],BrakePercentage [%],Speed [km/h],X [m],Y [m]
0,0,0,100,40,0,0
50,2.5,100,0,180,20,5
`;

test('parseLapFile builds lap metadata and samples', () => {
  const lap = parseLapFile(SAMPLE_FILE, 'sample.csv');
  assert.equal(lap.samples.length, 2);
  assert.equal(lap.metadata.track, 'Silverstone');
  assert.equal(lap.metadata.car, 'LMH Prototype');
  assert.equal(lap.metadata.driver, 'Jane Doe');
  assert.equal(lap.metadata.lapLength, 5900);
  assert.equal(lap.samples[1].distance, 50);
  assert.equal(lap.samples[1].throttle, 100);
});

const MVP_FILE = `Format,LMUTelemetry v2
Version,1
Player,Dean Davids
TrackName,Algarve International Circuit
CarName,Toyota GR010
SessionUTC,2025-11-18T13:52:51Z
LapTime [s],123.456
TrackLen [m],4689.0

LapDistance [m],LapTime [s],ThrottlePercentage [%],BrakePercentage [%],Speed [km/h],X [m],Y [m]
0,0,0,0,0,0,0
50,2.5,100,0,180,20,5
`;

test('parseLapFile reads MVP metadata block', () => {
  const lap = parseLapFile(MVP_FILE, 'mvp.csv');
  assert.equal(lap.metadata.track, 'Algarve International Circuit');
  assert.equal(lap.metadata.car, 'Toyota GR010');
  assert.equal(lap.metadata.driver, 'Dean Davids');
  assert.equal(lap.metadata.lapTime, 123.456);
  assert.equal(lap.metadata.lapLength, 4689);
});

test('formatSeconds renders friendly labels', () => {
  assert.equal(formatSeconds(95.432), '1:35.432');
  assert.equal(formatSeconds(null), '—');
});
