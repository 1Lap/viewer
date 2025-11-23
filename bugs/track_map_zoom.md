The track map is not zooming in to the selected section when a selection is made on the lanes or the sector bar. The selection is highlighted with a thicker line, but the view doesn't actually zoom to show only the selected portion.

## Resolution

**Status**: ✅ Fixed

### Root Cause

In `public/js/trackMap.js`, the bounds calculation always used the full track extent (`activePoints`) to prevent the warping issue that was previously fixed in `track_view_warping.md`. However, this meant the view never actually zoomed when a selection was made - it only highlighted the selected portion with a thicker line.

The previous fix prevented warping by using stable bounds from the full track, but inadvertently disabled the zoom functionality entirely.

### Fix Applied

Modified `public/js/trackMap.js` to implement proper zoom functionality while maintaining aspect ratio:

1. **Calculate full track aspect ratio** (lines 83-97):
   - Calculate bounds from all `activePoints` to determine the track's natural aspect ratio
   - This aspect ratio is used as a reference to prevent warping

2. **Filter points when zoomed** (lines 99-102):
   - When `viewWindow` is set to a subsection, filter `activePoints` to only include visible points
   - When viewing the full lap, use all points

3. **Calculate bounds from visible points** (lines 104-115):
   - Calculate minX, maxX, minY, maxY from the filtered visible points
   - This creates the zoom effect by focusing on the selected portion

4. **Maintain aspect ratio** (lines 117-137):
   - When zoomed, expand bounds to match the full track's aspect ratio
   - If the visible section is too wide, expand vertically
   - If the visible section is too tall, expand horizontally
   - This prevents warping while still providing zoom

5. **Conditionally include track map boundaries** (lines 139-152):
   - Only include external track map boundaries when viewing the full lap
   - This prevents the track map from affecting zoom bounds

### Testing

All existing tests pass (12/12), including:
- Track map bounds consistency tests
- Aspect ratio maintenance tests
- Projection consistency tests

### Expected Behavior

When the user:
1. Clicks a sector button (e.g., "S1", "S2", "S3")
2. Selects a range on a chart lane
3. Drags on the progress bar to select a section

The track map now:
- Zooms in to show the selected portion at a larger scale
- Maintains the same aspect ratio as the full track (no warping)
- Centers on the visible portion of the track

## Related Bugs

- `track_view_warping.md` - Previous fix that prevented warping but disabled zoom functionality
