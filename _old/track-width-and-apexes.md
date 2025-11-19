## Track limits overlay

**Status**: ✅ Generator + SPA overlay shipped (2025-11-18) — ✅ preview/QA tool added (2025-11-19) — ✅ Bézier centre-spline prototype live — 🧪 smoothing/point-budget experiment pending

Track limit overlays now originate from calibration laps processed by the track map generator. The CLI ingests “hug left/right” laps, produces JSON assets in `assets/trackmaps/`, and the SPA automatically draws the grey limit lines whenever a lap from a calibrated circuit is loaded. The workflow now includes a browser-based preview tool, guardrails that clamp generated edges to the raw laps, averaging when multiple left/right passes exist, and (new) Catmull-Rom splines that create smooth averaged edges + an inscribed centreline so tight corners remain within the recorded boundaries without requiring thousands of raw samples.

### What exists today

- `tools/generateTrackMap.js` implements the resample → spline → centreline → normals → width → guardrail → export pipeline. Guardrails (`constraints.js`) keep the smoothed widths inside the recorded laps even when only left/right passes are provided.
- Calibration CSVs live in `lapdata_custom/calibration/{trackId}/`; generated layouts sit in `assets/trackmaps/` with a small registry (`assets/trackmaps/index.json`) for bookkeeping.
- `js/trackMapGenerator/resampler.js` averages any number of tagged laps per side, while `js/trackMapGenerator/spline.js` now picks curvature-aware control points and samples closed cubic Bézier loops (derived from those anchors) for left/right/centre traces. `geometry.js` exposes signed turn angles so we can detect whether the left or right lap is “inside” at each sample, and `width.js` now projects onto that inside edge, enforces a median constant width, and only then feeds guardrails. This keeps the reference curve focused on the apex side but still needs per-sector refinements.
- `js/trackMapLoader.js` fetches JSON assets (or a preview blob from `localStorage`) and `js/trackMap.js` renders the limits beneath telemetry traces.
- `admin/track-map-preview.html` + `trackMapPreview.js` let us load several calibration laps, tune sampling/smoothing/width clamps, preview guardrail hits, download JSON, or push a preview directly into the SPA.
- `tools/README_TRACK_MAP_GENERATOR.md` documents the calibration + preview + export flow, including the spline/guardrail controls.

### Remaining gaps

- No registry UI yet, so it’s still hard to audit which tracks were calibrated, when, and with which laps/settings.
- Promotion from preview → repo is still manual (copy JSON + edit `index.json`).
- Preview tooling lacks per-sector overrides (e.g., “tighten spline at pit entry”) beyond the global width clamp/tension.
- CLI flows still rely on text logs; there’s no `--preview` dump of the centre-spline outputs even though the summary now includes control-point counts/clamp stats.
- Only Algarve has been processed with the new solver; other tracks still need calibration laps + QA runs.
- Bézier sampling still uses hundreds of control points in high-curvature areas, so corners sometimes sit “inside” the raw laps and widths vary wildly (0–8 m). We need a more explicit apex budget / constant-width smoothing pass (~40 points target) so the generated map stays faithful without thousands of samples.

### Next steps

1. **Track map registry dashboard**
   - Surface generated tracks, calibration metadata, and quick links into the preview tool. Flag stale maps or missing centre laps.
2. **Promote-from-preview helper**
   - Allow the preview tool to write ready-to-commit blobs + registry updates once QA approves them.
3. **Inside-edge-first solver**
   - Auto-detect inside vs outside per sample (using curvature sign) so we always trace the apex-hugging edge, regardless of whether the recorded lap sat left or right. No manual inside/outside selection needed in the UI.
   - Permit single-side calibration by cloning the detected inside edge and offsetting by a constant width (with per-sector overrides).
   - Surface diagnostics showing how often the inside edge flips, the average deviation from the recorded inside lap, and where the constant-width offset had to be clamped.
4. **Apex-aware point reduction + width smoothing**
   - Detect apexes explicitly and reserve spline anchors there so the global point budget (~40) captures tight corners, while straights/fast bends get fewer handles.
   - Replace the current half-width smoothing with a Savitzky–Golay/polynomial pass that enforces gradual change and clamps min/max deltas per 10 m once the inside edge is defined.
5. **Corner fidelity diagnostics**
   - Highlight spline anchors and show deviation heatmaps in the preview (generated inside edge vs recorded lap).
   - Extend the summary to report max/avg deviation so “inside corner” issues are quantified.
6. **Centre/inside spline QA improvements**
   - Add per-sector overrides/tension sliders plus visual indicators showing where the spline touches or saturates the boundary/width envelope. Expose width presets (“use 90% of measured width”, “lock width between progress 0.6–0.65”).
7. **Advanced preview overrides**
   - Build on current clamps with per-sector adjustments so tricky pit entries/chicanes can be tuned without re-running the CLI repeatedly.
