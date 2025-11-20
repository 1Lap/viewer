# Bug: Lap Time Display Inaccurate

## Description

The lap time displayed in the lap viewer UI does not accurately reflect the actual lap time. This appears to be related to how lap times are calculated or retrieved from the telemetry data.

## Current Behavior

Lap times are displayed in several places:
1. In the lap list (js/lapList.js:69) - shows formatted lap time next to driver name
2. In the metadata panel (js/metadata.js:20) - shows lap time for the active lap

The lap time value comes from `lap.metadata.lapTime` which is set during parsing (js/parser.js:334).

## Potential Issues

### Issue 1: Time Derivation from Distance

When the telemetry CSV file lacks a `LapTime` column, the parser derives time from distance (js/parser.js:311-323):

```javascript
// Use metadata lapTime if available, otherwise estimate from sample count
const totalLapTime = lapTimeSeconds ?? samples.length * 0.01; // fallback: assume 100Hz sampling

// Calculate time proportionally: time = (distance / maxDistance) * totalLapTime
samples.forEach((sample) => {
  sample.time = maxDistance > 0 ? (sample.distance / maxDistance) * totalLapTime : 0;
});
```

This fallback estimation (`samples.length * 0.01`) assumes 100Hz sampling, which may be incorrect for different data sources.

### Issue 2: Metadata vs Sample Time Mismatch

The lap time can come from multiple sources:
1. CSV metadata headers (`LapTimes` or `LapTime`)
2. CSV metadata row (Track, Car, LapTime columns)
3. Derived from the last sample's time
4. Estimated from sample count

There may be inconsistencies between these sources, leading to incorrect display values.

### Issue 3: Format Display Issues

The `formatSeconds()` function (js/parser.js:424-429) formats times as `MM:SS.mmm` or `SS.mmm s`. If the lap time value is in the wrong units (milliseconds vs seconds) or has incorrect precision, it will display incorrectly.

## Expected Behavior

- Lap times should accurately reflect the actual time taken to complete the lap
- When lap time is provided in metadata, it should be used directly
- When derived from samples, the calculation should be accurate
- The displayed format should be consistent and correct

## Reproduction

Load a telemetry file and observe the lap time displayed. Compare with:
- The expected lap time from the source system
- The time range in the actual telemetry data (last sample time - first sample time)
- Other lap time displays in the source application

## Investigation Steps

1. Check if the source telemetry files have a `LapTime` column
2. Verify the units (seconds vs milliseconds) of lap time values in metadata
3. Compare `lap.metadata.lapTime` with the actual time span in `lap.samples`
4. Check if the last sample's time correctly represents the lap time
5. Verify the sampling rate assumption (100Hz) is correct for your data source

## Related Files

- `js/parser.js:124-210` - Metadata parsing and lap time extraction
- `js/parser.js:248-323` - Time derivation from distance
- `js/parser.js:334` - Final lap time assignment
- `js/parser.js:424-429` - Time formatting function
- `js/metadata.js:20` - Lap time display in metadata panel
- `js/lapList.js:69` - Lap time display in lap list
