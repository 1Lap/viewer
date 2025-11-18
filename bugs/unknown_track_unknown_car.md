## Bug: metadata not parsed from MVP header

### Symptom
Loading the new MVP CSV (with the `Format, Version, Player, TrackName, …` metadata block) shows:
- Track: “Unknown track”
- Car: “Unknown car”
- Lap time: `—`

Only the driver field is filled (from `Player`), so we’re not actually consuming the other metadata rows.

### Root cause
`js/parser.js` only looks for:
- `Game,...` rows (old Telemetry Tool format) for track/car/lap time.
- `TrackID..., Tracklen...` rows.

The MVP metadata block sits before those lines, so the parser still falls through to “unknown” when those later sections are missing.

### Fix plan
1. **Update parser metadata scan** (before it searches for the telemetry header):
   - Detect key/value rows at the top (until a blank line or non two-column row).
   - Normalise keys (lowercase, strip spaces/brackets) so we can match `trackname`, `carname`, `player`, `laptime[s]`, `tracklen[m]`, etc.
   - Populate `trackName`, `carName`, `driverName`, `lapTimeSeconds`, `trackLength` directly from those entries.
2. **Maintain backwards compatibility**:
   - Keep existing logic for `Game,-` and `TrackID` blocks so legacy exports still work.
   - MVP files will simply short-circuit because metadata is already present.
3. **Add tests**:
   - Extend `tests/parser.test.js` with an MVP-style sample (metadata block + minimal header) and assert the parsed metadata matches.
4. **UI check**:
   - Reload `20251118135010748377_lap3.csv` to verify track/car/lap time appear in the metadata panel.

### Status
- ✅ Parser now ingests MVP metadata rows (exactly two columns) in `js/parser.js`, populates track/car/driver/lap time/track length, while keeping legacy fallbacks.
- ✅ Added `parseLapFile reads MVP metadata block` test case in `tests/parser.test.js`.
- ⏳ Manual UI verification still recommended (reload the sample lap to confirm the metadata cards show Algarve + car name).
