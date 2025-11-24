# Optimize Share Lap Links

**Status**: 🚧 In Progress

## Problem

The share lap feature works, but generates links that are still quite large. Now that we've:
- Significantly reduced lap file sizes through data optimization
- Implemented `sparsenData()` to remove consecutive duplicate values per channel in the viewer
- Improved overall data efficiency

...we should be able to make share links much smaller and more practical.

## Current Implementation

The share feature (in `public/js/share.js`) currently:
- ✅ Downsamples to max 1200 samples uniformly
- ✅ Uses delta encoding for distance, time, x, y, z
- ✅ Uses varint encoding for compact storage
- ✅ Compresses with gzip
- ✅ Base64url encodes for URL safety

However, it:
- ❌ Doesn't leverage the consecutive duplicate removal we use in rendering
- ❌ Always includes all metadata even if large
- ❌ Uses uniform downsampling which can lose important features
- ❌ Includes all channels even if they're constant or unused
- ❌ Could use more aggressive quantization for some fields

## Opportunities for Optimization

### 1. **Apply Sparse Data Before Encoding** (Highest Impact)
Instead of uniform downsampling, apply `sparsenData()` to each channel individually to remove consecutive duplicates. This preserves visual fidelity while dramatically reducing data points for channels that don't change much (like gear during straights, constant throttle, etc.).

### 2. **Smart Downsampling** (High Impact)
After deduplication, if we still exceed the sample limit, use a smarter downsampling strategy:
- Preserve peaks and valleys in speed/throttle/brake
- Keep all gear changes
- Preserve sector boundaries
- Only then apply uniform downsampling to remaining sections

### 3. **Conditional Channel Inclusion** (Medium Impact)
Analyze each channel before encoding:
- If a channel is constant (e.g., all values are the same), don't encode it
- Include a bitmap/flags to indicate which channels are present
- Only decode present channels on import

### 4. **Metadata Optimization** (Medium Impact)
- Abbreviate metadata field names (e.g., `t` for track, `d` for driver)
- Only include non-empty metadata fields
- Consider omitting very large fields that aren't essential

### 5. **More Aggressive Quantization** (Low-Medium Impact)
Review quantization scales for fields where we can afford less precision:
- Throttle/brake: currently 0-255, could potentially use 0-100 or even 0-10 for zones
- Steering: similar optimization possible
- RPM: current 10 RPM increments could potentially be 50-100 for most applications

### 6. **Optional Coordinate Exclusion** (Medium Impact)
For laps where track map isn't critical to the share, allow excluding x/y/z coordinates entirely. The recipient can still see all the telemetry lanes.

## Expected Benefits

- **50-70% reduction** in share link size from sparse data alone
- **Additional 10-20% reduction** from conditional channels
- **Faster compression** due to less data to process
- **Better fidelity** for the same size (smart sampling preserves important features)
- **More practical sharing** - smaller URLs, easier to share via messaging apps

## Implementation Priority

1. ✅ Apply `sparsenData()` per channel before encoding (biggest win)
2. ✅ Conditional channel inclusion with flags
3. ⏳ Metadata abbreviation and filtering
4. ⏳ Smart downsampling strategy
5. ⏳ More aggressive quantization (test carefully)

## Testing Considerations

- Verify round-trip accuracy: share → import should preserve visual appearance
- Test with variety of lap types:
  - Smooth laps (low variation)
  - Aggressive laps (high variation)
  - Different track lengths
- Check URL length boundaries (8000 char limit triggers chunking)
- Ensure backward compatibility with existing share links (version flag = 1)

## Notes

The goal isn't to achieve perfect fidelity to the original lap file, but to preserve the **visual appearance** and **analytical value** of the telemetry. Small quantization errors are acceptable if they don't affect the user's ability to analyze their driving.
