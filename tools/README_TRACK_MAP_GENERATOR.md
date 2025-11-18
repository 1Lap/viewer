# Track Map Generator - Workflow Guide

This guide explains how to generate track maps from calibration laps for use in the telemetry analysis SPA.

## Overview

Track maps provide visual context by overlaying track limit boundaries beneath telemetry traces in the track view. To generate a track map, you need to drive calibration laps that follow the left and right edges of the track, then process them using the track map generator tool.

## Prerequisites

- LMU (Le Mans Ultimate) with telemetry export enabled
- Node.js installed (for running the generator)
- Access to the track you want to calibrate

## Step 1: Recording Calibration Laps

### Requirements

You need **at minimum 2 laps**:

- **Left-limit lap**: Drive around the track hugging the left edge (inside of corners on left-hand turns, outside on right-hand turns)
- **Right-limit lap**: Drive around the track hugging the right edge (opposite of left-limit lap)

**Optional but recommended**:

- **Center lap**: Drive a normal racing line through the middle of the track

### Tips for Good Calibration Laps

1. **Drive slowly** - Accuracy is more important than speed
2. **Stay on track** - Going off-track will create outliers in the data
3. **Complete a full lap** - Start and end at the same point (e.g., start/finish line)
4. **Be consistent** - Try to hug the limit evenly throughout the lap
5. **Avoid pit entry/exit** - These can create confusing width variations

### Recording Process

1. In LMU, go to the track you want to calibrate
2. Start a practice session
3. Enable telemetry export in your game settings (if not already enabled)
4. Drive your calibration laps:
   - Lap 1: Left-limit lap
   - Lap 2: Center/racing-line lap (optional)
   - Lap 3: Right-limit lap
5. Exit the session - LMU will export the telemetry CSV files

### Finding Your Exported Laps

LMU exports telemetry files to a directory (typically in your Documents folder). Copy the calibration lap CSVs to:

```
telemetry_analysis/lapdata_custom/calibration/{trackId}/
```

For example:

```
lapdata_custom/calibration/algarve/
  20251118162851093044_lap5.csv  (left-limit)
  20251118162851093044_lap6.csv  (center, optional)
  20251118162851093044_lap7.csv  (right-limit)
```

## Step 2: Generating the Track Map

### List Available Calibration Files

First, verify your calibration files are in the correct directory:

```bash
node tools/generateTrackMap.js \
  --input lapdata_custom/calibration/{trackId} \
  --list
```

Example:

```bash
node tools/generateTrackMap.js \
  --input lapdata_custom/calibration/algarve \
  --list
```

This will show all CSV files in the directory.

### Generate Track Map

Run the generator with your calibration laps:

```bash
node tools/generateTrackMap.js \
  --input lapdata_custom/calibration/{trackId} \
  --output assets/trackmaps/{trackId}.json \
  --left {left-lap-filename}.csv \
  --right {right-lap-filename}.csv \
  [--center {center-lap-filename}.csv] \
  [--samples 1024] \
  [--smooth 30]
```

**Required arguments**:

- `--input <dir>`: Directory containing calibration CSV files
- `--output <file>`: Output path for generated JSON (should be `assets/trackmaps/{trackId}.json`)
- `--left <file>`: Filename of left-limit lap
- `--right <file>`: Filename of right-limit lap

**Optional arguments**:

- `--center <file>`: Filename of center/racing-line lap
- `--samples <n>`: Number of grid samples (default: 1024, higher = more detail)
- `--smooth <n>`: Smoothing window size (default: 30, higher = smoother but less detailed)

**Example**:

```bash
node tools/generateTrackMap.js \
  --input lapdata_custom/calibration/algarve \
  --output assets/trackmaps/algarve_gp.json \
  --left 20251118162851093044_lap5.csv \
  --right 20251118162851093044_lap7.csv \
  --samples 1024 \
  --smooth 30
```

### Understanding the Output

The generator will:

1. Load and parse your calibration CSVs
2. Resample them onto a common progress grid
3. Extract or compute the centerline
4. Calculate track widths
5. Apply smoothing
6. Generate left/right edge polylines
7. Export as JSON to `assets/trackmaps/`

You'll see progress messages and validation warnings:

```
=== Track Map Generator ===

[1/9] Loading calibration laps...
  ✓ Loaded 2 laps for track: Algarve International Circuit
[2/9] Resampling laps onto common progress grid...
  ✓ Resampled to 1024 uniform points
...
```

**Common warnings**:

- **Closure warnings**: Start/end points don't align perfectly. This is common if you didn't start/end at the exact same spot.
- **Width outliers**: Sudden width changes, often from going off-track or at pit entry/exit. The generator will clamp these automatically.
- **Negative widths**: Left/right edges crossed over. Usually smoothed out by the algorithm.

These warnings are often expected and the generator handles them. Review the final summary to ensure the average track width looks reasonable (typically 10-15 meters for most race tracks).

### Output Summary

