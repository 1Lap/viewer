the track view is rendering the wrong way around for me on a track. We should always render in the "top down" view.

## Analysis

**Root Cause:** The `projectToCanvas` function in `public/js/trackMap.js` (line 189) has a horizontal flip bug:

```javascript
const x = paddingX + (1 - normX) * width;  // This flips left/right!
```

The `(1 - normX)` inverts the x-axis, causing the track map to be mirrored horizontally.

**Solution:** Remove the horizontal flip by using `normX` directly:

```javascript
const x = paddingX + normX * width;  // Correct mapping
```

The y-axis transformation is correct and should remain unchanged.

## Status

✅ **RESOLVED** - Fixed in commit 605a288

The horizontal flip has been removed from the coordinate projection, and track maps now render in the correct orientation.