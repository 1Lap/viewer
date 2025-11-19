/**
 * Track map loader for the SPA.
 *
 * This module handles loading and caching of track map JSON files.
 */

const PREVIEW_STORAGE_KEY = 'trackMapPreview';

// Cache for loaded track maps
const trackMapCache = new Map();

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizePolyline(points) {
  if (!Array.isArray(points)) return [];
  const normalized = [];
  for (const point of points) {
    if (!point) continue;
    if (Array.isArray(point) && point.length >= 2) {
      const [x, y] = point;
      if (isFiniteNumber(x) && isFiniteNumber(y)) {
        normalized.push([x, y]);
      }
    } else if (isFiniteNumber(point.x) && isFiniteNumber(point.y)) {
      normalized.push([point.x, point.y]);
    }
  }
  return normalized;
}

function computeViewBox(polylines, paddingFactor = 0.05) {
  const points = [];
  polylines.forEach((polyline) => {
    if (!Array.isArray(polyline)) return;
    for (const point of polyline) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const [x, y] = point;
      if (isFiniteNumber(x) && isFiniteNumber(y)) {
        points.push([x, y]);
      }
    }
  });
  if (!points.length) {
    return [0, 0, 1, 1];
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const paddingX = width * paddingFactor;
  const paddingY = height * paddingFactor;
  return [minX - paddingX / 2, minY - paddingY / 2, width + paddingX, height + paddingY];
}

function normalizeViewBox(viewBox) {
  if (
    Array.isArray(viewBox) &&
    viewBox.length === 4 &&
    viewBox.every((value) => isFiniteNumber(value))
  ) {
    return viewBox;
  }
  return null;
}

function normalizeTrackMapData(rawMap, trackId) {
  if (!rawMap || typeof rawMap !== 'object') return null;

  const left = normalizePolyline(rawMap.left ?? rawMap.leftEdge);
  const right = normalizePolyline(rawMap.right ?? rawMap.rightEdge);
  const center = normalizePolyline(rawMap.center ?? rawMap.centerline);

  if (!left.length && !right.length && !center.length) {
    console.error(`Invalid track map structure for ${trackId}: missing coordinates`);
    return null;
  }

  const meta = rawMap.meta || rawMap.metadata || {};
  let sampleCount = rawMap.sampleCount ?? meta.sampleCount ?? null;
  if (sampleCount == null) {
    const fallbackCount = center.length || Math.max(left.length, right.length);
    sampleCount = fallbackCount || null;
  }
  const smoothingWindow = rawMap.smoothingWindow ?? meta.smoothingWindow ?? null;
  const generatedAt = rawMap.generatedAt ?? meta.generatedAt ?? null;
  const trackName = rawMap.trackName ?? meta.trackName ?? null;
  const viewBox =
    normalizeViewBox(rawMap.viewBox) || computeViewBox([left, right, center]);

  return {
    trackId: rawMap.trackId ?? trackId ?? null,
    trackName,
    version: rawMap.version ?? 1,
    generatedAt,
    sampleCount,
    smoothingWindow,
    left,
    right,
    center,
    viewBox,
    metadata: { ...meta }
  };
}

/**
 * Normalize track name to track ID format.
 * Must match the normalization used in the generator (lapLoader.js).
 *
 * @param {string} trackName - Original track name
 * @returns {string} Normalized track ID
 */
function normalizeTrackId(trackName) {
  return trackName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Load a track map JSON file.
 *
 * @param {string} trackId - Track identifier (e.g., "algarve_international_circuit")
 * @returns {Promise<Object|null>} Track map data, or null if not found
 */
export async function loadTrackMap(trackId) {
  // Check cache first
  if (trackMapCache.has(trackId)) {
    return trackMapCache.get(trackId);
  }

  const previewMap = readPreviewTrackMap(trackId);
  if (previewMap) {
    trackMapCache.set(trackId, previewMap);
    console.info(`Using preview track map for ${trackId} from localStorage.`);
    return previewMap;
  }

  try {
    const response = await fetch(`assets/trackmaps/${trackId}.json`);

    if (!response.ok) {
      if (response.status === 404) {
        // Track map not found - this is expected for tracks without calibration data
        trackMapCache.set(trackId, null); // Cache negative result
        return null;
      }
      throw new Error(`Failed to load track map: ${response.statusText}`);
    }

    const rawTrackMap = await response.json();
    const trackMap = normalizeTrackMapData(rawTrackMap, trackId);
    if (!trackMap) {
      trackMapCache.set(trackId, null);
      return null;
    }

    trackMapCache.set(trackId, trackMap);
    return trackMap;
  } catch (error) {
    console.error(`Error loading track map for ${trackId}:`, error);
    trackMapCache.set(trackId, null); // Cache negative result
    return null;
  }
}

/**
 * Load track map by track name (automatically normalizes to ID).
 *
 * @param {string} trackName - Original track name from lap metadata
 * @returns {Promise<Object|null>} Track map data, or null if not found
 */
export async function loadTrackMapByName(trackName) {
  const trackId = normalizeTrackId(trackName);
  return loadTrackMap(trackId);
}

/**
 * Get cached track map without loading.
 *
 * @param {string} trackId - Track identifier
 * @returns {Object|null} Cached track map, or null if not loaded/found
 */
export function getTrackMap(trackId) {
  return trackMapCache.get(trackId) || null;
}

/**
 * Get cached track map by name.
 *
 * @param {string} trackName - Original track name
 * @returns {Object|null} Cached track map, or null if not loaded/found
 */
export function getTrackMapByName(trackName) {
  const trackId = normalizeTrackId(trackName);
  return getTrackMap(trackId);
}

/**
 * Clear the track map cache.
 */
export function clearTrackMapCache() {
  trackMapCache.clear();
}

/**
 * Preload track maps for given track names.
 *
 * Useful for preloading maps for all loaded laps at once.
 *
 * @param {Array<string>} trackNames - Array of track names
 * @returns {Promise<void>}
 */
export async function preloadTrackMaps(trackNames) {
  const uniqueIds = new Set(trackNames.map(normalizeTrackId));
  const promises = Array.from(uniqueIds).map((id) => loadTrackMap(id));
  await Promise.allSettled(promises);
}

function readPreviewTrackMap(trackId) {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload || payload.trackId !== trackId) return null;
    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      window.localStorage.removeItem(PREVIEW_STORAGE_KEY);
      return null;
    }
    const normalized = normalizeTrackMapData(payload.trackMap, trackId);
    return normalized || null;
  } catch {
    return null;
  }
}
