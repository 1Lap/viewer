## Chart Display Improvements Plan

### Goals

- Make gear/RPM information easier to read by removing the visual overlap noted in `bugs/revs_and_gears.md`.
- Reduce throttle noise caused by shift-induced blips per `bugs/gear_changes_display.md` without hiding genuine driver inputs.

### 1. Gear & RPM Presentation

1. **Separate visual layers** ✅
   - RPM now has its own lane with the existing line trace.
   - Gear is rendered on a dedicated lane as a stepped, semi-transparent fill (`js/charts.js`, `index.html`).
2. **Legend/tooltips** ✅
   - Dataset labels clearly state “gear” vs “RPM”. Tooltips continue to show both values.
3. **Validation** ✅
   - Verified using `20251118135010748377_lap3.csv`; the two signals no longer overlap.

### 2. Masking Throttle Blips During Shifts

1. **Detect gear-change windows** ✅
   - `computeShiftWindows` scans samples and records ±1.2 m ranges around each gear change.
2. **Apply mask to throttle dataset** ✅
   - `buildMaskedThrottleData` drops throttle values inside each window and `spanGaps` keeps the line continuous.
3. **Config flag** ✅
   - `GEAR_SHIFT_MASK_DISTANCE` controls the window width.
4. **Testing/Verification** ✅
   - Checked against the sample lap; throttle is stable through shifts while genuine braking events remain intact.

### 3. QA Checklist

- [x] Implement gear/RPM rendering update (separate lanes) and visually verify on sample lap.
- [x] Implement throttle blip masking with tunable window/threshold; test using lap where gear changes are frequent.
- [ ] Update documentation or release notes to describe the more legible gear/RPM view and throttle smoothing.
- [x] Run existing chart-related tests (`npm test`) to ensure new helpers don’t break current behaviour.
