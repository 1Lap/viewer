# Bug: Delta View Not Showing Expected Results

## Description

The delta view chart is not displaying what users expect when comparing laps. This could manifest in several ways:
- Delta values seem incorrect or inverted
- Delta chart shows unexpected patterns
- Reference lap not clearly indicated
- No delta displayed when it should be

## Current Behavior

The delta view is implemented in `js/charts.js` as one of the lane configurations. The delta chart shows the time difference between a comparison lap and the reference lap (active lap) across the lap distance.

### How Delta Currently Works

1. **Reference Lap**: The active lap (selected in lap list) is the reference
2. **Comparison Laps**: All other visible laps are compared against the reference
3. **Delta Calculation** (js/charts.js:428-448):
   - For each sample point at distance `x` in the reference lap
   - Find the corresponding time in the comparison lap at the same distance (interpolated)
   - Calculate: `delta = comparisonTime - referenceTime`
   - Positive delta = comparison lap is slower (behind)
   - Negative delta = comparison lap is faster (ahead)

4. **Display**:
   - Reference lap shows as a zero line (dashed gray) when there are comparison laps
   - Comparison laps show as colored lines with their delta values
   - Y-axis shows "Delta (s)" in seconds

## Potential Issues

### Issue 1: Inverted Delta Sign Convention

The current calculation (js/charts.js:447):
```javascript
result.push({ x: sample.distance, y: comparisonTime - sample.time });
```

This means:
- **Positive values** = comparison lap is slower (losing time)
- **Negative values** = comparison lap is faster (gaining time)

However, some users may expect the opposite convention:
- **Positive values** = gaining time on reference
- **Negative values** = losing time to reference

This is a matter of convention. Different analysis tools use different conventions.

### Issue 2: Reference Lap Not Obvious

When multiple laps are visible, the reference lap (active lap) might not be clearly indicated. The reference shows as a dashed zero line only when comparison laps exist, which might be confusing.

### Issue 3: No Delta When Only One Lap Visible

If only the reference lap is visible (others are hidden), no delta chart appears. This is by design (js/charts.js:396-397) but might confuse users who expect to see the zero line.

### Issue 4: Interpolation Accuracy

Delta is calculated by interpolating the comparison lap's time at each reference lap's distance point (js/charts.js:445). If the laps have very different sampling rates or distance ranges, interpolation may introduce errors.

### Issue 5: Distance Range Mismatch

The delta calculation skips points where:
- Distance is outside the comparison lap's range (js/charts.js:437-443)
- This can cause gaps in the delta chart if laps have different start/end distances

### Issue 6: Time Data Issues

If lap times were derived incorrectly (see `laptime_display_inaccurate.md`), the delta values will also be wrong. The delta calculation depends entirely on accurate `sample.time` values.

## Expected Behavior

Users expect:
- Clear indication of which lap is the reference
- Consistent and intuitive delta sign convention
- Smooth, continuous delta lines (no gaps)
- Accurate delta values that match manual calculations
- Ability to understand if they're gaining or losing time at any point

## Investigation Steps

1. **Verify Reference Lap**: Check which lap is marked as active
2. **Check Delta Signs**: Manually verify a few delta values:
   - Pick a distance point
   - Note the time for both laps at that distance
   - Calculate: comparison_time - reference_time
   - Compare with displayed delta
3. **Examine Sampling**: Check if both laps have similar distance ranges and sampling rates
4. **Test Time Accuracy**: Verify that `sample.time` values are correct for both laps
5. **Check Interpolation**: Look for gaps or discontinuities in the delta chart

## Suggested Improvements

### Improvement 1: Add Delta Sign Convention Option

Add a setting to flip the delta calculation:
```javascript
// Option 1: Current (comparison - reference)
delta = comparisonTime - referenceTime;

// Option 2: Inverted (reference - comparison)
delta = referenceTime - comparisonTime;
```

### Improvement 2: Better Reference Indication

- Add a clear label indicating which lap is the reference
- Highlight the reference lap in the lap list
- Add explanatory text: "Positive delta = slower than [reference lap name]"

### Improvement 3: Always Show Reference Line

Show the zero line even when no comparison laps are visible, with a message explaining delta requires multiple laps.

### Improvement 4: Handle Distance Range Mismatches

When laps have different distance ranges:
- Clip to the overlapping range
- Or extend with extrapolation
- Show a warning about partial comparison

### Improvement 5: Add Delta Statistics

Show summary statistics:
- Maximum gain/loss
- Average delta
- Total time difference

## Related Files

- `js/charts.js:86-98` - Delta lane configuration
- `js/charts.js:390-422` - `buildDeltaDatasets()` function
- `js/charts.js:428-448` - `computeDeltaDataset()` function
- `js/charts.js:424-426` - Zero line for reference lap
- `js/utils.js` - `interpolateLapValue()` used for delta calculation
- `js/state.js` - Active lap management

## Testing Scenarios

Test with:
1. Two laps with identical samples → delta should be exactly zero everywhere
2. One lap consistently faster → delta should be consistently positive or negative
3. Laps with different distance ranges → verify behavior at boundaries
4. Laps with very different sampling rates → check interpolation accuracy
