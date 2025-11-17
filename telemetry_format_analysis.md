# Telemetry Export Format Analysis

## Objectives
- Preserve the current browser-only workflow: a driver exports a file, drags it onto `index.html`, and immediately gets lap overlays and the track map.
- Keep the format debuggable (plain text when possible) and future-proof so we can bolt on more channels without breaking older exports.
- Guarantee the viewer’s hard requirements (distance-aligned samples + Cartesian points) so features like the delta lane and map projection keep working even with custom data.

## Format options considered
| Format | Pros | Cons |
| --- | --- | --- |
| Plain CSV (status quo) | Human-readable, easy to diff, streamable in the browser, aligns with the existing parser and state code | Repeated column headers per file, larger than binary |
| JSON (records array) | Carries nested data, self-describing, simple to parse with `JSON.parse` | Very verbose for 10k+ samples; random access is harder without building indexes |
| Columnar/binary (Arrow/Parquet) | Compact, typed, fast for analytics | Requires additional tooling in the client; harder to edit/inspect manually; not currently supported in the app |

**Recommendation:** stay with CSV + a structured metadata preamble. We already pay the DOM/Chart.js cost for ~11k rows per lap, and the parser is explicitly built around CSV headers. The custom logger can ensure consistent column names/units, which removes the guesswork the current parser performs today.

## Proposed file layout
1. **Metadata block** – repeated `key,value` lines at the top so humans can read important context without loading the file. Suggested order:
   ```
   Format,LMUTelemetry v2
   Version,1
   Player,Dean Davids
   GameVersion,0.9
   SessionUTC,2025-11-14T07:20:40Z
   TrackName,Bahrain International Circuit
   CarName,Toyota GR010
   Event,Practice
   LapTime [s],112.993
   TrackLen [m],5386.80
   ```
   Add whatever setup information matters (compound, weather snapshot, aero balance) – everything before the telemetry header is ignored by the parser after it finds the data row.
2. **Blank line** (optional but keeps CSV editors tidy).
3. **Telemetry header + samples** – single header row followed by distance-sorted samples. The parser already tolerates unit suffixes in brackets, so keep them for clarity.

## Schema

### Metadata block
| Field | Required | Type/Unit | Notes |
| --- | --- | --- | --- |
| `Format` | ✅ | string | Fixed identifier so parsers can assert they’re reading the right spec. |
| `Version` | ✅ | integer | Start at `1`; bump when we add/break fields. |
| `Player` | ✅ | string | Driver name shown in the lap list. |
| `TrackName` | ✅ | string | Used everywhere in the UI. |
| `CarName` | ✅ | string | Displayed in metadata + lap signature. |
| `SessionUTC` | ✅ | ISO timestamp | Lets us order laps chronologically if needed. |
| `LapTime [s]` | ✅ | seconds | Used when we build chart labels; viewer falls back to last sample time if missing. |
| `TrackLen [m]` | ✅ | metres | Provides a trustworthy lap length (the fallback is last sample distance). |
| `TyreCompound`, `Weather`, `FuelAtStart`, etc. | optional | various | Safe to include – extra metadata is preserved in `lap.metadata` if we route it later. |

### Sample row schema
The viewer requires at least distance, time, throttle, brake, speed, steering, gear, RPM, and a planar coordinate. Everything else improves fidelity but can be optional if you don’t chart it yet.

| Column | Type/Unit | Required | Description |
| --- | --- | --- | --- |
| `LapDistance [m]` | float | ✅ | Monotonic distance from lap start. The state windowing logic relies on this as the shared X-axis. |
| `LapTime [s]` | float | ✅ | Cumulative time. Needed for delta channel calculations. |
| `Sector [int]` | int | ➕ | Provide `0/1/2‥` transitions so we can draw real sectors; fallback timing is far less accurate. |
| `ThrottlePercentage [%]` | float 0–100 | ✅ | Input lane. |
| `BrakePercentage [%]` | float 0–100 | ✅ | Input lane. |
| `Steer [%]` | float -100–100 | ✅ | Steering lane; we display raw percentage. |
| `Speed [km/h]` | float | ✅ | Speed lane (Chart.js y-axis suggests 0–350). |
| `Gear [int]` | integer | ✅ | Rendered as steps; pair with RPM for context. |
| `EngineRevs [rpm]` | float | ✅ | Secondary axis on the gear/RPM lane. |
| `X [m]`, `Y [m]`, `Z [m]` | float | ✅ for at least two axes | Track map projection. We treat `(X,Z)` as a fallback if `Y` is missing, so log whichever two axes form a planar projection. |
| `TotalDistance [m]` | float | optional | Helpful for multi-lap overlays or future stint charts. |
| `SpeedVectorX/Y/Z [m/s]` | float | optional | Lets us compute more advanced overlays without re-integrating distance. |
| `TyreTemp`, `GForce*`, `WheelSpeed*`, etc. | float | optional | Safe to append – the parser stores every column, and we can expose them via new chart lanes later. |

