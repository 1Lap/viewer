# Development Guidelines for Claude

This document provides guidelines for Claude when working on this project.

## Testing

### Always Run Tests After Changes

Before committing any code changes, you MUST run the test suite to ensure nothing is broken:

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

If you move or rename JavaScript files in `public/js/`, you MUST update the corresponding import paths in the test files.

## Project Structure

- `public/` - Live site resources (served by GitHub Pages)
  - `index.html` - Main application entry point
  - `js/` - Application JavaScript modules
  - `assets/` - CSS, images, track maps
  - `lapdata_*/` - Sample telemetry data files
- `tests/` - Test suite
- `tools/` - Build and development tools
- `admin/` - Administrative utilities
- Root directory - Documentation and configuration files

## Commit Practices

- Write clear, descriptive commit messages
- Run tests before committing
- Keep commits focused on a single logical change
- Reference issue numbers in commit messages when applicable

## Code Quality

- Follow existing code style and conventions
- Maintain ES6 module imports/exports
- Keep functions focused and testable
- Add tests for new functionality
