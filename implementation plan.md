implementation plan.md

## Purpose

Provide a concrete set of steps an LLM (or engineer) can follow to deliver the first usable version of the Telemetry Tool lap viewer described in `project plan.md` and the current `LLM output.md` prototype. The goal is a static, privacy-preserving web app that runs entirely client side, ingests Telemetry Tool lap exports, normalises them into a canonical model, and visualises multiple laps for comparison.

## Primary deliverable

* A self-contained static site (initially `index.html`, optionally split into `app.js` / `styles.css`) that:
  * Loads lap files via `<input type="file">` and drag/drop. MVP supports one lap at a time; architecture anticipates multi-lap selection later.
  * Parses CSV/semicolon Telemetry Tool exports into `Lap` + `LapSample` objects and captures metadata (track, car) for display.
  * Maintains in-browser state for lap metadata, telemetry arrays, view window, and per-lane display settings.
  * Presents a light-themed Garage-61-inspired layout: track map panel on the left; stacked lanes on the right. MVP renders throttle and brake lanes fully, while other lane placeholders remain ready for future data.

## Telemetry sample insights (from `bahrain_international_circuit_P_112.993_toyota_gr010.csv`)

* Files include several short metadata sections before the main telemetry table:
  * `player,...` and `Game,...` rows describe driver, sim, session, and best sectors.
  * `TrackID ...` and setup rows (wings, tyre pressures, etc.) provide car/track/environment info.
* The telemetry header row begins with `LapDistance [m],TotalDistance [m],LapTime [s],...`.
* Key channel names and units to support immediately:
  * Distance/time: `LapDistance [m]`, `LapTime [s]`, `TotalDistance [m]`.
  * Speed: `Speed [km/h]`.
  * Driver inputs: `ThrottlePercentage [%]`, `BrakePercentage [%]`, `Steer [%]`, `Clutch [%]`.
  * Additional useful channels: `Gear [int]`, `EngineRevs [rpm]`, world position `X/Y/Z [m]`, tyre/brake temps, wheel speeds.
* Metadata rows already expose lap time, track length, tyre compound, weather, etc. Capture these for display in the UI.

## Garage 61 analysis reference (`g61-view.jpg`)

* Layout: track map panel on the left, five stacked telemetry lanes on the right (speed, throttle, brake, gear+RPM, steering wheel angle), sector strip across the bottom.
* Multi-lap display: each lane and the map show all loaded laps simultaneously using distinct colours.
* Sector buttons (S1–S6 in screenshot) snap the view to that lap segment and zoom the telemetry lanes accordingly.
* Any lane or the sector bar acts as a range selector: drawing a selection zooms all lanes and highlights the corresponding section in both the sector bar and the track map.
* Desired track-map behaviour: zoom into the highlighted lap section with a margin before/after the selection; show lap paths per colour.
* MVP simplifications: single lap display, no interactive range selection yet, but layout/components should make it easy to add multi-lap overlays and linked selections later.

## Clarifications received

1. **Lane priority** – MVP must render throttle and brake lanes; additional lanes (speed, gear/RPM, steering) can be scaffolded but populated later.
2. **Sim coverage** – Only LMU telemetry needs support for now; optimise mappings and UX for this format.
3. **Sectors** – MVP can treat the entire lap as a single sector. Sector strip may display a single “Sector 1” placeholder until proper data/UX is defined.
4. **Multi-lap timing** – Implement single-lap experience first; once per-lane zooming and layout are solid, extend to multi-lap selection/comparison.
5. **Metadata in UI** – MVP should surface at least track name and car. Weather/tyres/fuel remain future enhancements.
6. **Theme** – Light theme only for MVP.
7. **File size expectations** – Current LMU lap files are ~12 MB; performance targets should consider this size, but variability is unknown.
8. **Deployment** – MVP will run via local browser loads (e.g., `file://`) or an nginx Docker container; hosting guidance for S3/CDN can wait.

## Open questions & clarifications needed

1. **Units confirmation** – LMU currently outputs km/h, %, metres, litres, etc.; confirm if any LMU scenarios output different units (e.g., mph) or if conversions must be user-configurable.
2. **Sector data source** – when moving past MVP, determine whether sector boundaries come from telemetry metadata, lap markers, or manual user input.
3. **File size targets** – 12 MB files parse fine in browsers, but clarify expected upper bounds (very long stints or multiple laps per file) to plan memory usage.
4. **Deployment path post-MVP** – once local/nginx testing stabilises, confirm whether S3/CloudFront or another static host is the long-term plan so scripts can target the right platform.

