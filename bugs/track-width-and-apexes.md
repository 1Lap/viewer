## Track limits overlay

Right now we only have the car’s centreline (`X/Y` or `X/Z`) so the map can’t draw genuine track limits. LMU’s telemetry export doesn’t include left/right boundary channels, so we need to generate the limits ourselves. Two candidate approaches:

### Option 1 – Manual track-definition assets
- Build or source per-track SVGs/polylines (e.g., from existing CAD or community data).
- Store them in the app keyed by `trackId`.
- Pros: one-time effort if data exists; accurate reference lines.
- Cons: requires external assets; difficult to update when layouts change.

### Option 2 – Calibration laps + admin tool (preferred)
1. Create an internal “track builder” tool.
2. Drive three calibration laps at each circuit:
   - Lap A hugging the left limit, Lap B in the middle, Lap C hugging the right.
3. Export those laps via the telemetry logger.
4. Tool steps:
   - Resample each lap onto a common progress grid (0→1 along the lap) using cumulative distance.
   - Use the middle lap as the provisional centreline; compute tangents/normals along it.
   - Project left/right laps onto the normals to estimate half-widths at each sample.
   - Smooth centreline + widths (circular moving average, window size adjustable).
   - Derive left/right edge polylines from `centreline ± halfWidth * normal`.
   - Save the result as a JSON “track layout blob” containing centreline, width arrays, and a viewBox transform.
5. Viewer loads the blob (by track ID) and draws the limits beneath telemetry traces.
- Extras:
   - Calibration UI overlay showing the three raw laps vs generated edges for QA.
   - Controls to tune smoothing windows or manually tweak problematic sections (pit entry, chicanes).

### Storage format (rough sketch)
```jsonc
{
  "sim": "lmu",
  "trackId": "algarve_gp",
  "sampleCount": 1024,
  "centerline": [[x, y], ...],
  "halfWidthLeft": [8.2, ...],
  "halfWidthRight": [7.9, ...],
  "viewBox": [-1.1, -0.9, 2.2, 1.8]
}
```

Once the admin tool exists we can batch-calibrate favoured circuits and check in the blobs so the viewer shows real track limits + apex shading. Until then, no telemetry channel can provide limits automatically.
