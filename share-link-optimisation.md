# Share Link Size Optimisation Plan

Goal: keep deep-link URLs comfortably under ~15 KB while preserving chart + track visual fidelity. Current links ~30 KB for a single lap (≈16.7 KB binary payload base64-encoded).

## 1. Use Gzip/Brotli Compression (50–60% reduction)

- **Description**: Re-enable `CompressionStream` / add a JS Gzip fallback (e.g., pako) when native APIs are unavailable.
- **Expected benefit**: halving payload size (16.7 KB → ~8 KB), shaving links to ~15 KB.
- **Constraint**: Need cross-browser fallback so share action doesn’t hang.

## 2. Reduce Channel Set for Shared View (10–15%)

- **Description**: Drop telemetry channels not shown in share replay (e.g., drop RPM/gear if not plotted, drop steering if seldom used).
- **Expected benefit**: Each removed byte-per-sample channel saves ≈1.5 KB off 1.2k-sample payloads (~5% per channel).
- **Constraint**: Only safe if charts default to hiding the stripped lane or if share view is limited.

## 3. Adaptive Downsampling / Polyline Simplification (10–20%)

- **Description**: Replace uniform step downsample with Douglas–Peucker or curvature-based decimation for the track path and telemetry channels.
- **Expected benefit**: Keep same fidelity with ~20% fewer points (1,200 → ~950) = ~3 KB reduction.
- **Constraint**: Need to ensure delta encoding still remains smooth, and that simplifying doesn’t distort telemetry lines.

### 3a. Curvature-Aware Sampling Around Corners (~5–10%)

- **Description**: Bias sample density around braking/turn-in/exit zones by measuring steering/angular change; allow coarse spacing on straights.
- **Expected benefit**: Better corner fidelity for the same sample budget, which can let us lower `MAX_SHARED_SAMPLES` without harming visuals (~5% extra reduction).
- **Constraint**: Need careful heuristics so we don’t miss interesting events (e.g., chicanes, multiple rapid turns).

## 4. Spline Track Encoding (15–25%)

- **Description**: Fit Bezier/spline segments to the track route and store knot points instead of per-sample coordinates.
- **Expected benefit**: Track path can be reconstructed from a few dozen control points, saving several KB and allowing more telemetry samples.
- **Constraint**: Requires nontrivial encode/decode, careful to avoid artifacts; doesn’t help telemetry channels.

## 5. Metadata Hashing / Lookup (5%)

- **Description**: Replace plain-text track/car/driver strings with hashed IDs or compressed dictionary entries.
- **Expected benefit**: Each URL currently embeds track/car names (~50–100 bytes). Hashing/dictionaries can shave ~1 KB.
- **Constraint**: Without a shared dictionary, we’d need to include the hash mapping or maintain a small lookup table client-side.

## 6. Quantization Tweaks (5–10%)

- **Description**: Start from current mm/0.01s precision but allow slightly coarser quantization for charts (e.g., throttle/brake as 0–200 ints, speed 0.5 km/h steps) while keeping track coordinates precise.
- **Expected benefit**: Minor (~1 KB) savings but reduces noise in RLE/delta.

## 7. Multi-Lap Limit / Single-Lap Share

- **Description**: Keep share links limited to active lap only. Already doing this — mention explicitly so we don’t attempt multi-lap shares that explode size.
- **Expected benefit**: ensures links stay under the 20 KB target, but zero for current single-lap flow.

## Implementation Order

1. Reintroduce compression with fallback (largest win, ~50%).
2. Adaptive downsampling (low complexity, ~10%).
3. Optional channel trimming (only if we’re willing to hide certain lanes in shared view).
4. Track-specific optimizations (spline encoding) if we still need more headroom.
