# Bug: Track Names with Special Characters Display Incorrectly

## Description

Track names containing localized/special characters (diacritics, accents, non-ASCII characters) do not display properly in the lap viewer. Instead of showing the correct characters, broken letter icons or replacement characters appear.

## Example

**Expected:** Autódromo José Carlos Pace
**Actual:** Aut�dromo Jos� Carlos Pace (or similar broken display)

This affects many international track names that use characters outside the basic ASCII range:
- Autódromo José Carlos Pace (Brazil)
- Circuit de Spa-Francorchamps (Belgium - if using French diacritics)
- Nürburgring (Germany)
- Circuito de Jerez - Ángel Nieto (Spain)
- Autodromo Enzo e Dino Ferrari (Italy - if using è)

## Current Behavior

Track names are parsed from telemetry CSV files and displayed in:
1. Lap list entries (js/lapList.js:74) - `lap.metadata.track`
2. Metadata panel (js/metadata.js:17) - track name for active lap

The track name is extracted in js/parser.js during CSV parsing (lines 127-151 for key-value metadata, lines 152-168 for table metadata).

## Root Cause

This is a **character encoding issue**. Potential causes:

### 1. CSV File Encoding
The telemetry CSV files may be encoded in a format other than UTF-8:
- Windows-1252 (common on Windows systems)
- ISO-8859-1 (Latin-1)
- Other regional encodings

When the browser reads the file assuming UTF-8, special characters are misinterpreted.

### 2. File Reading Issue
The FileReader API in js/fileLoader.js may not be handling encoding correctly. If files are read without proper encoding specification, the browser defaults to UTF-8 but the file may be in a different encoding.

### 3. Font/Display Issue
Less likely, but the font used might not include glyphs for these special characters. However, modern web fonts typically include extended Latin characters.

## Expected Behavior

- All Unicode characters should display correctly
- Track names should appear exactly as encoded in the source files
- Both basic and extended Latin characters should render properly

## Investigation Steps

1. **Check Source File Encoding**
   - Open a problematic CSV file in a hex editor
   - Check the byte sequence for special characters
   - Common encodings:
     - UTF-8: `é` = `C3 A9`
     - Windows-1252: `é` = `E9`
     - ISO-8859-1: `é` = `E9`

2. **Verify File Reading**
   - Check js/fileLoader.js to see how files are read
   - Verify if encoding is specified when reading the file

3. **Test Browser Interpretation**
   - Use browser dev tools to inspect the actual string values
   - Check if the problem is at parse-time or render-time

## Suggested Fixes

### Fix 1: Detect and Handle Encoding (Recommended)

Modify the file reading in js/fileLoader.js to detect or allow specification of encoding:

```javascript
// Try reading as UTF-8 first
reader.readAsText(file, 'UTF-8');

// If that fails or produces invalid characters, try Windows-1252
reader.onerror = () => {
  reader.readAsText(file, 'Windows-1252');
};
```

### Fix 2: Add Encoding Detection Library

Use a library like `chardet` or `jschardet` to auto-detect file encoding before parsing.

### Fix 3: Character Replacement/Normalization

As a fallback, implement a mapping for common character corruptions:
```javascript
function fixBrokenCharacters(text) {
  return text
    .replace(/Ã³/g, 'ó')
    .replace(/Ã©/g, 'é')
    .replace(/Ã¡/g, 'á')
    // etc.
}
```

This is a workaround, not a proper fix.

### Fix 4: HTML Entity Encoding

Ensure proper HTML encoding when rendering:
```javascript
element.textContent = trackName; // Use textContent, not innerHTML
```

Though this is likely already correct.

## Related Files

- `js/fileLoader.js` - File reading and initial processing
- `js/parser.js:127-151` - Track name extraction from key-value metadata
- `js/parser.js:162-165` - Track name extraction from table metadata
- `js/parser.js:344` - Track name fallback
- `js/lapList.js:74` - Track name display in lap list
- `js/metadata.js:17` - Track name display in metadata panel
- `index.html:9-11` - Font loading (verify font supports extended Latin)

## Testing

Test with track names containing:
- Acute accents: á, é, í, ó, ú
- Grave accents: à, è, ì, ò, ù
- Circumflex: â, ê, î, ô, û
- Tilde: ñ, õ
- Umlaut: ä, ë, ï, ö, ü
- Cedilla: ç
- Other: ø, æ, œ, ß
