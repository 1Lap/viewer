import { ensureLapSignature } from './signature.js';

const MAX_SHARED_SAMPLES = 1200;
const DISTANCE_SCALE = 100; // centimeters
const TIME_SCALE = 1000; // milliseconds
const COORD_SCALE = 1000; // millimeters
const SPEED_SCALE = 10; // 0.1 km/h increments
const RPM_SCALE = 10; // 10 rpm increments

export async function buildShareLink(lap, windowRange) {
  if (!lap) throw new Error('No lap to share.');
  ensureLapSignature(lap);
  const downsampled = downsampleSamples(lap.samples);
  console.log('[Share] Original samples:', lap.samples.length, 'Downsampled:', downsampled.length);
  const encodedSamples = encodeSamples(downsampled);
  console.log('[Share] Encoded byte length:', encodedSamples.length);
  const { bytes: compressedBytes, compressed } = await compressBytes(encodedSamples);
  const payload = {
    v: 1,
    count: downsampled.length,
    compressed,
    window: windowRange || null,
    meta: {
      name: lap.name,
      signature: lap.signature,
      metadata: lap.metadata,
      sectors: lap.sectors
    },
    data: base64urlEncode(compressedBytes)
  };
  const json = JSON.stringify(payload);
  const encodedPayload = base64urlEncode(stringToBytes(json));
  const url = getBaseUrl();
  if (encodedPayload.length > 8000) {
    url.searchParams.delete('share');
    const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : '');
    const chunkSize = 7500;
    const chunks = [];
    for (let i = 0; i < encodedPayload.length; i += chunkSize) {
      chunks.push(encodedPayload.slice(i, i + chunkSize));
    }
    hashParams.set('shareParts', String(chunks.length));
    chunks.forEach((chunk, index) => hashParams.set(`share${index}`, chunk));
    url.hash = `#${hashParams.toString()}`;
  } else {
    url.searchParams.set('share', encodedPayload);
    const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : '');
    hashParams.delete('shareParts');
    Array.from(hashParams.keys())
      .filter((key) => key.startsWith('share'))
      .forEach((key) => hashParams.delete(key));
    url.hash = hashParams.toString() ? `#${hashParams.toString()}` : '';
  }
  return url.toString();
}

export async function importSharedLap(encoded) {
  if (!encoded) throw new Error('Empty share payload.');
  const jsonBytes = base64urlDecode(encoded);
  const payload = JSON.parse(new TextDecoder().decode(jsonBytes));
  console.log('[Share] Import payload version:', payload?.v, 'count:', payload?.count);
  if (!payload?.data || !payload?.count) {
    throw new Error('Malformed share payload.');
  }
  const compressedBytes = base64urlDecode(payload.data);
  const sampleBytes =
    payload.compressed === false ? compressedBytes : await decompressBytes(compressedBytes);
  const samples = decodeSamples(sampleBytes, payload.count);
  const lap = {
    id: `shared-${crypto.randomUUID?.() ?? Date.now()}`,
    name: payload.meta?.name || 'Shared lap',
    metadata: payload.meta?.metadata || {},
    sectors: payload.meta?.sectors || [],
    samples
  };
  ensureLapSignature(lap);
  return {
    lap,
    window: payload.window || null
  };
}

function downsampleSamples(samples) {
  if (!Array.isArray(samples) || !samples.length) return [];
  if (samples.length <= MAX_SHARED_SAMPLES) return samples.slice();
  const step = Math.ceil(samples.length / MAX_SHARED_SAMPLES);
  const result = [];
  for (let i = 0; i < samples.length; i += step) {
    result.push(samples[i]);
  }
  if (result[result.length - 1] !== samples[samples.length - 1]) {
    result.push(samples[samples.length - 1]);
  }
  return result;
}

function quantizeSample(sample) {
  return {
    distance: Math.round((sample.distance ?? 0) * DISTANCE_SCALE),
    time: Math.round((sample.time ?? 0) * TIME_SCALE),
    throttle: clamp(Math.round((sample.throttle ?? 0) * 2.55), 0, 255),
    brake: clamp(Math.round((sample.brake ?? 0) * 2.55), 0, 255),
    steer: clamp(Math.round(((sample.steer ?? 0) + 100) * 1.275), 0, 255),
    speed: clamp(Math.round((sample.speed ?? 0) * SPEED_SCALE), 0, 4000),
    gear: clamp(Math.round(sample.gear ?? 0), -32, 31),
    rpm: clamp(Math.round((sample.rpm ?? 0) / RPM_SCALE), 0, 20000),
    x: Math.round((sample.x ?? 0) * COORD_SCALE),
    y: Math.round((sample.y ?? 0) * COORD_SCALE),
    z: Math.round((sample.z ?? 0) * COORD_SCALE)
  };
}

