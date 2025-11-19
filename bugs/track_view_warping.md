The track view appears to "warp" based on which parts are visible. I'd like it to remain consistent and just have the feeling of "zooming".

## Resolution

**Status**: ✅ Fixed

### Root Cause

The track view was recalculating its coordinate bounds dynamically from only the visible portion of the lap data when zoomed. This caused different zoom levels to have different scale factors, creating a "warping" effect where the track appeared to stretch or compress as you zoomed in/out.

Specifically in `js/trackMap.js`:
- Line 80: `drawingPoints` was filtered to only visible points when zoomed
- Lines 86-92: Bounds (minX, maxX, minY, maxY) were calculated from `drawingPoints` only
- Line 113: Expansion factor was different for full view (0.05) vs zoomed (0.15)

### Fix Applied

1. **Consistent bounds calculation** (`js/trackMap.js:72-93`):
   - Changed to always calculate bounds from the full track extent (`activePoints`)
   - This ensures the coordinate system remains stable across all zoom levels

2. **Consistent expansion factor** (`js/trackMap.js:115-116`):
   - Changed from `shouldZoom ? 0.15 : 0.05` to constant `0.05`
   - This eliminates any remaining variance in the projection

3. **Always include track map boundaries** (`js/trackMap.js:108-113`):
   - Removed the `!shouldZoom` condition
   - Track map boundaries now always extend the bounds for consistency

### Testing

Added comprehensive tests in `tests/trackMap.test.js` that verify:
- Bounds remain consistent across different zoom levels
- Aspect ratio is maintained when zooming to different track sections
- World coordinates project to identical canvas coordinates regardless of zoom

All tests pass (11/11).