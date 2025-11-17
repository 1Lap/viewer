when mouse-over the track or lanes or sector bar, the "playhead" on the other lanes/sector-bar is too faint. It should be more obvious.

## Investigation

- The vertical cursor line rendered across all Chart.js lanes is drawn at `1px` with a semi-transparent colour (`#11182733`). On light backgrounds, this is barely visible; on dark mode it effectively disappears.
- The sector progress bar cursor shares the same accent colour as the window outline but uses `opacity: 0.4` and a 2px width, so it doesn’t stand out when multiple laps are overlaid.
- Track map cursor dots already get full opacity and a white outline; matching that treatment for the lane cursor and progress bar would improve discoverability.

## Proposed fix

1. Increase the Chart.js cursor overlay to `2px` width, switch to a high-contrast colour (e.g., `var(--accent)` or `#f97316` depending on theme), and add a subtle shadow/glow so it stands out over noisy data.
2. Update `.progress-cursor` styles to use a slightly wider line (3px), full opacity, and a contrasting outline or glow so it pops on both light/dark themes.
3. Expose the cursor colour via CSS variables so both the chart plugin and CSS share the same value; this keeps it consistent if the theme changes.
4. Optional: add a short fade-in animation when the cursor appears to draw the eye without being distracting.

## Status

✅ Completed – cursor colour/glow now come from shared CSS variables, the Chart.js overlay uses a 2px stroke with a glow, and the progress bar cursor is 3px with full opacity so it’s clearly visible on both light and dark modes.
