# Development Guidelines for Claude

This document provides guidelines for Claude when working on this project.

## Pre-Commit Checklist

Before committing ANY code changes, you MUST:

1. **Run tests**: `npm test` - All tests must pass
2. **Run linter**: `npm run lint` - Fix any linting errors
3. **Format code**: `npm run format` - Apply consistent code style
4. **Verify changes**: Review what you're committing with `git diff`

Only commit once all checks pass.

## Testing

### Always Run Tests After Changes

Before committing any code changes, you MUST run the test suite:

```bash
npm test
```

All tests must pass before committing changes. If any tests fail:

1. Investigate the root cause of the failure
2. Fix the issue (either in your changes or update the tests if appropriate)
3. Re-run the tests to verify the fix
4. Only commit once all tests pass

### Test File Locations

Tests are located in the `tests/` directory and import from the `public/js/` directory (where the application code lives).

**CRITICAL**: If you move or rename JavaScript files in `public/js/`, you MUST update the corresponding import paths in the test files.

## Linting and Formatting

This project uses ESLint and Prettier to maintain code quality:

```bash
# Check for linting errors
npm run lint

# Auto-format all files
npm run format

# Check formatting without changing files (for CI)
npm run format:check
```

**Always run lint and format before committing.**

## Project Structure

- `public/` - **Live site resources (served by GitHub Pages)**
  - `index.html` - Main application entry point
  - `js/` - **Application JavaScript modules (ES6 modules, no bundler)**
    - `app.js` - Entry point that wires everything together
    - `state.js` - Single source of truth for telemetry data and UI state
    - `parser.js` - CSV parsing logic
    - `charts.js`, `trackMap.js`, `lapList.js`, etc. - Rendering modules
  - `assets/trackmaps/` - Track map JSON files (simple schema format)
  - `lapdata_custom/`, `lapdata_motec/`, `lapdata_tt/` - Sample telemetry data
- `tests/` - Test suite (uses Node's built-in test runner)
- `tools/` - Track map generation utilities
- `admin/` - Track map preview and generation tools
  - `simple-track-map.html` - Generate new track maps
  - `track-map-preview.html` - Preview existing track maps
- Root directory - Documentation, configuration, and development files

### Important File Path Notes

- **All JavaScript modules are in `public/js/`** (not just `js/`)
- Tests import from `../public/js/`
- When modifying code, edit files in `public/js/`
- Track maps are in `public/assets/trackmaps/`
- The live site is served from the `public/` folder via GitHub Pages

## Architecture

This is a **pure client-side static application** with:

- No build step or bundler
- ES6 modules loaded directly in the browser
- No backend - all processing happens in the browser
- All files served statically from the `public/` folder

Key architectural principles:

- **State management**: Use `state.js` helpers, don't mutate state directly
- **Modularity**: Each module has a focused responsibility
- **Pure functions**: Prefer pure helpers in parsing and calculation logic
- **Configuration**: Use constants from `config.js`, avoid hard-coded values

## Local Development

No build tooling is required. You can run the app in two ways:

### Option 1: Open file directly

```bash
open public/index.html
# or double-click public/index.html
```

### Option 2: Local HTTP server (recommended)

```bash
# Python
python -m http.server 8080
# Then open http://localhost:8080/public/

# Or use any static server
npx http-server -p 8080
# Then open http://localhost:8080/public/
```

To test: Drag an LMU telemetry CSV file onto the drop zone.

## Track Maps

Track maps are stored in `public/assets/trackmaps/<trackId>.json` where `trackId` is the normalized track name (lowercase, non-alphanumerics replaced with `_`).

### Generating Track Maps

1. Open `admin/simple-track-map.html` in a browser
2. Drop calibration lap CSV files onto the page
3. Export the generated JSON
4. Save to `public/assets/trackmaps/<trackId>.json`

### Previewing Track Maps

1. Open `admin/track-map-preview.html`
2. Load an existing track map JSON to preview it

## Commit Practices

- Write clear, descriptive commit messages
- **Run all pre-commit checks** (tests, lint, format)
- Keep commits focused on a single logical change
- Reference issue numbers in commit messages when applicable
- Don't commit if tests are failing

## Code Quality

- Follow existing code style and conventions
- Maintain ES6 module imports/exports
- Keep functions focused and testable
- Add tests for new parsing logic or state helpers
- Use the shared palette/config constants from `config.js`
- Prefer provided state helpers over direct mutation
- Document complex logic with comments

## GitHub Pages Deployment

The site is deployed from the `public/` folder via GitHub Actions.

### How Deployment Works

1. **Automatic deployment**: When you push to the `main` branch, the `.github/workflows/deploy.yml` workflow runs
2. **Artifact upload**: The workflow uploads only the `public/` folder as a Pages artifact
3. **Pages deployment**: GitHub Pages serves the content from the uploaded artifact
4. **Manual deployment**: You can also trigger deployment manually from the Actions tab

### What Gets Deployed

- ✅ Only files in `public/` are deployed and accessible on the live site
- ❌ Development files (tests, tools, docs, configs) remain private in the repo

### First-Time Setup

If this is a new repository, you need to enable GitHub Pages with Actions:

1. Go to repository Settings → Pages
2. Under "Source", select **GitHub Actions** (not "Deploy from a branch")
3. The workflow will automatically deploy on the next push to `main`

### Deployment URL

After deployment, your site will be available at:
`https://<username>.github.io/<repository>/`
