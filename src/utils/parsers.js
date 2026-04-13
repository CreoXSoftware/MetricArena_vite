/**
 * Parse a binary .bin file buffer into session rows.
 * v1: 47 bytes/record  (speed = uint16 × 0.1)
 * v0: 61 bytes/record  (speed = float)
 */
export function parseBinary(buffer, version) {
  const view = new DataView(buffer);
  const recSize = version === 1 ? 47 : 61;
  const numRecs = Math.floor(buffer.byteLength / recSize);
  if (numRecs === 0) throw new Error(`No records found in binary file (version ${version}, record size ${recSize} B)`);

  const rows = [];
  for (let i = 0; i < numRecs; i++) {
    const b = i * recSize;
    const row = {
      kernelTick: view.getUint32(b, true),
      year: view.getUint16(b + 4, true),
      month: view.getUint8(b + 6),
      day: view.getUint8(b + 7),
      hour: view.getUint8(b + 8),
      minute: view.getUint8(b + 9),
      second: view.getUint8(b + 10),
      millisecond: view.getUint16(b + 11, true),
      latitude: view.getFloat32(b + 13, true),
      longitude: view.getFloat32(b + 17, true),
    };

    if (version === 1) {
      row.speed_kph = view.getUint16(b + 21, true) / 10;
      row.accel_x = view.getFloat32(b + 23, true);
      row.accel_y = view.getFloat32(b + 27, true);
      row.accel_z = view.getFloat32(b + 31, true);
      row.gyro_x = view.getFloat32(b + 35, true);
      row.gyro_y = view.getFloat32(b + 39, true);
      row.gyro_z = view.getFloat32(b + 43, true);
    } else {
      row.speed_kph = view.getFloat32(b + 21, true);
      row.accel_x = view.getFloat32(b + 25, true);
      row.accel_y = view.getFloat32(b + 29, true);
      row.accel_z = view.getFloat32(b + 33, true);
      row.gyro_x = view.getFloat32(b + 37, true);
      row.gyro_y = view.getFloat32(b + 41, true);
      row.gyro_z = view.getFloat32(b + 45, true);
    }

    rows.push(row);
  }
  if (rows.length === 0) throw new Error('No valid records parsed from binary file');
  return rows;
}

// Matches sensor CSV lines: [optional $]HH:MM:SS.mmm,<values>*
const SENSOR_CSV_RE = /^\$?\d{2}:\d{2}:\d{2}\.\d{3},/;

/**
 * Parse sensor CSV (no header): [$]HH:MM:SS.mmm,ax,ay,az,lat,lon,speed_knots*
 * Date defaults to today (UTC). kernelTick = ms offset from first row.
 * No gyro: gravity vector is derived from LPF of accel in processSession
 * (gyro rotation skipped when theta<=1e-9, complementary filter acts as LPF).
 */
export function parseSensorCSV(text) {
  const lines = text.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  let baseMs = null;
  const rows = [];

  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/\*$/, '');
    if (!line || !SENSOR_CSV_RE.test(line)) continue;
    const parts = line.split(',');
    if (parts.length < 7) continue;

    const timeParts = parts[0].replace(/^\$/, '').split(':');
    const hour = parseInt(timeParts[0], 10);
    const minute = parseInt(timeParts[1], 10);
    const secParts = timeParts[2].split('.');
    const second = parseInt(secParts[0], 10);
    const millisecond = parseInt(secParts[1] || '0', 10);

    const rowMs = (hour * 3600 + minute * 60 + second) * 1000 + millisecond;
    if (baseMs === null) baseMs = rowMs;

    rows.push({
      kernelTick: rowMs - baseMs,
      year, month, day,
      hour, minute, second, millisecond,
      accel_x: parseFloat(parts[1]),
      accel_y: parseFloat(parts[2]),
      accel_z: parseFloat(parts[3]),
      latitude: parseFloat(parts[4]),
      longitude: parseFloat(parts[5]),
      speed_kph: parseFloat(parts[6]) * 1.852,
    });
  }

  if (rows.length === 0) throw new Error('No valid records found in sensor CSV');

  // Auto-detect accel units: if mean magnitude of first N samples ≈ 1, data is g-force → scale to m/s²
  const probeN = Math.min(50, rows.length);
  let magSum = 0;
  for (let i = 0; i < probeN; i++) {
    const r = rows[i];
    magSum += Math.sqrt(r.accel_x * r.accel_x + r.accel_y * r.accel_y + r.accel_z * r.accel_z);
  }
  const meanMag = magSum / probeN;
  if (meanMag > 0.3 && meanMag < 3) {
    const G = 9.80665;
    for (const r of rows) { r.accel_x *= G; r.accel_y *= G; r.accel_z *= G; }
  }

  return rows;
}

/**
 * Parse a CSV string into session rows.
 * Auto-detects sensor CSV format (no header, HH:MM:SS.mmm timestamp).
 */
export function parseCSV(text) {
  const firstLine = text.trimStart().split(/\r?\n/)[0] || '';
  if (SENSOR_CSV_RE.test(firstLine.trim())) return parseSensorCSV(text);

  const lines = text.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = line.split(',');
    if (vals.length < headers.length) continue;
    const row = {};
    headers.forEach((h, j) => { row[h] = vals[j].trim(); });
    rows.push(row);
  }
  if (rows.length === 0) throw new Error('No data rows found');
  return rows;
}

/**
 * Infer binary version from filename pattern like `_v1.bin`
 */
export function inferBinaryVersion(filename) {
  const m = filename.match(/_v(\d+)\.bin$/i);
  return m ? parseInt(m[1], 10) : 1;
}
