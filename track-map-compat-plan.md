## Track Map Format Migration Plan

### 1. Lock in the “simple” schema ✅
- Treat the JSON emitted by `admin/simple-track-map.html` (`left`, `right`, `center`, `meta`) as the canonical format for the SPA. *(Done – loader now expects this schema and README documents it.)*
- Document the field meanings (arrays of `{x,y}` objects, `meta.sampleCount`, `meta.smoothingWindow`, etc.) so future generators follow the same structure. *(Covered in the new README “Track map assets” section.)*

### 2. Update the SPA loader ✅
- Change `js/trackMapLoader.js` to parse the simple schema directly instead of the old `leftEdge/rightEdge/centerline` structure. *(Done – loader normalizes `{x,y}` objects and computes viewBoxes.)*
- Convert the `{x,y}` objects to tuples during load (`[x, y]`) for efficient rendering, and derive any additional metadata the viewer expects (e.g., `sampleCount`, `generatedAt`, `viewBox`). *(Implemented in `normalizeTrackMapData`.)*
- Remove the legacy validation checks and replace them with ones that ensure `left`, `right`, or `center` arrays exist. *(Completed.)*
- Cache normalized data as the new canonical representation. *(Completed via cache writes.)*

### 3. Adapt the renderer ✅
- Adjust `renderTrackLimits` in `js/trackMap.js` to consume the renamed fields (`left`, `right`, `center`) and render them with appropriate styling. *(Done – canvas renderer now draws the simple polylines.)*
- Include track-map coordinates in the bounds calculation so edges are visible even if the lap trace is smaller. *(Implemented when not zoomed.)*

### 4. Verification & rollout ✅
- Load the Algarve lap after the loader/renderer changes to confirm the new JSON displays “Track limits”. *(Done – manual browser verification complete.)*
- Add a focused unit test for the loader conversion. *(Done – see `tests/trackMapLoader.test.js`.)*
- Update documentation / README to state that track maps must follow the simple schema going forward. *(Completed via README update.)*
