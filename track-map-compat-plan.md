## Track Map Format Migration Plan

### 1. Lock in the “simple” schema ✅

- Treat the JSON emitted by `admin/simple-track-map.html` (`left`, `right`, `center`, `meta`) as the canonical format for the SPA. _(Done – loader now expects this schema and README documents it.)_
- Document the field meanings (arrays of `{x,y}` objects, `meta.sampleCount`, `meta.smoothingWindow`, etc.) so future generators follow the same structure. _(Covered in the new README “Track map assets” section.)_

### 2. Update the SPA loader ✅

- Change `js/trackMapLoader.js` to parse the simple schema directly instead of the old `leftEdge/rightEdge/centerline` structure. _(Done – loader normalizes `{x,y}` objects and computes viewBoxes.)_
- Convert the `{x,y}` objects to tuples during load (`[x, y]`) for efficient rendering, and derive any additional metadata the viewer expects (e.g., `sampleCount`, `generatedAt`, `viewBox`). _(Implemented in `normalizeTrackMapData`.)_
- Remove the legacy validation checks and replace them with ones that ensure `left`, `right`, or `center` arrays exist. _(Completed.)_
- Cache normalized data as the new canonical representation. _(Completed via cache writes.)_

### 3. Adapt the renderer ✅

- Adjust `renderTrackLimits` in `js/trackMap.js` to consume the renamed fields (`left`, `right`, `center`) and render them with appropriate styling. _(Done – canvas renderer now draws the simple polylines.)_
- Include track-map coordinates in the bounds calculation so edges are visible even if the lap trace is smaller. _(Implemented when not zoomed.)_

### 4. Verification & rollout ✅

- Load the Algarve lap after the loader/renderer changes to confirm the new JSON displays “Track limits”. _(Done – manual browser verification complete.)_
- Add a focused unit test for the loader conversion. _(Done – see `tests/trackMapLoader.test.js`.)_
- Update documentation / README to state that track maps must follow the simple schema going forward. _(Completed via README update.)_
