#!/usr/bin/env node

/**
 * Track Map Generator CLI
 *
 * Generate track map JSON files from calibration lap CSVs.
 *
 * Usage:
 *   node tools/generateTrackMap.js \
 *     --input lapdata_custom/calibration/algarve \
 *     --output assets/trackmaps/algarve_gp.json \
 *     --left lap5.csv \
 *     --right lap7.csv \
 *     --samples 1024 \
 *     --smooth 30
 */

/* eslint-env node */

import { parseArgs } from 'util';
import { resolve, dirname } from 'path';
import { mkdir } from 'fs/promises';
import { loadCalibrationLaps, listCalibrationFiles } from '../js/trackMapGenerator/lapLoader.js';
import { resampleCalibrationLaps } from '../js/trackMapGenerator/resampler.js';
import { extractCenterline, validateCenterline } from '../js/trackMapGenerator/centerline.js';
import { computeGeometry } from '../js/trackMapGenerator/geometry.js';
import {
  calculateWidths,
  detectWidthOutliers,
  clampWidths
} from '../js/trackMapGenerator/width.js';
import { smoothCenterline, smoothWidths } from '../js/trackMapGenerator/smoothing.js';
import { generateEdges, validateEdges } from '../js/trackMapGenerator/edges.js';
import {
  createTrackMapData,
  exportTrackMap,
  generateSummary
} from '../js/trackMapGenerator/exporter.js';

// Parse command-line arguments
const { values } = parseArgs({
  options: {
    input: { type: 'string', short: 'i' },
    output: { type: 'string', short: 'o' },
    left: { type: 'string' },
    center: { type: 'string' },
    right: { type: 'string' },
    samples: { type: 'string', default: '1024' },
    smooth: { type: 'string', default: '30' },
    list: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false }
  },
  allowPositionals: true
});

// Show help
if (values.help) {
  console.log(`
Track Map Generator

Usage:
  node tools/generateTrackMap.js [options]

Options:
  -i, --input <dir>      Input directory containing calibration CSV files (required)
  -o, --output <file>    Output JSON file path (required)
  --left <file>          Filename of left-limit lap CSV (required)
  --right <file>         Filename of right-limit lap CSV (required)
  --center <file>        Filename of center/racing-line lap CSV (optional)
  --samples <n>          Number of grid samples (default: 1024)
  --smooth <n>           Smoothing window size (default: 30)
  --list                 List available CSV files in input directory
  -h, --help             Show this help message

Examples:
  # List available calibration files
  node tools/generateTrackMap.js --input lapdata_custom/calibration/algarve --list

  # Generate track map from left and right laps
  node tools/generateTrackMap.js \\
    --input lapdata_custom/calibration/algarve \\
    --output assets/trackmaps/algarve_gp.json \\
    --left lap5.csv \\
    --right lap7.csv

  # Generate with all three laps and custom settings
  node tools/generateTrackMap.js \\
    --input lapdata_custom/calibration/algarve \\
    --output assets/trackmaps/algarve_gp.json \\
    --left lap5.csv \\
    --center lap6.csv \\
    --right lap7.csv \\
    --samples 2048 \\
    --smooth 50
`);
  process.exit(0);
}

// List files mode
if (values.list) {
  if (!values.input) {
    console.error('Error: --input directory is required');
    process.exit(1);
  }

  const inputDir = resolve(values.input);
  console.log(`\nCalibration files in ${inputDir}:\n`);

  try {
    const files = await listCalibrationFiles(inputDir);
    if (files.length === 0) {
      console.log('  (no CSV files found)');
    } else {
      files.forEach((file) => console.log(`  ${file}`));
    }
    console.log();
  } catch (error) {
    console.error(`Error listing files: ${error.message}`);
    process.exit(1);
  }

  process.exit(0);
}

// Validate required arguments
if (!values.input || !values.output || !values.left || !values.right) {
  console.error('Error: Missing required arguments');
  console.error('Run with --help for usage information');
  process.exit(1);
}

const inputDir = resolve(values.input);
const outputPath = resolve(values.output);
const gridSamples = parseInt(values.samples, 10);
const smoothWindow = parseInt(values.smooth, 10);

if (isNaN(gridSamples) || gridSamples < 100) {
  console.error('Error: --samples must be a number >= 100');
  process.exit(1);
}

if (isNaN(smoothWindow) || smoothWindow < 1) {
  console.error('Error: --smooth must be a number >= 1');
  process.exit(1);
}

console.log('\n=== Track Map Generator ===\n');
console.log(`Input: ${inputDir}`);
console.log(`Output: ${outputPath}`);
console.log(`Grid samples: ${gridSamples}`);
console.log(`Smoothing window: ${smoothWindow}`);
console.log();