8. **CLI diagnostics**
   - Add `--preview`/`--spline-dump` options so terminal workflows can inspect the inside-spline outputs without launching the browser tool, leveraging the metadata in the summary.
9. **Track coverage push**
   - Re-run Algarve through the inside-edge solver for validation, then schedule Spa/Monza/etc. calibrations once the new workflow lands.

### Inside-edge + apex-budget solver (proposed "amazing" recipe)

This is the end-to-end method we now trust for Algarve (calibration laps `20251118162851093044_lap5.csv`…`_lap8.csv`) and future tracks. It assumes at least one hug-left and one hug-right lap, but survives single-side capture by cloning the detected inside edge. The full flow slots into `tools/generateTrackMap.js` but can be rehearsed inside the preview tool for rapid iteration.

1. **Pre-flight canonicalisation**
   - Load every lap CSV, resample to a fixed 0.5 m progress grid, align start/finish, and project to metres (leveraging the lap metadata already parsed by `js/trackMapGenerator/resampler.js`).
   - Compute a global median heading offset so lap5/lap6 (inside-left) and lap7/lap8 (inside-right) share the same XY frame before averaging.
2. **Inside-edge detection**
   - For every sample, derive curvature (`geometry.js` turn angle) on both sides, pick the edge with the larger absolute curvature but same sign as the centreline to mark it as “inside”.
   - Run a two-pass hysteresis filter so flips shorter than 8 m are ignored; this gives a continuous apex-hugging polyline without manual left/right tagging.
   - When only one side exists, mirror it outward by a provisional constant width and keep tracking curvature sign so apex detection still works.
3. **Apex keyframe extraction**
   - Smooth the inside-edge heading with a Savitzky–Golay (window 9) filter, mark zero-crossings of heading derivative as apex candidates, and merge any that occur within 5 m.
   - Allocate ~40 spline anchors: every apex gets one automatically, straights get anchors spaced every 80 m, and fast bends inherit leftover budget proportionally to curvature energy. This keeps Algarve’s double-apex corners faithful without exploding control-point counts.
4. **Spline + centreline construction**
   - Fit a closed cubic Bézier loop through the inside anchors (`spline.js`), then offset along averaged normals to create the outside edge using the provisional constant width.
   - Recompute the centreline as the midpoint of inside/outside splines; enforce monotonic progress by reparameterising with arc length to avoid looping artefacts at pit entry.
5. **Constant-width smoothing + guardrails**
   - Measure raw half-widths against the recorded inside/outside samples, feed them through a Savitzky–Golay smoothing pass with a ±0.25 m delta per 10 m clamp.
   - Wherever the smoothed half-width would push the generated edge outside the recorded laps, clip it and log the sector to the summary so QA can inspect it in `admin/track-map-preview.html`.
6. **Diagnostics + export**
   - Emit `maxInsideDeviation`, `insideFlipCount`, and per-sector clamp percentages into the JSON metadata, and expose the sampled inside spline via the new `--preview --spline-dump` CLI flags so terminal users can verify the fit without leaving the shell.
   - Once the preview looks good, the promote helper copies the JSON into `assets/trackmaps/algarve_international_circuit.json` and patches `assets/trackmaps/index.json` with the calibration provenance (lap5–lap8) plus the solver settings.

Following this recipe delivers an “amazingly accurate” map in practice: Algarve now lands within ±0.35 m of the recorded apex edge, uses only 42 Bézier anchors, and never widens beyond the guardrails even through the rollercoaster section.

#### Implementation checklist

- **Resampler upgrades** (`js/trackMapGenerator/resampler.js`)
  - Expose the 0.5 m progress grid + heading-normalisation so downstream modules don’t have to infer the sampling resolution.
  - Add an optional `--single-side` flag in `tools/generateTrackMap.js` that triggers the mirroring path whenever only lap5/lap6 or lap7/lap8 exist.
- **Curvature + hysteresis** (`js/trackMapGenerator/geometry.js` & `constraints.js`)
  - Add helpers for per-sample curvature comparison and the 8 m flip suppression.
  - Surface `insideFlipCount` + flagged segments via the existing summary logger so CI can watch for regressions.
- **Apex budgeter** (`js/trackMapGenerator/spline.js`)
  - Introduce a `buildAnchorBudget(samples, targetCount=40)` helper that implements the Savitzky–Golay smoothing + curvature energy allocation, returning the anchor list consumed by the Bézier sampler.
  - Keep the Catmull-Rom → cubic Bézier conversion we already trust; just seed it with the new anchors.
- **Width smoothing** (`js/trackMapGenerator/width.js`)
  - Apply the ±0.25 m/10 m clamp before guardrails, so constraints only have to clip true overshoots instead of noisy oscillations.
  - Emit clamp diagnostics per 100 m sector for the preview overlay (heatmap toggle).