Column order is irrelevant as long as the header text matches. The parser normalises headers (lowercase + stripped punctuation) and supports aliases like `lapdistancem`, but sticking to the canonical names above removes ambiguity.

### Example header (minimum viable)
```
LapDistance [m],LapTime [s],Sector [int],Speed [km/h],EngineRevs [rpm],ThrottlePercentage [%],BrakePercentage [%],Steer [%],Gear [int],X [m],Y [m],Z [m]
```

## MVP logging specification
This is the contract the telemetry writer must meet for the trimmed 12-column export.

1. **Encoding & structure**
   - UTF-8 CSV, newline-delimited, using `.` as the decimal separator.
   - Metadata lines precede the telemetry header, each in `Key,Value` form (no extra columns). Provide at least the required keys in the table below.
   - After metadata, emit a blank line (optional) and the telemetry header exactly as shown above.
   - One sample per line, sorted by ascending `LapDistance [m]`. Do not include extra columns.
2. **Metadata requirements**

| Key | Format | Notes |
| --- | --- | --- |
| `Format` | literal `LMUTelemetry v2` | Lets the parser assert compatibility. |
| `Version` | integer `1` | Increment when breaking changes happen. |
| `Player` | string | Driver name that appears in UI. |
| `TrackName` | string | Course label. |
| `CarName` | string | Vehicle label. |
| `SessionUTC` | ISO-8601 UTC timestamp | `YYYY-MM-DDTHH:MM:SSZ`. |
| `LapTime [s]` | decimal seconds | Best-known lap time; duplicate of telemetry end time. |
| `TrackLen [m]` | decimal metres | Official lap length. |

Additional metadata (tyre compound, weather, setup) may follow but is optional.

3. **Sample row requirements**

| Column | Type / resolution | Valid range | Notes |
| --- | --- | --- | --- |
| `LapDistance [m]` | float, ≥2 decimal places | Monotonic, 0 → lap length | Primary X-axis. |
| `LapTime [s]` | float, ≥3 decimal places | Monotonic, 0 → lap time | Used for delta calculations. |
| `Sector [int]` | integer (0-based) | 0‥N | Increment when entering a new sector; repeat last known value if unknown. |
| `Speed [km/h]` | float or integer | 0‥400 | Emit the sim value; don’t clamp except to valid physical ranges. |
| `EngineRevs [rpm]` | float or integer | 0‥20 000 | Raw RPM from the sim. |
| `ThrottlePercentage [%]` | float with two decimals | 0.00‥100.00 | **Do not** emit 0–1 fractions; send percentages so the charts read correctly. |
| `BrakePercentage [%]` | float with two decimals | 0.00‥100.00 | Same scaling as throttle. |
| `Steer [%]` | float with two decimals | -100.00‥100.00 | Positive = right (match exporter behaviour). |
| `Gear [int]` | integer | -1 (reverse), 0 (neutral), 1‥9 | Provide actual gear index from the sim. |
| `X [m]` | float with two decimals | any finite number | World position in metres. |
| `Y [m]` | float with two decimals | any finite number | Prefer horizontal axis; if sim uses Y for height, supply `Z` as the horizontal alternate. |
| `Z [m]` | float with two decimals | any finite number | Optional if `Y` already forms the planar axis; leave blank when unavailable. |

General rules:
- Emit `''` (empty cell) when the signal is not available; the parser turns that into `null`.
- Avoid rounding inputs to integers; keep sub-percent precision where available to preserve smooth traces.
- Sampling cadence: target 100 Hz if feasible; the viewer handles any uniform cadence, but extremely low sample counts (<40 Hz) reduce chart smoothness and track-map accuracy.
- Each file must contain exactly one lap. Start a new file if the logger detects an out-lap, pit exit, or invalid lap reset.

## Sampling guidance
- **Target rate:** 100 Hz (Δt ≈ 0.01 s). The Bahrain sample from `lapdata_tt` contains 11 215 rows over a 112.9 s lap, resulting in `avg dt = 10.07 ms`. That cadence yields smooth traces and keeps the track map precise without bloating the file. Dropping to 50 Hz still works, but cursor interpolation becomes visibly quantised.
- **Spacing tolerance:** allow instantaneous spikes down to 8 ms (`min dt` observed: 0.008 s) for sudden events; cap at 60 ms to avoid gaps our interpolation can’t mask (`max dt` observed: 0.06 s).
- **Distance monotonicity:** enforce strictly increasing `LapDistance`. If the logger must pause (yellow flags, ESC resets), start a new lap rather than rewinding distance; otherwise the chart zoom/pan math breaks.
- **Coordinate consistency:** use the same world frame per session (e.g., metres from the sim origin). The viewer normalises everything relative to the sample min/max, so absolute offsets are fine as long as they don’t jump mid-lap.
- **Sample count budget:** a 5.4 km lap at 100 Hz produces ~11k rows. Compressed with gzip this settles around 1.5–2 MB, which the browser handles comfortably even when comparing 3–4 laps.