After generation, you'll see a summary:

```
Track Map Summary
=================
Track: Algarve International Circuit
Track ID: algarve_international_circuit
Sample Count: 1024
Smoothing Window: 30

Track Width Statistics:
  Average Total: 13.56m
  Average Left: 7.49m (range: 2.00m - 15.00m)
  Average Right: 6.08m (range: 2.00m - 13.79m)

Calibration Laps:
  Left: 20251118162851093044_lap5.csv
  Center: none
  Right: 20251118162851093044_lap7.csv

Generated: 2025-11-18T06:26:27.453Z

✅ Track map generation complete!
```

Verify the average track width looks plausible for the circuit.

## Step 3: Adjusting Settings (If Needed)

If the initial result has issues:

### Track Too Noisy (Jagged Edges)

Increase the smoothing window:

```bash
--smooth 50
```

### Track Too Smooth (Losing Detail in Chicanes)

Decrease the smoothing window:

```bash
--smooth 15
```

### Need More Detail

Increase the number of samples:

```bash
--samples 2048
```

### Track Doesn't Close

This usually means your calibration laps didn't start/end at the same point. You can either:

1. Re-record calibration laps with better closure
2. Accept the warning (the generator still works, edges just may not align perfectly at start/finish)

## Step 4: Testing in the SPA

1. **Start the SPA** (or reload if already running)
2. **Load a lap** from the same track
3. **View the track map** - you should see gray track limit lines beneath the telemetry trace

If the track map doesn't appear:

- Check browser console for errors
- Verify the JSON file exists in `assets/trackmaps/`
- Ensure the `trackId` in the JSON matches the normalized track name from lap metadata

## Step 5: Committing the Track Map

Once you're satisfied with the generated track map:

1. **Verify the file** exists at `assets/trackmaps/{trackId}.json`
2. **Add to git**:
   ```bash
   git add assets/trackmaps/{trackId}.json
   ```
3. **Commit**:

   ```bash
   git commit -m "Add track map for {Track Name}"
   ```

4. **(Optional) Update track registry** at `assets/trackmaps/index.json` (if you create one for tracking available maps)

## Troubleshooting

### "Track mismatch" error

All calibration laps must be from the same track. Double-check your CSV files.

### "Missing required column" error

Your CSV export is missing X/Y/Z coordinate data. Ensure telemetry export includes world position channels.

### "Insufficient spatial data" error

Very few samples have valid coordinates. Your lap may be too short or corrupted.

### Track map doesn't load in SPA

1. Check browser console for fetch errors
2. Verify file path: `assets/trackmaps/{trackId}.json`
3. Ensure track ID normalization is correct (lowercase, underscores instead of spaces/special chars)

### Edges don't align with actual track

1. Check calibration lap quality - did you go off-track?
2. Try different smoothing settings
3. Re-record calibration laps

### Track width looks wrong

1. Verify you drove the correct left/right limits
2. Check for outlier warnings in generator output
3. Try clamping with different min/max width settings (requires code modification in `width.js`)

## Advanced Usage

### Batch Processing Multiple Tracks

Create a shell script:

```bash
#!/bin/bash
for track in algarve spa monza; do
  node tools/generateTrackMap.js \
    --input "lapdata_custom/calibration/$track" \
    --output "assets/trackmaps/${track}.json" \
    --left lap_left.csv \
    --right lap_right.csv
done
```

### Custom Grid Sizes by Track

Some tracks may benefit from different sample counts:

- **Short tracks / karts**: 512-1024 samples
- **Standard circuits**: 1024-2048 samples
- **Long tracks (Nürburgring, Le Mans)**: 2048-4096 samples

### Gaussian Smoothing (Code Modification)

If you want even smoother results, modify `tools/generateTrackMap.js` to use Gaussian smoothing instead of moving average:

```javascript
// Replace
import { smoothCenterline, smoothWidths } from '../js/trackMapGenerator/smoothing.js';

// With
import { gaussianSmoothCenterline, gaussianSmooth } from '../js/trackMapGenerator/smoothing.js';

// And use sigma parameter instead of window size
const centerline = gaussianSmoothCenterline(centerlineRaw, sigma);
```

## Future Enhancements

Planned features for the track map system:

1. **HTML Preview Tool**: Visual QA interface to validate track maps before committing
2. **Apex Detection**: Highlight braking/turn-in zones based on curvature
3. **Sector Markers**: Overlay sector boundaries on track map
4. **Manual Tweaking**: Click-and-drag UI to adjust problematic sections
5. **Multi-lap Averaging**: Support averaging >3 calibration laps for better accuracy
6. **Auto-classification**: Detect left/right laps from steering input

## Getting Help

If you encounter issues:

1. Check this documentation first
2. Review generator output messages and warnings
3. Inspect the generated JSON in a text editor
4. Check browser console when loading in SPA
5. Open an issue with details about the error and your calibration process

---

**Happy mapping!** 🏁