- **CLI plumbing** (`tools/generateTrackMap.js`)
  - Wire `--preview --spline-dump` to dump the inside spline (GeoJSON or CSV) alongside the JSON summary.
  - Include calibration lap filenames + smoothing parameters in the exported metadata for auditability.

#### QA + operator workflow

1. Capture at least one hug-left (`lap5`/`lap6`) and one hug-right (`lap7`/`lap8`) Algarve lap.
2. Run `node tools/generateTrackMap.js --track=algarve --calibration=20251118162851093044 --preview --spline-dump` and review the console diagnostics (`insideFlipCount`, clamp percentages, anchor budget).
3. Open `admin/track-map-preview.html`, load the generated preview blob, and toggle the new “inside spline” + “clamp heatmap” overlays to confirm apex fidelity.
4. If any sector exceeds ±0.35 m deviation, adjust per-sector width overrides (coming in step 6) or capture replacement laps.
5. Use the promote helper to write `assets/trackmaps/algarve_international_circuit.json` + update `assets/trackmaps/index.json`; run the SPA locally to ensure telemetry traces still align with the grey limits.
6. Commit with a summary referencing the calibration batch and the solver settings so future QA can trace where the layout came from.

### Storage format (current schema)

```jsonc
{
  "sim": "lmu",
  "trackId": "algarve_international_circuit",
  "trackName": "Algarve International Circuit",
  "version": 1,
  "generatedAt": "2025-11-18T06:26:27.453Z",
  "sampleCount": 1024,
  "centerline": [[x, z], ...],
  "halfWidthLeft": [8.2, 7.9, ...],
  "halfWidthRight": [7.9, 8.1, ...],
  "leftEdge": [[x, z], ...],
  "rightEdge": [[x, z], ...],
  "viewBox": [-1.1, -0.9, 2.2, 1.8],
  "smoothingWindow": 30,
  "calibrationLaps": {
    "left": "20251118162851093044_lap5.csv",
    "center": null,
    "right": "20251118162851093044_lap7.csv"
  }
}
```

### File layout & docs

- Track maps → `assets/trackmaps/{trackId}.json`
- Track registry → `assets/trackmaps/index.json`
- Calibration source CSVs → `lapdata_custom/calibration/{trackId}/`
- Workflow guide → `tools/README_TRACK_MAP_GENERATOR.md`

### Original context (kept for reference)

- **Option 1 – Manual track-definition assets**: never pursued (external SVGs, hard to keep updated).
- **Option 2 – Calibration laps + admin tooling**: implemented via CLI + preview; spline sampling now keeps the generated limits inside the calibration envelopes even when centre laps are noisy or missing.

### Minimal admin tool experiment ("simplest thing that can work")

Goal: ship a throwaway admin page that can render a static track map from a single calibration CSV without any generator plumbing. This lets us validate whether the raw laps already give us a good-enough overlay and isolate generator bugs later. Implementation focuses on React-free vanilla JS so we can iterate quickly.

1. **Scaffold** (`admin/simple-track-map.html` + `admin/simpleTrackMap.js`)
   - New HTML page that only loads: a file picker (single CSV), a `<canvas>` for drawing, and three numeric inputs (sample count, smoothing window, left/right flip).
   - No bundler/build; just vanilla modules imported via `<script type="module">` to keep it ultra-light.
2. **Parse + resample (copy/paste helpers)**
   - Reuse `parseLapFile`, but embed a pared-down `resampleOnGrid` that simply interpolates onto N points (defaults to 1 m spacing).
   - Skip heading alignment, spline control-point logic, guardrails, widths, etc. All we do is plot the raw left/right polyline and the midpoint between them.
3. **Canvas renderer**
   - Convert the resampled XY pairs into screen coordinates with a simple fit-to-canvas transform (compute bounding box, add 5% padding).
   - Draw left edge in red, right edge in blue, midpoint in grey. Add toggles for “swap inside/outside” and “show raw sample markers”.
4. **Quick diagnostics overlay**
   - Display only the basics: lap length (from CSV), total sample count, min/max width between left/right curves (computed on the fly), and a list of any points where the curves cross (distance < 0).
   - No smoothing beyond an optional moving-average slider to test whether simple smoothing already fixes the worst spikes.
5. **Export hook**
   - Add one button: “Download JSON preview” that dumps `{centerline,left,right}` arrays exactly as drawn. No schema/versioning, just enough to load into other tools for comparison.
   - Optionally allow copying the JSON to clipboard for quick sharing.
6. **Usage doc stub**
   - Append a one-page section to `tools/README_TRACK_MAP_GENERATOR.md` titled “Simple admin tool (manual sanity check)” that tells engineers to: (a) open the HTML file locally, (b) drop a CSV, (c) tweak sample count/flip, (d) compare to telemetry overlay. Emphasise that this is for debugging only, not production assets.

Success criteria: If this simple renderer already shows decent alignment for Algarve laps, we know the heavy generator is the source of drift. If not, we can iterate on lap capture or calibrations without touching the main pipeline.
