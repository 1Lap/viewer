import { createLapSignature } from './signature.js';

/**
 * @typedef {Object} LapSample
 * @property {number} distance
 * @property {number} time
 * @property {number|null} throttle
 * @property {number|null} brake
 * @property {number|null} speed
 * @property {number|null} steer
 * @property {number|null} gear
 * @property {number|null} rpm
 * @property {number|null} x
 * @property {number|null} y
 * @property {number|null} z
 * @property {number|null} sector
 */

/**
 * @typedef {Object} LapMetadata
 * @property {string} track
 * @property {string} car
 * @property {string} driver
 * @property {number|null} lapTime
 * @property {number|null} lapLength
 */

/**
 * @typedef {Object} Lap
 * @property {string} id
 * @property {string} name
 * @property {string} signature
 * @property {LapMetadata} metadata
 * @property {Array<LapSample>} samples
 * @property {Array<Object>} sectors
 */

function guessDelimiter(text) {
  const comma = (text.match(/,/g) || []).length;
  const semi = (text.match(/;/g) || []).length;
  return semi > comma ? ';' : ',';
}

function splitLine(line, delimiter) {
  return line.split(delimiter).map((part) => part.trim());
}

function normaliseHeader(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function stripTrailingDelimiters(value, delimiter) {
  if (!value) return value;
  const escaped = delimiter.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return value.replace(new RegExp(`${escaped}+$`), '').trim();
}

function extractMetadataOverrides(lines, delimiter, metadataKeys) {
  const overrides = {};
  let startIndex = 0;
  let firstNonEmpty = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] && lines[i].trim()) {
      firstNonEmpty = i;
      break;
    }
  }
  if (firstNonEmpty === -1) {
    return { overrides, nextIndex: 0 };
  }
  const firstLine = lines[firstNonEmpty].trim();
  const firstParts = splitLine(firstLine, delimiter);
  if (!firstParts.length || normaliseHeader(firstParts[0]) !== 'format') {
    return { overrides, nextIndex: firstNonEmpty };
  }
  startIndex = firstNonEmpty;
  let i = startIndex;
  for (; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) {
      i++;
      break;
    }
    const delimiterIndex = trimmed.indexOf(delimiter);
    if (delimiterIndex === -1) {
      break;
    }
    const keyRaw = trimmed
      .slice(0, delimiterIndex)
      .replace(/^\uFEFF/, '')
      .trim();
    const normalizedKey = normaliseHeader(keyRaw);
    if (!metadataKeys[normalizedKey]) {
      break;
    }
    const valueRaw = trimmed.slice(delimiterIndex + 1).trim();
    const value = stripTrailingDelimiters(valueRaw, delimiter);
    overrides[metadataKeys[normalizedKey]] = value;
  }
  return { overrides, nextIndex: i };
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Parse the contents of an LMU telemetry export into Lap objects.
 * @param {string} text
 * @param {string} fileName
 * @returns {Lap}
 */
