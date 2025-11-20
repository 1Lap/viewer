# Bug: Car Displays as "Unknown car"

## Description

When loading telemetry files, the car name is displayed as "Unknown car" instead of showing the actual car/vehicle name.

## Current Behavior

The car name appears in multiple locations:
1. Lap list entries (js/lapList.js:75) - shows car name in metadata line
2. Lap list chips (js/lapList.js:77) - shows car name as a chip
3. Metadata panel (js/metadata.js:18) - shows car name for active lap

When the parser cannot find or extract the car name, it defaults to "Unknown car" (js/parser.js:345).

## Root Cause

The car name extraction happens in `js/parser.js` during CSV parsing. The parser looks for car names in two places:

### 1. Key-Value Metadata Section (lines 127-151)

Looks for keys like:
- `carname`
- `car`

Example format:
```
# CarName = BMW M4 GT3
# Track = Sebring
```

### 2. Metadata Table Section (lines 152-168)

Looks for a column header `Car` in a table like:
```
Track,Car,Driver,LapTime
Sebring,Porsche 911 GT3 R,John Doe,125.432
```

## Possible Issues

1. **Case Sensitivity**: The parser uses `.toLowerCase()` comparisons but the source data might have unexpected casing
2. **Column Name Variations**: The source telemetry might use different column names like:
   - `Vehicle`
   - `Car Name` (with space)
   - `CarModel`
   - `Car_Name` (with underscore)
3. **Missing Metadata**: The telemetry export might not include car information at all
4. **Whitespace Issues**: Extra spaces or tabs might prevent proper matching
5. **Encoding Issues**: Special characters in car names might cause parsing failures

## Expected Behavior

- Car names should be correctly extracted from telemetry files
- If car name is truly missing, "Unknown car" is an acceptable fallback
- Common car name field variations should be supported

## Investigation Steps

1. Examine sample telemetry CSV files to identify how car names are stored
2. Check if the field name matches one of the supported patterns
3. Verify there are no whitespace or encoding issues in the headers
4. Test with different telemetry sources (Motec, custom exports, etc.)

## Suggested Fixes

### Option 1: Add More Alias Patterns
Add support for common variations in js/parser.js:130-138:
```javascript
carname: 'car',
carmodel: 'car',
car_name: 'car',
vehicle: 'car',
vehiclename: 'car'
```

### Option 2: Improve Column Matching
Make the metadata table parsing (lines 152-168) more flexible:
```javascript
const idxCar = headers.findIndex((h) =>
  /^(car|vehicle|carmodel|carname)/i.test(h.trim())
);
```

### Option 3: Add Fallback from Filename
If car name is not in metadata, try to extract it from the filename pattern.

## Related Files

- `js/parser.js:127-138` - Key-value metadata parsing
- `js/parser.js:162-167` - Metadata table car column extraction
- `js/parser.js:345` - Car name fallback to "Unknown car"
- `js/lapList.js:75-77` - Car name display in lap list
- `js/metadata.js:18` - Car name display in metadata panel