try {
  // Step 1: Load calibration laps
  console.log('[1/9] Loading calibration laps...');
  const lapMap = {
    left: values.left,
    center: values.center,
    right: values.right
  };

  const { laps, trackId, trackName } = await loadCalibrationLaps(inputDir, lapMap);
  console.log(`  ✓ Loaded ${laps.length} laps for track: ${trackName}`);

  // Step 2: Resample onto common grid
  console.log('[2/9] Resampling laps onto common progress grid...');
  const grids = resampleCalibrationLaps(laps, gridSamples);
  console.log(`  ✓ Resampled to ${gridSamples} uniform points`);

  // Step 3: Extract centerline
  console.log('[3/9] Extracting centerline...');
  const centerlineRaw = extractCenterline(grids);
  console.log(`  ✓ Centerline extracted (${centerlineRaw.length} points)`);

  // Step 4: Validate centerline
  console.log('[4/9] Validating centerline...');
  const centerlineValidation = validateCenterline(centerlineRaw);
  if (!centerlineValidation.valid) {
    console.log('  ⚠ Validation warnings:');
    centerlineValidation.errors.forEach((err) => console.log(`    - ${err}`));
  } else {
    console.log(`  ✓ Centerline valid`);
  }
  console.log(`    Closure: ${centerlineValidation.stats.closureDistance}m`);

  // Step 5: Smooth centerline
  console.log('[5/9] Smoothing centerline...');
  const centerline = smoothCenterline(centerlineRaw, smoothWindow);
  console.log(`  ✓ Applied smoothing (window: ${smoothWindow})`);

  // Step 6: Compute geometry
  console.log('[6/9] Computing tangents and normals...');
  const { normals } = computeGeometry(centerline);
  console.log(`  ✓ Computed ${normals.length} normal vectors`);

  // Step 7: Calculate widths
  console.log('[7/9] Calculating track widths...');
  const { halfWidthLeft: rawLeft, halfWidthRight: rawRight } = calculateWidths(
    centerline,
    normals,
    grids
  );

  // Detect outliers
  const outlierReport = detectWidthOutliers(rawLeft, rawRight);
  if (outlierReport.outliers.length > 0) {
    console.log(`  ⚠ Found ${outlierReport.outliers.length} width outliers (showing first 5):`);
    outlierReport.outliers.slice(0, 5).forEach((o) => {
      console.log(`    - Point ${o.index}: ${o.reason}`);
    });
  }

  console.log(
    `  Width stats: ${outlierReport.stats.avgTotal}m avg (L: ${outlierReport.stats.avgLeft}m, R: ${outlierReport.stats.avgRight}m)`
  );

  // Clamp outliers
  const { halfWidthLeft: clampedLeft, halfWidthRight: clampedRight } = clampWidths(
    rawLeft,
    rawRight
  );

  // Smooth widths
  const { halfWidthLeft, halfWidthRight } = smoothWidths(clampedLeft, clampedRight, smoothWindow);
  console.log(`  ✓ Widths calculated and smoothed`);

  // Step 8: Generate edges
  console.log('[8/9] Generating edge polylines...');
  const { leftEdge, rightEdge } = generateEdges(centerline, normals, halfWidthLeft, halfWidthRight);

  // Validate edges
  const edgeValidation = validateEdges(leftEdge, rightEdge);
  if (!edgeValidation.valid) {
    console.log('  ⚠ Edge validation warnings:');
    edgeValidation.warnings.forEach((w) => console.log(`    - ${w}`));
  } else {
    console.log(`  ✓ Edges valid`);
  }

  // Step 9: Export JSON
  console.log('[9/9] Exporting track map...');

  const trackMapData = createTrackMapData({
    sim: 'lmu',
    trackId,
    trackName,
    sampleCount: gridSamples,
    centerline,
    halfWidthLeft,
    halfWidthRight,
    leftEdge,
    rightEdge,
    smoothingWindow: smoothWindow,
    calibrationLaps: {
      left: values.left || null,
      center: values.center || null,
      right: values.right || null
    }
  });

  // Ensure output directory exists
  await mkdir(dirname(outputPath), { recursive: true });

  await exportTrackMap(trackMapData, outputPath);
  console.log(`  ✓ Exported to ${outputPath}`);

  // Print summary
  console.log('\n' + generateSummary(trackMapData));
  console.log('\n✅ Track map generation complete!\n');
} catch (error) {
  console.error(`\n❌ Error: ${error.message}`);
  if (error.stack) {
    console.error('\nStack trace:');
    console.error(error.stack);
  }
  process.exit(1);
}
