its possible to add the same lap again by accident, and then need to remove it. 

we should detect the same lap being added twice and not do it (with a nice message)

## Investigation

- Every call to `parseLapFile()` generates a fresh `lap.id` based on `Date.now()`/`Math.random()`, so even if the file content is identical the resulting lap looks unique to the rest of the app.
- `loadLapFiles()` simply pushes the parsed lap into `telemetryState.laps` with no de‑duplication, so the same file dropped twice produces duplicate entries in the list/chart/map until the user manually hides them.
- We already have a concept of a lap “signature” (`getLapSignature()` in `js/app.js`) for persistence; it uses file name + metadata (track, car, lap time) to identify laps between sessions. This signature is not consulted when loading files, which is why duplicates slip in.

## Proposed fix

1. Generate a canonical signature for every newly parsed lap (reuse or extract the logic from `getLapSignature()` so it lives in a shared helper).
2. Before adding a lap inside `loadLapFiles()`, check whether that signature already exists among the currently loaded laps. If it does:
   - Skip the insertion.
   - Surface a friendly `showMessage()` warning such as “Ignored duplicate lap: <track / driver> (already loaded).”
3. Store the signature on the lap object (e.g., `lap.signature`) so future checks are O(1) and so other features (persistence, future deep links) have access to the same identifier.
4. Expand tests to cover the duplicate detection path (attempt to load the same mock lap twice and assert that only one entry exists and that the warning fires).

## Status

✅ Implemented — laps now carry a canonical signature (track/car/driver/time/sample count), `loadLapFiles()` skips duplicates with a warning, lap sessions/persistence reuse the same signature, and a regression test ensures duplicate files are rejected.
