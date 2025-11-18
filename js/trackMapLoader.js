/**
 * Track map loader for the SPA.
 *
 * This module handles loading and caching of track map JSON files.
 */

// Cache for loaded track maps
const trackMapCache = new Map();

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

    const trackMap = await response.json();

    // Validate basic structure
    if (!trackMap.centerline || !trackMap.leftEdge || !trackMap.rightEdge) {
      console.error(`Invalid track map structure for ${trackId}`);
      return null;
    }

    // Cache and return
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
