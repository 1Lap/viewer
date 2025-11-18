## Track limits overlay

**Status**: ✅ **IMPLEMENTED** (2025-11-18)

Track limit overlays are now generated from calibration laps using the track map generator tool. The SPA automatically renders track limits beneath telemetry traces when track maps are available.

### Implementation: Calibration laps + admin tool ✅

**Core system implemented**:
1. ✅ CLI tool (`tools/generateTrackMap.js`) for processing calibration laps
2. ✅ Drive 2-3 calibration laps at each circuit:
   - Left-limit lap (required)
   - Right-limit lap (required)
   - Center/racing-line lap (optional)
3. ✅ Export via LMU telemetry logger
4. ✅ Processing pipeline:
   - Resample each lap onto a common progress grid (0→1) using cumulative distance
   - Extract centerline (from center lap or average of left/right)
   - Compute tangents/normals along centerline
   - Project left/right laps onto normals to calculate half-widths
   - Apply circular moving average smoothing (configurable window size)
   - Generate left/right edge polylines from `centerline ± halfWidth * normal`
   - Export JSON with centerline, edges, widths, and viewBox
5. ✅ SPA integration:
   - Async loader (`js/trackMapLoader.js`) with caching
   - Automatic rendering in track view beneath telemetry traces
   - Track limits shown as gray lines, centerline as dashed line

**Future enhancements** (deferred):
- ⏳ HTML preview tool for QA (overlay showing raw laps vs generated edges)
- ⏳ Interactive controls to tune smoothing or manually adjust sections
- ⏳ Apex detection and shading from curvature analysis
- ⏳ Sector markers on track map
- ⏳ Multi-lap averaging (>3 calibration laps)

### Storage format (implemented)
```jsonc
{
  "sim": "lmu",
  "trackId": "algarve_international_circuit",
  "trackName": "Algarve International Circuit",
  "version": 1,
  "generatedAt": "2025-11-18T06:26:27.453Z",
  "sampleCount": 1024,
  "centerline": [[x, y], ...],           // 1024 [x, z] coordinate pairs
  "halfWidthLeft": [8.2, 7.9, ...],      // meters from centerline
  "halfWidthRight": [7.9, 8.1, ...],     // meters from centerline
  "leftEdge": [[x, y], ...],             // computed left boundary
  "rightEdge": [[x, y], ...],            // computed right boundary
  "viewBox": [-1.1, -0.9, 2.2, 1.8],     // [minX, minY, width, height]
  "smoothingWindow": 30,                 // settings used
  "calibrationLaps": {
    "left": "lap5.csv",
    "center": null,
    "right": "lap7.csv"
  }
}
```

**Files**:
- Track maps stored in `assets/trackmaps/{trackId}.json`
- Registry at `assets/trackmaps/index.json`
- First generated map: Algarve International Circuit (140KB, 1024 samples)

**Usage**:
```bash
# Generate track map
node tools/generateTrackMap.js \
  --input lapdata_custom/calibration/algarve \
  --output assets/trackmaps/algarve_gp.json \
  --left lap5.csv --right lap7.csv

# View in SPA
# Load any lap from Algarve - track limits render automatically
```

**Documentation**: See `tools/README_TRACK_MAP_GENERATOR.md` for complete workflow guide.

---

### Related Work

**Option 1 – Manual track-definition assets** (not pursued)
- Build or source per-track SVGs/polylines (e.g., from existing CAD or community data).
- Store them in the app keyed by `trackId`.
- Pros: one-time effort if data exists; accurate reference lines.
- Cons: requires external assets; difficult to update when layouts change.

Option 2 was chosen as it's more flexible and doesn't require external data sources.

