# LMU Telemetry Lap Viewer (MVP)

Lightweight static prototype for inspecting LMU Telemetry Tool exports entirely in the browser. Drop a CSV export onto the page to parse the lap, view throttle/brake traces, and see a simple track map projection.

## Features

- Pure client-side parsing (no uploads) of LMU lap CSV files.
- Maintains a lap list so you can load multiple files, toggle their visibility, and compare them side by side.
- Displays track & car metadata plus lap time and sample count.
- Renders throttle and brake lanes vs lap distance with shared cursor highlighting.
- Shows a basic track map derived from X/Y telemetry data with cursor indicator.
- Light-themed Garage-61-inspired layout that scaffolds future lanes (speed, gear/RPM, steering) and sector interactions.

## Running locally

No build tooling is required. Either open `index.html` directly in your browser or serve the directory via a minimal HTTP server.

### Option 1: open the file directly

1. Double-click `index.html` (or use `open index.html` on macOS).
2. The browser will load the app from `file://`.
3. Drag an LMU telemetry CSV onto the drop zone to view it.

### Option 2: serve via nginx (Docker)

```
docker run --rm -it -p 8080:80 \
  -v "$(pwd)":/usr/share/nginx/html:ro \
  nginx:alpine
```

Then browse to http://localhost:8080.

> Any static HTTP server works as long as it serves `index.html` and the CSV stays on the client. Examples: `python -m http.server`, VS Code Live Server, etc.

## Tests

Node's built-in test runner exercises the parser and state helpers. Run:

```
npm install
npm test
```

This executes every file under `tests/` via `node --test`. Extend these specs as you add new parsing rules or state helpers.

## Notes & next steps

- Only LMU-formatted Telemetry Tool exports are supported right now.
- Multi-lap overlays are supported; future work includes delta traces and additional analysis lanes.
- Sector strip is a placeholder covering the whole lap for now.
- Additional metadata (weather, tyres, fuel) can be surfaced once prioritised.

Feedback on parsing edge cases or UI tweaks is welcome.
