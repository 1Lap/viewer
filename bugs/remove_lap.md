# Feature Request: Remove Individual Laps from Loaded Laps

## Description

Users currently cannot remove/delete individual laps once they've been loaded into the lap viewer. This becomes problematic when:
- Multiple laps are loaded and the user wants to declutter the view
- A wrong lap was accidentally loaded
- The user wants to compare only specific laps but has loaded several

## Current Behavior

The lap list (js/lapList.js) currently supports:
- Visibility toggle (eye icon) - hides a lap from charts but keeps it loaded
- Move up/down buttons - reorders laps in the list
- Click to activate/select a lap

However, there is no way to permanently remove a lap from `telemetryState.laps` once it's been loaded.

## Expected Behavior

Add a delete/remove button (trash icon or 'X') for each lap entry that:
1. Removes the lap from `telemetryState.laps`
2. Removes the lap from `telemetryState.lapOrder`
3. Removes the lap from `telemetryState.lapVisibility`
4. If the deleted lap was the active lap, automatically select another available lap (or set `uiState.activeLapId` to null if no laps remain)
5. Re-renders the lap list and all charts

## Implementation Notes

- Modify `js/lapList.js` to add a delete button in the lap entry HTML (around line 71-80)
- Add click handler for the delete button similar to the move buttons (lines 17-25)
- Create a `removeLap(lapId)` function in the main app that:
  - Filters out the lap from `telemetryState.laps`
  - Updates `telemetryState.lapOrder`
  - Deletes from `telemetryState.lapVisibility`
  - Handles active lap reassignment
  - Triggers UI updates

## Related Files

- `js/lapList.js:16-39` - Event handlers for lap list interactions
- `js/lapList.js:42-95` - Lap list rendering
- `js/state.js` - Telemetry state management
