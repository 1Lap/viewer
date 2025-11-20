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

const NEW_FORMAT_WITHOUT_TIME = `Format,LMUTelemetry v3
Version,1
Player,Dean Davids
TrackName,Bahrain International Circuit
CarName,Toyota GR010
SessionUTC,2025-11-14T07:20:40Z
LapTime [s],112.993
TrackLen [m],5386.80

LapDistance [m],Sector [int],Speed [km/h],EngineRevs [rpm],ThrottlePercentage [%],BrakePercentage [%],Steer [%],Gear [int],X [m],Z [m]
0.000,0,0.00,0.00,0.00,0.00,0.00,1,-269.27,-218.97
2693.400,1,245.20,7240.00,98.50,0.00,2.50,6,-268.11,-218.52
5386.800,2,250.10,7300.00,100.00,0.00,-1.75,6,-265.42,-217.01
`;

test('parseLapFile derives time from distance when LapTime column is missing', () => {
  const lap = parseLapFile(NEW_FORMAT_WITHOUT_TIME, 'new_format.csv');

  // Should parse metadata correctly
  assert.equal(lap.metadata.track, 'Bahrain International Circuit');
  assert.equal(lap.metadata.car, 'Toyota GR010');
  assert.equal(lap.metadata.driver, 'Dean Davids');
  assert.equal(lap.metadata.lapTime, 112.993);
  assert.equal(lap.metadata.lapLength, 5386.8);

  // Should have all samples
  assert.equal(lap.samples.length, 3);

  // Time should be derived from distance proportionally
  assert.equal(lap.samples[0].distance, 0);
  assert.equal(lap.samples[0].time, 0); // 0% of lap

  assert.equal(lap.samples[1].distance, 2693.4);
  // Should be approximately 50% of lap time: (2693.4 / 5386.8) * 112.993 ≈ 56.4965
  assert.ok(Math.abs(lap.samples[1].time - 56.4965) < 0.01);

  assert.equal(lap.samples[2].distance, 5386.8);
  // Should be 100% of lap time: 112.993
  assert.equal(lap.samples[2].time, 112.993);
});
