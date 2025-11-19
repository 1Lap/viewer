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
import { mkdir, writeFile } from 'fs/promises';
import { loadCalibrationLaps, listCalibrationFiles } from '../js/trackMapGenerator/lapLoader.js';
import { resampleCalibrationLaps } from '../js/trackMapGenerator/resampler.js';
import { validateCenterline } from '../js/trackMapGenerator/centerline.js';
import { computeGeometry, computeSignedAngles } from '../js/trackMapGenerator/geometry.js';
import {
  calculateWidths,
  detectWidthOutliers,
  clampWidths,
  computeTargetWidth,
  buildConstantWidthEnvelope,
  savitzkyGolayWidthSmooth,
  clampWidthDeltas
} from '../js/trackMapGenerator/width.js';
import { smoothCenterline } from '../js/trackMapGenerator/smoothing.js';
import { generateEdges, validateEdges } from '../js/trackMapGenerator/edges.js';
import {
  createTrackMapData,
  exportTrackMap,
  generateSummary
} from '../js/trackMapGenerator/exporter.js';
import { enforceWidthConstraints } from '../js/trackMapGenerator/constraints.js';
import { buildCenterSplineSamples } from '../js/trackMapGenerator/spline.js';

// Parse command-line arguments
const { values } = parseArgs({
  options: {
    input: { type: 'string', short: 'i' },
    output: { type: 'string', short: 'o' },
    left: { type: 'string' },
    center: { type: 'string' },
    right: { type: 'string' },
    samples: { type: 'string' },
    smooth: { type: 'string', default: '30' },
    list: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
    pointTarget: { type: 'string' },
    tension: { type: 'string' },
    trackWidth: { type: 'string' },
    spacing: { type: 'string' },
    preview: { type: 'boolean', default: false },
    'spline-dump': { type: 'boolean', default: false },
    singleSide: { type: 'boolean', default: false }
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
  --samples <n>          Number of grid samples (overrides spacing)
  --smooth <n>           Smoothing window size (default: 30)
  --pointTarget <n>      Target spline control points (~40)
  --tension <float>      Bézier tension (default: 0.5)
  --trackWidth <m>       Default track width when only one lap provided (default: 12)
  --spacing <m>          Target sample spacing in meters (default: 0.5)
  --preview              Write preview JSON blob alongside output
  --spline-dump          Write inside spline CSV alongside output
  --singleSide           Allow generation with only a single calibration lap
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
const hasLeftArg = Boolean(values.left);
const hasRightArg = Boolean(values.right);
if (
  !values.input ||
  !values.output ||
  (!values.singleSide && (!hasLeftArg || !hasRightArg)) ||
  (values.singleSide && !(hasLeftArg || hasRightArg))
) {
  console.error('Error: Missing required arguments');
  console.error('Run with --help for usage information');
  process.exit(1);
}

const inputDir = resolve(values.input);
const outputPath = resolve(values.output);
const requestedSamples = values.samples ? parseInt(values.samples, 10) : null;
const smoothWindow = parseInt(values.smooth, 10);
const spacingMeters = values.spacing ? Number(values.spacing) : 0.5;

if (requestedSamples !== null && (isNaN(requestedSamples) || requestedSamples < 100)) {
  console.error('Error: --samples must be a number >= 100');
  process.exit(1);
}

if (!Number.isFinite(spacingMeters) || spacingMeters <= 0) {
  console.error('Error: --spacing must be a positive number');
  process.exit(1);
}

if (isNaN(smoothWindow) || smoothWindow < 1) {
  console.error('Error: --smooth must be a number >= 1');
  process.exit(1);
}

console.log('\n=== Track Map Generator ===\n');
console.log(`Input: ${inputDir}`);
console.log(`Output: ${outputPath}`);
if (requestedSamples) {
  console.log(`Grid samples (requested): ${requestedSamples}`);
}
console.log(`Spacing target: ${spacingMeters} m`);
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

  const { laps, trackId, trackName } = await loadCalibrationLaps(inputDir, lapMap, {
    requireBothSides: !values.singleSide
  });
  console.log(`  ✓ Loaded ${laps.length} laps for track: ${trackName}`);

  // Step 2: Resample onto common grid
  console.log('[2/9] Resampling laps onto common progress grid...');
  const {
    grids,
    rawSamples,
    metadata: resampleMeta
  } = resampleCalibrationLaps(laps, {
    sampleCount: requestedSamples || undefined,
    spacingMeters
  });
  const resolvedSamples = resampleMeta.sampleCount;
  console.log(
    `  ✓ Resampled to ${resolvedSamples} uniform points (~${resampleMeta.spacingMeters.toFixed(3)} m spacing)`
  );

  // Step 3: Extract centerline via splines
  console.log('[3/9] Extracting spline-based centerline...');
  const splineSamples = buildCenterSplineSamples(grids, resolvedSamples, {
    pointTarget: values.pointTarget ? Number(values.pointTarget) : undefined,
    tension: values.tension ? Number(values.tension) : undefined,
    allowSingleSide: values.singleSide,
    defaultTrackWidth: values.trackWidth ? Number(values.trackWidth) : 12,
    spacingMeters: resampleMeta.spacingMeters
  });
  const centerlineRaw = splineSamples.centerline;
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
  const signedAngles = computeSignedAngles(centerline);
  console.log(`  ✓ Computed ${normals.length} normal vectors`);

  // Step 7: Calculate widths
  console.log('[7/9] Calculating track widths...');
  const rawWidths = calculateWidths(centerline, normals, {
    left: splineSamples.leftSamples,
    right: splineSamples.rightSamples
  });
  const targetWidth = computeTargetWidth(rawWidths.halfWidthLeft, rawWidths.halfWidthRight);
  const constantEnvelope = buildConstantWidthEnvelope(
    rawWidths.halfWidthLeft,
    rawWidths.halfWidthRight,
    signedAngles,
    targetWidth
  );
  const rawLeft = constantEnvelope.halfWidthLeft;
  const rawRight = constantEnvelope.halfWidthRight;
  console.log(`  Target width ≈ ${targetWidth.toFixed(2)}m`);

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

  const savitzkyWidths = savitzkyGolayWidthSmooth(clampedLeft, clampedRight, {
    windowSize: 9,
    order: 3,
    spacing: resampleMeta.spacingMeters
  });

  const slopeLimited = clampWidthDeltas(
    savitzkyWidths.halfWidthLeft,
    savitzkyWidths.halfWidthRight,
    {
      spacingMeters: resampleMeta.spacingMeters,
      maxDeltaPer10m: 0.25
    }
  );
  console.log('  ✓ Widths smoothed with Savitzky–Golay + slope clamp');

  console.log('  ✓ Enforcing guardrails against calibration laps');
  const {
    halfWidthLeft,
    halfWidthRight,
    stats: guardrailStats
  } = enforceWidthConstraints({
    centerline,
    normals,
    rawSamples,
    halfWidthLeft: slopeLimited.halfWidthLeft,
    halfWidthRight: slopeLimited.halfWidthRight,
    clampScale: 1
  });
  if ((guardrailStats?.leftClamped || 0) + (guardrailStats?.rightClamped || 0) > 0) {
    console.log(
      `    Guardrails: adjusted ${guardrailStats.leftClamped} left / ${guardrailStats.rightClamped} right samples`
    );
  }

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
    sampleCount: resolvedSamples,
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
    },
    metadata: {
      leftControlCount: splineSamples.metadata.leftControlCount,
      rightControlCount: splineSamples.metadata.rightControlCount,
      centerControlCount: splineSamples.metadata.centerControlCount,
      targetWidth: constantEnvelope.stats.targetWidth,
      insideLeftCount: constantEnvelope.stats.insideLeftCount,
      insideRightCount: constantEnvelope.stats.insideRightCount,
      guardrailClamps: guardrailStats,
      insideFlipCount: splineSamples.metadata.insideFlipCount,
      apexAnchorCount: splineSamples.metadata.apexCount,
      spacingMeters: resampleMeta.spacingMeters,
      widthClampDiagnostics: slopeLimited.diagnostics
    }
  });

  // Ensure output directory exists
  await mkdir(dirname(outputPath), { recursive: true });

  await exportTrackMap(trackMapData, outputPath);
  console.log(`  ✓ Exported to ${outputPath}`);

  if (values.preview) {
    const previewPath = `${outputPath}.preview.json`;
    await writeFile(
      previewPath,
      JSON.stringify(
        {
          trackId,
          trackName,
          centerline,
          insideSpline: splineSamples.insideSamples,
          metadata: trackMapData.metadata
        },
        null,
        2
      ),
      'utf-8'
    );
    console.log(`  ✓ Preview blob written to ${previewPath}`);
  }

  if (values['spline-dump']) {
    const splinePath = `${outputPath}.inside.csv`;
    const csvLines = ['index,x,y'];
    splineSamples.insideSamples.forEach((point, idx) => {
      csvLines.push(`${idx},${point.x.toFixed(4)},${point.y.toFixed(4)}`);
    });
    await writeFile(splinePath, csvLines.join('\n'), 'utf-8');
    console.log(`  ✓ Inside spline dumped to ${splinePath}`);
  }

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