## File size considerations
- The raw LMU export at `lapdata_tt/bahrain_international_circuit_P_112.993_toyota_gr010.csv` is **10.8 MB** for 11 217 telemetry rows; each row averages ~960 bytes because the sim writes ~90 columns (temps, suspension, wheel speeds, aero loads, etc.). A straight gzip brings it down to **~4.2 MB**, but browsers can’t open `.gz` drops yet.
- **Column pruning beats precision trimming.** Keeping only the required schema (~12 columns) yields rows near 150–200 bytes, meaning a comparable lap would land closer to 2 MB uncompressed and <1 MB gzipped—a 5× reduction. Optional channels can be emitted via a separate “rich” export when you specifically need tyre temps, suspension data, or ERS traces. (Validated by generating `lapdata_tt/bare_min.csv` with exactly those 12 headers: **1.03 MB** raw, **0.41 MB** gzipped for the same lap.)
- **Precision strategy:** decimals contribute a few hundred kilobytes at most. Rounding throttle/brake/steer to whole percentages (clamped 0–99), emitting integer speed/RPM, and snapping distances/coords/times to 2 decimal places produced `lapdata_tt/bare_min_quant.csv` at **0.63 MB** raw and **0.17 MB** gzipped—only ~40% smaller than the float version. Pushing to fixed-point integers (distances/times/coords stored as centimetres + centiseconds) yielded `lapdata_tt/bare_min_fixed.csv` at **0.59 MB** raw and **0.18 MB** gzipped (gzip prefers repeated decimal strings over varied integers), so there’s diminishing return beyond column pruning.
- **Chunk per lap:** emit one CSV per lap rather than building mega-files; users then load only what they need, and compression stays efficient.
- **Transport compression:** even before we add client-side unzip, serve files over HTTP with gzip/deflate enabled to get the easy 60% reduction in transit.
- **Differential logging (future idea):** instead of writing every column every sample, log only changes beyond per-channel thresholds and inject periodic full snapshots (e.g., once per second). Applying thresholds of 0.5% for throttle/brake, 1 km/h for speed, 10 rpm for engine, 1° for steer, etc., to `bare_min.csv` drops the number of emitted events to: throttle 940, brake 1 228, speed 2 129, RPM 6 816, steer 1 025, gear 123, sector 3 while distance/time still tick every sample. Encoding just those change records plus ~100 keyframe rows could shrink raw text below ~300 KB, but it would require a custom diff file format and reconstruction logic in the viewer.

## Discarded CSV optimisations
| Approach | Outcome | Reason deferred |
| --- | --- | --- |
| Null-out unchanged cells | `bare_min_sparse.csv` leaves cells empty when values stay within thresholds (0.5 % inputs, 0.5 km/h speed, 20 rpm, 0.05 m coords). Result: **0.59 MB raw / 0.25 MB gz**. | Low payoff (≈5–10% savings) and worse gzip ratio; adds logger complexity without enough benefit. |
| Aggressive fixed-point rounding | `bare_min_fixed.csv` forces centimetre/centisecond ints and rounded channels. Size: **0.59 MB raw / 0.18 MB gz**, only marginally better than floats. | Reduces readability and flexibility; gzip prefers repeated decimal strings, so gains are negligible. |
| Predictive null extrapolation | Concept: logger extrapolates distance/speed/RPM and only logs real values when deviation exceeds a tolerance. Not built yet. | Would need a custom reconstruction pass or extra metadata to stay lossless; parked until we invest in a true diff format. |

## Additional implementation notes
- **Versioning:** include a `Format` + `Version` identifier so we can warn users if they attempt to load unsupported files.
- **Units in headers:** the `[unit]` suffix is helpful for humans and doesn’t hurt the parser. Keep everything SI (metres, seconds, km/h) and percentages.
- **Null handling:** log empty strings for unavailable samples (e.g., `X`/`Y` inside tunnels). The parser converts empty cells to `null`, which Chart.js simply skips.
- **Compression:** storing `.csv.gz` is acceptable – browsers can’t decompress on drop, but we can add an optional unzipper later. Until then, emit plain `.csv`.
- **Future extensions:** because extra columns are ignored until a feature consumes them, we can start logging richer signals now (tyre energy, ERS state, suspension travel) so historical files already contain the data once we expose new lanes.

This spec keeps us compatible with the current implementation while letting the custom logger provide deterministic, high-quality telemetry for every new lap.