Record answers in this file (or a follow-up) before assigning to developers.

## Implementation phases

### 1. Project skeleton (0.5 day)

**Status:** ✅ Completed – `index.html` now provides the responsive HTML shell, fonts, and Chart.js include used by the app.

1. Create `index.html` with base HTML structure, linked stylesheet, and script section (or external `app.js`).
2. Add meta tags for responsive layout and basic styling placeholder (dark theme per current sketch).
3. Include Chart.js (CDN script tag) to avoid build tooling initially.

### 2. Shared data structures & utilities (0.5 day)

**Status:** ✅ Completed – `state.js`, `elements.js`, and `utils.js` define the shared Lap data model, colour palette, DOM helpers, and formatting utilities.

1. Define JS types (via JSDoc or TypeScript if desired later) for `Lap` and `LapSample`.
2. Implement a colour palette generator for distinguishing multiple laps (e.g., hue rotation).
3. Add status logging helper (`setStatus`) and formatted metadata generator for UI list.

### 3. File ingestion layer (0.5 day)

**Status:** ✅ Completed – drag/drop plus hidden file input are wired through `handleFiles`, enforcing client-side-only processing with user feedback.

1. Build drag-and-drop zone + hidden `<input type="file" multiple>`; style per design.
2. Wire drop/click events to a `handleFiles(FileList)` function.
3. Ensure only text files are processed; surface errors to status area if parsing fails.

### 4. Parsing module (1 day)

**Status:** ✅ Completed – `parser.js` normalises LMU CSV exports, maps headers, builds Lap/LapSample objects, and raises descriptive errors.

1. Implement `parseLapFile(rawText, fileName)`:
   * Detect delimiter (`;` vs `,`); the provided sample uses commas but includes decimal periods and bracketed units in headers.
   * Split into rows; strip UTF-8 BOM; detect and skip the initial metadata blocks (`player,...`, `Game,...`, `TrackID...`, `FWing,...`) before reaching the telemetry header row starting with `LapDistance [m],TotalDistance [m],...`.
   * Record metadata key/value pairs from the pre-header sections (e.g., track, car, lap time, tyre compound) for display.
2. Extract telemetry header columns (including unit annotations) and normalise for lookup (e.g., `lapdistance_m`, `speed_kmh`).
3. Implement `guessColumnIndices(headerCols)` with explicit mappings for observed names: `LapDistance [m]`, `LapTime [s]`, `Speed [km/h]`, `ThrottlePercentage [%]`, `BrakePercentage [%]`, `Steer [%]`, `Gear [int]`, `EngineRevs [rpm]`, plus placeholders for `X [m]`, `Y [m]`, etc. Provide fallbacks for other sims that might omit units.
4. Iterate telemetry rows:
   * Convert required columns to numbers; skip rows lacking `LapDistance` or `LapTime`.
   * Build `LapSample` entries; default missing optional channels to `null`.
5. Sort samples by distance if not strictly increasing.
6. Compute lap metadata (sample count, approximate lap length from `Tracklen [m]` or last `LapDistance`, min/max speed) for UI display.
7. Return a `Lap` object with unique ID (use incremental counter or timestamp) and attach metadata captured earlier.
8. Ensure parser throws descriptive errors when mandatory columns are missing so header mapping can be extended.

### 5. Application state & UI integration (0.5 day)

**Status:** ✅ Completed – global state (laps, colours, view window, cursor) drives metadata, lane visibility, and shared cursor interactions.

1. Maintain `const laps = []` (store parsed `Lap` objects) plus `viewState = {activeLapId, windowStart, windowEnd, cursorDistance}`; MVP can default to `activeLapId = laps[0]?.id`.
2. Render lap list dynamically even if only one lap is supported initially; disable multi-select controls but keep structure ready for future toggles.
3. Capture per-lane visibility toggles and preferences (e.g., show/hide gear lane) in state for future persistence.

### 6. Layout & lane scaffolding (0.75 day)

**Status:** ✅ Completed – light-themed Garage 61 layout is implemented with track panel, stacked lane cards, and placeholders for future charts.