export function parseLapFile(text, fileName) {
  const delimiter = guessDelimiter(text);
  const lines = text.split(/\r?\n/);
  let telemetryHeaderIndex = -1;
  let trackName = null;
  let carName = null;
  let driverName = null;
  let lapTimeSeconds = null;
  let trackLength = null;
  let fallbackSectors = [];
  const metadataKeys = {
    format: 'format',
    version: 'version',
    player: 'player',
    trackname: 'track',
    carname: 'car',
    sessionutc: 'sessionUtc',
    laptimes: 'lapTime',
    laptime: 'lapTime',
    tracklenm: 'trackLen',
    tracklen: 'trackLen'
  };

  const { overrides: metadataOverrides, nextIndex } = extractMetadataOverrides(
    lines,
    delimiter,
    metadataKeys
  );

  for (let i = nextIndex; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw) continue;
    const line = raw.trim();
    if (!line) continue;
    const lower = line.toLowerCase();

    if (lower.startsWith('player')) {
      const parts = splitLine(line, delimiter);
      driverName = parts[2] || parts[1] || driverName;
      continue;
    }

    if (lower.startsWith('game,')) {
      const headers = splitLine(line, delimiter);
      const values = splitLine(lines[i + 1] || '', delimiter);
      const idxTrack = headers.findIndex((h) => h.toLowerCase() === 'track');
      const idxCar = headers.findIndex((h) => h.toLowerCase() === 'car');
      const idxLapTime = headers.findIndex((h) => h.toLowerCase().startsWith('laptime'));
      trackName = idxTrack >= 0 ? values[idxTrack] : trackName;
      carName = idxCar >= 0 ? values[idxCar] : carName;
      lapTimeSeconds = idxLapTime >= 0 ? toNumber(values[idxLapTime]) : lapTimeSeconds;
      fallbackSectors = headers
        .map((header, idx) => ({ header, idx }))
        .filter(({ header }) => /^s\d+/i.test(header.trim()))
        .map(({ header, idx }) => ({
          label: header.split(' ')[0],
          time: toNumber(values[idx])
        }))
        .filter((entry) => Number.isFinite(entry.time) && entry.time > 0);
      i++;
      continue;
    }

    if (lower.startsWith('trackid')) {
      const headers = splitLine(line, delimiter);
      const values = splitLine(lines[i + 1] || '', delimiter);
      const idxTrackLength = headers.findIndex((h) => h.toLowerCase().startsWith('tracklen'));
      trackLength = idxTrackLength >= 0 ? toNumber(values[idxTrackLength]) : trackLength;
      i++;
      continue;
    }

    if (lower.startsWith('lapdistance')) {
      telemetryHeaderIndex = i;
      break;
    }
  }

  if (telemetryHeaderIndex === -1) {
    throw new Error('Could not locate telemetry header row (LapDistance, LapTime, ...).');
  }

  if (metadataOverrides.track) {
    trackName = metadataOverrides.track;
  }
  if (metadataOverrides.car) {
    carName = metadataOverrides.car;
  }
  if (metadataOverrides.player) {
    driverName = metadataOverrides.player;
  }
  if (metadataOverrides.lapTime != null) {
    lapTimeSeconds = toNumber(metadataOverrides.lapTime) ?? lapTimeSeconds;
  }
  if (metadataOverrides.trackLen != null) {
    trackLength = toNumber(metadataOverrides.trackLen) ?? trackLength;
  }

  const headerColumns = splitLine(lines[telemetryHeaderIndex], delimiter);
  const headerMap = new Map();
  headerColumns.forEach((col, idx) => {
    headerMap.set(normaliseHeader(col), idx);
  });

  const aliasCandidates = {
    lapDistance: ['lapdistance', 'lapdistancem', 'distance'],
    lapTime: ['laptime', 'laptimes', 'time'],
    throttle: ['throttlepercentage', 'throttle'],
    brake: ['brakepercentage', 'brake'],
    speed: ['speedkmh', 'speed', 'kmh'],
    steer: ['steer', 'steerpercent'],
    gear: ['gearint', 'gear', 'gearposition'],
    rpm: ['enginerevsrpm', 'rpm', 'revs'],
    x: ['xm', 'worldpositionx'],
    y: ['ym', 'worldpositiony'],
    z: ['zm', 'worldpositionz'],
    sector: ['sector', 'currentsector']
  };

  const aliases = {};
  Object.entries(aliasCandidates).forEach(([key, names]) => {
    for (const name of names) {
      const normalized = normaliseHeader(name);
      const idx = headerMap.get(normalized);
      if (idx != null && idx !== -1) {
        aliases[key] = normalized;
        break;
      }
    }
  });

  ['lapDistance', 'lapTime'].forEach((required) => {
    if (!aliases[required]) {
      throw new Error(`Missing required column: ${required.toLowerCase()}`);
    }
  });

  function getValue(row, keyOrColumn) {
    let column = keyOrColumn;
    if (typeof keyOrColumn === 'string' && aliases[keyOrColumn]) {
      column = aliases[keyOrColumn];
    }
    if (!column) return null;
    const idx = headerMap.get(column);
    if (idx == null || idx < 0) return null;
    return row[idx];
  }

  const samples = [];
  for (let row = telemetryHeaderIndex + 1; row < lines.length; row++) {
    const line = lines[row];
    if (!line) continue;
    const values = splitLine(line, delimiter);
    if (values.every((v) => v === '')) continue;

    const distance = toNumber(getValue(values, aliases.lapDistance));
    const time = toNumber(getValue(values, aliases.lapTime));
    if (distance == null || time == null) continue;

    const throttle = toNumber(getValue(values, aliases.throttle));
    const brake = toNumber(getValue(values, aliases.brake));
    const speed = toNumber(getValue(values, aliases.speed));
    const steer = toNumber(getValue(values, aliases.steer));
    const gear = toNumber(getValue(values, aliases.gear));
    const rpm = toNumber(getValue(values, aliases.rpm));
    const x = toNumber(getValue(values, aliases.x));
    const y = toNumber(getValue(values, aliases.y));
    const z = toNumber(getValue(values, aliases.z));
    const sectorValue = toNumber(getValue(values, aliases.sector));

    samples.push({
      distance,
      time,
      throttle,
      brake,
      speed,
      steer,
      gear,
      rpm,
      x,
      y,
      z,
      sector: sectorValue
    });
  }

  if (!samples.length) {
    throw new Error('No telemetry samples were parsed from the file.');
  }

  samples.sort((a, b) => a.distance - b.distance);
  const lapLength = trackLength ?? samples[samples.length - 1].distance ?? null;
  const sectors = deriveSectors(samples, fallbackSectors, lapLength);
  const signature = createLapSignature({
    name: fileName,
    track: trackName,
    car: carName,
    driver: driverName,
    lapTime: lapTimeSeconds ?? samples[samples.length - 1]?.time ?? null,
    lapLength,
    sampleCount: samples.length
  });

  return {
    id: `lap-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: fileName,
    signature,
    metadata: {
      track: trackName || 'Unknown track',
      car: carName || 'Unknown car',
      driver: driverName || '—',
      lapTime: lapTimeSeconds || null,
      lapLength
    },
    sectors,
    samples
  };
}

function deriveSectors(samples, fallbackSectors, lapLength) {
  if (!samples.length) return [];

  const sectors = [];
  const normalize = (value) => (Number.isFinite(value) ? value : null);
  let currentSector = normalize(samples[0].sector);
  let startDistance = samples[0].distance;
  for (let i = 1; i < samples.length; i++) {
    const sectorValue = normalize(samples[i].sector);
    if (sectorValue == null) continue;
    if (currentSector == null) {
      currentSector = sectorValue;
      startDistance = samples[i - 1].distance;
    }
    if (sectorValue !== currentSector) {
      sectors.push({
        index: currentSector,
        label: `S${(currentSector ?? 0) + 1}`,
        start: startDistance,
        end: samples[i].distance
      });
      currentSector = sectorValue;
      startDistance = samples[i].distance;
    }
  }
  if (currentSector != null) {
    sectors.push({
      index: currentSector,
      label: `S${(currentSector ?? 0) + 1}`,
      start: startDistance,
      end: samples[samples.length - 1].distance
    });
  }

  if (sectors.length >= 2 || !fallbackSectors.length) {
    return sectors;
  }

  const fallback = [];
  const minDistance = samples[0].distance ?? 0;
  const maxDistance = lapLength ?? samples[samples.length - 1].distance ?? minDistance;
  const distanceSpan = maxDistance - minDistance;
  const validEntries = fallbackSectors
    .map((sector) => ({
      label: sector.label ? sector.label.replace(/\s*\[.*$/, '') : `S${sector.index ?? ''}`,
      time: Number(sector.time)
    }))
    .filter((entry) => Number.isFinite(entry.time) && entry.time > 0);
  const totalTime = validEntries.reduce((sum, sector) => sum + sector.time, 0);
  if (!totalTime || distanceSpan <= 0) {
    return sectors;
  }

  let cursor = minDistance;
  validEntries.forEach((sector, idx) => {
    const ratio = sector.time / totalTime;
    const end = idx === validEntries.length - 1 ? maxDistance : cursor + ratio * distanceSpan;
    fallback.push({
      index: idx + 1,
      label: sector.label || `S${idx + 1}`,
      start: cursor,
      end
    });
    cursor = end;
  });

  return fallback.length ? fallback : sectors;
}

export function formatSeconds(seconds) {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}:${secs.toFixed(3).padStart(6, '0')}` : `${secs.toFixed(3)} s`;
}
