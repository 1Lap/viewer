# LMU Telemetry Lap Viewer (MVP)

Lightweight static prototype for inspecting LMU Telemetry Tool exports entirely in the browser. Drop a CSV export onto the page to parse the lap, view throttle/brake traces, and see a simple track map projection.

## Features

- Pure client-side parsing (no uploads) of LMU lap CSV files.
- Maintains a lap list so you can load multiple files, toggle their visibility, and compare them side by side.
- Displays track & car metadata plus lap time and sample count.
- Renders throttle, brake, speed, gear/RPM, steering, and delta lanes vs lap distance with shared cursor highlighting.
- Shows a basic track map derived from X/Y telemetry data with cursor indicator.
- Light/dark Garage-61-inspired layout with a toggle; remembers your preferred theme, active lap, and zoom window via localStorage between sessions.
- One-click “Share active lap” button compresses the active lap into the URL so teammates can load it without passing files around.

## Architecture overview

- **Entry point (`js/app.js`)** wires browser events together: file loading, lap activation, state persistence, and the cross-component view window. It is the only script touching DOM-ready state and orchestrates dependencies for other modules.
- **State layer (`js/state.js`)** keeps telemetry samples, UI windowing, and chart/track projection caches. Helper accessors (`getActiveLap`, `getLapColor`, `syncLapColorsToOrder`) are the single source of truth for cross-module mutations.
- **Rendering modules**:
  - `js/lapList.js` builds the interactive lap list (reorder, visibility, active selection) using state utilities.
  - `js/metadata.js` keeps the overview widgets in sync with the currently active lap.
  - `js/progress.js` renders the sector bar / zoom handles and pushes range changes back into `uiState`.
  - `js/trackMap.js` handles canvas sizing, projection, and the new zoom/pan gestures. It listens to the shared cursor distance so it can draw selection dots per lap.
  - `js/charts.js` (Chart.js wrapper) produces each telemetry lane, sharing configuration from `js/config.js` and relying on `uiState.viewWindow` for x-axis bounds.
- **Parsing (`js/parser.js`)** converts CSV text into strongly typed laps/samples and returns metadata consumed throughout the app.
- **Notifications (`js/notifications.js`)** centralise status banners so file errors surface consistently.

The entire codebase sticks to ES modules with no bundler; HTML references each module directly. This keeps debugging simple for a prototype while still enforcing modular structure.

## Contributor guide

1. **Setup**  
   - Install Node 20+ and run `npm install`. No global tooling is required beyond a modern browser.
2. **Development workflow**  
   - Start with `npm test` to ensure the parser/state suites pass.
   - Use `npm run lint` and `npm run format` (or `npm run format:check` in CI) before opening a pull request.
   - Load `index.html` via a static server (or from `file://`) and drop sample LMU exports to validate UI changes.
3. **Coding standards**  
   - Keep new modules under `js/` and export pure helpers when possible.
   - Use the shared palette/config constants from `js/config.js` rather than hard-coding values in feature files.
   - Prefer the provided state helpers over mutating `telemetryState`/`uiState` directly, so tests and future refactors remain predictable.
4. **Testing additions**  
   - Extend `tests/` with new `node:test` specs whenever you touch parsing logic or shared state helpers.
   - For UI features that can’t be unit tested, document manual validation steps in the PR description.

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

## Linting & formatting

ESLint + Prettier keep the ES module graph tidy. After installing dependencies:

```
npm run lint
npm run format
```

`lint` checks `js/` and `tests/` for common mistakes, while `format` applies the shared Prettier config (use `npm run format:check` in CI to verify).

## Notes & next steps

- Only LMU-formatted Telemetry Tool exports are supported right now.
- Multi-lap overlays are supported; future work includes delta traces and additional analysis lanes.
- Sector strip is a placeholder covering the whole lap for now.
- Additional metadata (weather, tyres, fuel) can be surfaced once prioritised.

Feedback on parsing edge cases or UI tweaks is welcome.