1. Build responsive light-themed layout: left column reserved for track map (~30% width), right column stacked telemetry lanes, sector strip along bottom spanning width.
2. Implement reusable “lane” component wrapper (title, legend placeholders, canvas/container) with theme variables for consistent colours.
3. For MVP, fully render throttle and brake lanes; include placeholders for speed, gear+RPM, steering so they can be enabled later without HTML restructuring.

### 7. Lane rendering (1.25 days)

**Status:** ✅ Completed – throttle and brake lanes render via Chart.js with synced hover cursors and datasets for multiple laps.

1. Implement Chart.js (or Canvas) renderers for throttle and brake lanes sharing a common X axis (lap distance or time). Keep helper utilities generic so additional lanes can reuse them.
2. Feed lanes with the single active lap; ensure colour palettes align with light theme readability.
3. Synchronise hover markers across rendered lanes: when user hovers lane X, draw a vertical indicator on both throttle and brake lanes and emit cursor distance for the track map.
4. Add lane-level controls (e.g., smoothing toggle) in state for future use even if hidden in MVP.

### 8. Track map placeholder (0.75 day)

**Status:** ✅ Completed – `trackMap.js` plots lap geometry, highlights the current view window, and displays cursor dots per visible lap.

1. Use telemetry `X [m]`/`Y [m]` columns to plot the lap path in the left panel using a light-theme-friendly stroke.
2. Highlight the current cursor position (from lane hover) on the track map; MVP can simply draw a small dot and show the lap outline without zooming.
3. Prepare hooks for future zoom-to-selection behaviour: support drawing sub-path segments when given `startDistance`/`endDistance`, but keep the MVP fixed to the full lap.

### 9. Sector strip (0.5 day)

**Status:** ✅ Completed – the sector bar renders the “All” button plus any parsed sectors, and the progress track supports drag-to-zoom & cursor preview.

1. For MVP, render a single “Sector 1” button covering the whole lap; clicking it resets `viewWindow` to the entire lap.
2. Display a lap progress bar beneath the button to familiarise users with the future interaction zone; highlight the current view window (entire lap initially).
3. Keep component API flexible so multiple sectors can be inserted later once data is available.

### 10. Validation & UX polish (0.5 day)

**Status:** ⏳ In progress – automated parser/state tests now live under `tests/` (run via `npm test`), but we still need broader manual/perf validation and UX copy polish (privacy messaging, drag/drop instructions).

1. Test with sample lap files of varying delimiters to ensure parsing robustness.
2. Confirm performance with multiple large files (profiling via browser dev tools).
3. Add copy in the UI describing privacy guarantees (no upload, runs client-side).
4. Provide quick instructions near drop zone (supported formats, max size, etc.).

### 11. Packaging & deployment (0.5 day)

**Status:** ✅ Completed – README documents file and nginx usage; the app runs cleanly on a static HTTP server.

1. Add minimal README covering usage (open `index.html` via `file://` or serve via lightweight HTTP server) and telemetry file expectations.
2. Provide instructions for running an nginx Docker container to serve the static files locally (e.g., `docker run -v $(pwd):/usr/share/nginx/html:ro -p 8080:80 nginx`).
3. Note that cloud hosting guidance (S3/CloudFront) will arrive post-MVP once deployment targets are confirmed.

## Stretch items (post-MVP)

* Multi-lap overlays: allow selecting multiple laps (from same or different files) and render them simultaneously in each lane and on the track map with distinct colours/legends.
* Range selection / zoom sync: drag across any lane or the sector bar to define a custom window; pan/zoom updates all lanes and track map with highlighted region (mirroring Garage 61’s behaviour).
* Delta-time trace: optional extra lane plotting reference–comparison delta when multi-lap mode is enabled.
* Track-map zooming: smoothly zoom to highlighted range with padding on either side; consider minimap/overview for context.
* Per-sim column presets: maintain JSON mapping of known header variants (ACC, iRacing, LMU, etc.) and allow manual override if auto-detect fails.
* Local storage: save last selected lap, active sectors, and theme preferences for quick reloads.

## Quality checks before handoff

1. Confirm lint-free HTML/CSS/JS (run `npm run lint` if tooling added; otherwise use browser console).
2. Validate file parsing against multiple real exports; update mapping table accordingly.
3. Verify chart updates correctly when laps are added/removed or channels switched.
4. Ensure instructions + privacy statement are accurate and visible.
5. Re-run through a clean browser session (hard refresh) to verify no required caching.

Once unknowns above are resolved, this plan can be handed to developers/LLM to implement iteratively.
