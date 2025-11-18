## Stepped Input Traces

### Context
- While testing the MVP telemetry export (`20251118135010748377_lap3.csv`), throttle/brake/speed/RPM/steering lanes still appear as blocky steps even after enabling Chart.js smoothing (`cubicInterpolationMode: 'monotone'`, `tension: 0.3` in `js/charts.js`).
- The current telemetry file contains many consecutive samples with identical `LapDistance` (or very coarse increments) and unchanged input values, resulting in horizontal segments; Chart.js faithfully renders those without additional interpolation.

### Problem
- The viewer plots exactly the sampled data, so any coarse sampling frequency or quantized values from the logger translate into visibly stepped traces.
- Smoothing via Chart.js options only affects how existing points are connected; it can’t invent intermediate samples when the input data doesn’t change for multiple rows.

### Options to explore (future work)
1. **Enhance the telemetry export**:
   - Confirm the logger is capturing at the intended ~100 Hz with distinct `LapDistance`/`LapTime` values.
   - Increase precision or avoid repeating samples when nothing changes.
2. **Client-side resampling**:
   - Implement a moving-average or spline interpolation step in the viewer to densify/smooth the data before plotting (with a toggle so analysts know they’re viewing filtered data).

### Next steps
- Decide whether to improve the logger resolution or add a viewer-side smoothing pass.
- Reproduce with additional laps to confirm the behaviour is consistent.
