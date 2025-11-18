- [x] 2025-11-18: Throttle datasets now mask gear-change spikes by inserting `null` values within ±1.2 m of each shift and enabling `spanGaps`, smoothing the line while preserving real inputs. Config lives in `js/charts.js` (`GEAR_SHIFT_MASK_DISTANCE`).

✅ **Resolved** — adjust the mask window if future laps need different smoothing.
