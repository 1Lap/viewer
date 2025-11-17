## Bugs & Improvements

Below are the current issues, ordered by suggested fix priority, along with remediation ideas.

1. ✅ **Lap overview metadata accuracy (highest impact)**  
   _Issue_: The summary rows may not display the metadata from the active lap, which can mislead users when comparing drivers/cars.  
   _Fix strategy_: Ensure `updateMetadata()` always pulls from the currently active lap and include driver name there rather than on the per-lap cards. Add a regression test covering multiple driver names.  
   _Status_: `updateMetadata()` now defaults to the selected lap, the overview label shows “Active driver,” and a regression test locks this in.

2. ✅ **Colour ordering tied to lap order**  
   _Issue_: Reordering laps does not reassign palette colours, so the visual legend gets out of sync with the list.  
   _Fix strategy_: After any `moveLap()` or deletion, regenerate `telemetryState.lapColors` based on `lapOrder` so position 1 always maps to palette index 0, etc., and trigger a chart refresh.  
   _Status_: `syncLapColorsToOrder()` reassigns palette slots whenever order changes, keeping chips, map, and charts aligned.

3. ✅ **Legend redundancy in lanes**  
   _Issue_: Each chart renders a full legend even though lap chips already show colour/driver.  
   _Fix strategy_: Disable Chart.js legends (or collapse them into a hover-only overlay) and rely on the lap list indicator to free vertical space.  
   _Status_: Chart.js legends are now disabled globally, freeing vertical space in each lane.

4. ✅ **Lap overview driver name duplication**  
   _Issue_: Overview displays a single driver even when multiple laps (drivers) are loaded.  
   _Fix strategy_: Replace the driver field with “Active driver” (only for selected lap) or remove it entirely from the overview, keeping driver context on the lap cards.  
   _Status_: Overview now labels the field “Active driver,” so only the selected lap’s driver is shown.

5. ✅ **Track map size/layout responsiveness**  
   _Issue_: Track map stays small while lanes stack vertically, wasting horizontal space.  
   _Fix strategy_: Convert `.layout` to a responsive grid where the map stretches to match the combined height of lanes (e.g., using CSS grid row-span) and allow full-width expansion on large screens.  
   _Status_: The telemetry lanes now occupy a responsive CSS grid that lets the track map span all rows, so the canvas grows alongside the combined lane height on any screen.

6. ✅ **Track map zoom/pan interactions**  
   _Issue_: Users cannot zoom with the mouse wheel or pan the map view.  
   _Fix strategy_: Add wheel event handlers to adjust zoom level (with limits) and mouse-drag handlers to offset the drawing bounds. Preserve view window coherence by syncing zoom to the current distance range.  
   _Status_: The track canvas now hooks wheel gestures for zoom and pointer drag for panning, both updating the global distance window so charts stay in sync.

7. ✅ **Screen real estate optimisation**  
   _Issue_: Overall UI does not fill widescreen displays.  
   _Fix strategy_: Increase the max-width of `<main>`, allow lanes to wrap into two columns on large breakpoints, and let the map/lane panels stretch to 100% width when space allows.