function encodeSamples(samples) {
  const bytes = [];
  let prevDistance = 0;
  let prevTime = 0;
  let prevX = 0;
  let prevY = 0;
  let prevZ = 0;
  samples.forEach((sample) => {
    const q = quantizeSample(sample);
    writeSignedVarint(bytes, q.distance - prevDistance);
    prevDistance = q.distance;
    writeSignedVarint(bytes, q.time - prevTime);
    prevTime = q.time;
    bytes.push(q.throttle);
    bytes.push(q.brake);
    bytes.push(q.steer);
    writeUnsignedVarint(bytes, q.speed);
    writeSignedVarint(bytes, q.gear);
    writeUnsignedVarint(bytes, q.rpm);
    writeSignedVarint(bytes, q.x - prevX);
    prevX = q.x;
    writeSignedVarint(bytes, q.y - prevY);
    prevY = q.y;
    writeSignedVarint(bytes, q.z - prevZ);
    prevZ = q.z;
  });
  return Uint8Array.from(bytes);
}

function decodeSamples(bytes, count) {
  const samples = [];
  const state = { offset: 0 };
  let prevDistance = 0;
  let prevTime = 0;
  let prevX = 0;
  let prevY = 0;
  let prevZ = 0;
  for (let i = 0; i < count; i++) {
    prevDistance += readSignedVarint(bytes, state);
    prevTime += readSignedVarint(bytes, state);
    const throttle = readByte(bytes, state);
    const brake = readByte(bytes, state);
    const steer = readByte(bytes, state);
    const speed = readUnsignedVarint(bytes, state);
    const gear = readSignedVarint(bytes, state);
    const rpm = readUnsignedVarint(bytes, state);
    prevX += readSignedVarint(bytes, state);
    prevY += readSignedVarint(bytes, state);
    prevZ += readSignedVarint(bytes, state);
    samples.push({
      distance: prevDistance / DISTANCE_SCALE,
      time: prevTime / TIME_SCALE,
      throttle: throttle / 2.55,
      brake: brake / 2.55,
      steer: steer / 1.275 - 100,
      speed: speed / SPEED_SCALE,
      gear,
      rpm: rpm * RPM_SCALE,
      x: prevX / COORD_SCALE,
      y: prevY / COORD_SCALE,
      z: prevZ / COORD_SCALE
    });
  }
  return samples;
}

async function compressBytes(bytes) {
  if (typeof CompressionStream === 'undefined') {
    console.warn('CompressionStream unavailable; skipping compression.');
    return { bytes, compressed: false };
  }
  try {
    const result = await withTimeout(async () => {
      const stream = new CompressionStream('gzip');
      const writer = stream.writable.getWriter();
      await writer.write(bytes);
      await writer.close();
      const arrayBuffer = await new Response(stream.readable).arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }, 2000);
    return { bytes: result, compressed: true };
  } catch (error) {
    console.warn('Compression failed, using raw payload.', error);
    return { bytes, compressed: false };
  }
}

async function decompressBytes(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    console.warn('DecompressionStream unavailable; treating bytes as uncompressed.');
    return bytes;
  }
  try {
    const stream = new DecompressionStream('gzip');
    const writer = stream.writable.getWriter();
    await writer.write(bytes);
    await writer.close();
    const arrayBuffer = await new Response(stream.readable).arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.warn('Decompression failed, using raw payload.', error);
    return bytes;
  }
}

function writeUnsignedVarint(buffer, value) {
  let v = value >>> 0;
  while (v >= 0x80) {
    buffer.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  buffer.push(v);
}

function writeSignedVarint(buffer, value) {
  const zigzag = (value << 1) ^ (value >> 31);
  writeUnsignedVarint(buffer, zigzag >>> 0);
}

function readUnsignedVarint(bytes, state) {
  let result = 0;
  let shift = 0;
  while (state.offset < bytes.length) {
    const byte = bytes[state.offset++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return result >>> 0;
    }
    shift += 7;
  }
  throw new Error('Malformed varint');
}

function readSignedVarint(bytes, state) {
  const value = readUnsignedVarint(bytes, state);
  return (value >>> 1) ^ -(value & 1);
}

function readByte(bytes, state) {
  if (state.offset >= bytes.length) {
    throw new Error('Unexpected end of buffer');
  }
  return bytes[state.offset++];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function base64urlEncode(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    let chunkStr = '';
    for (let j = 0; j < chunk.length; j++) {
      chunkStr += String.fromCharCode(chunk[j]);
    }
    binary += chunkStr;
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getBaseUrl() {
  if (typeof window !== 'undefined' && window.location) {
    return new URL(window.location.href);
  }
  return new URL('http://localhost/');
}

function base64urlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLength);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function stringToBytes(value) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value);
  }
  // Fallback for very old browsers: UTF-8 encode manually.
  const bytes = [];
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6));
      bytes.push(0x80 | (code & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12));
      bytes.push(0x80 | ((code >> 6) & 0x3f));
      bytes.push(0x80 | (code & 0x3f));
    }
  }
  return Uint8Array.from(bytes);
}

async function withTimeout(fn, ms) {
  let timer;
  return await Promise.race([
    (async () => {
      try {
        const result = await fn();
        return result;
      } finally {
        clearTimeout(timer);
      }
    })(),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('compression timeout')), ms);
    })
  ]);
}
