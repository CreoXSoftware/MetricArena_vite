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

/**
 * Parse a CSV string into session rows.
 */
export function parseCSV(text) {
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
