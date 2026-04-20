/**
 * Process raw session rows into the enriched data array with
 * gravity-corrected linear acceleration, cumulative distance, etc.
 */
export function processSession(sessionData) {
  const d = sessionData.map(r => ({
    tick: parseFloat(r.kernelTick),
    ts: new Date(Date.UTC(+r.year, +r.month - 1, +r.day, +r.hour, +r.minute, +r.second, +r.millisecond)),
    lat: parseFloat(r.latitude),
    lon: parseFloat(r.longitude),
    speed: parseFloat(r.speed_kph) / 3.6,
    ax: parseFloat(r.accel_x),
    ay: parseFloat(r.accel_y),
    az: parseFloat(r.accel_z),
    gx: parseFloat(r.gyro_x),
    gy: parseFloat(r.gyro_y),
    gz: parseFloat(r.gyro_z),
  }));

  const G = 9.80665;
  const seedN = Math.min(50, d.length);
  let gvx = 0, gvy = 0, gvz = 0;
  for (let i = 0; i < seedN; i++) { gvx += d[i].ax; gvy += d[i].ay; gvz += d[i].az; }
  gvx /= seedN; gvy /= seedN; gvz /= seedN;
  let gMag = Math.sqrt(gvx * gvx + gvy * gvy + gvz * gvz);
  if (gMag > 0.01) { gvx *= G / gMag; gvy *= G / gMag; gvz *= G / gMag; }

  const alpha = 0.98;

  for (let i = 0; i < d.length; i++) {
    const p = d[i];
    let dt = (i === 0) ? 0.1 : (p.tick - d[i - 1].tick) / 1000;
    if (dt <= 0 || dt > 1) dt = 0.1;

    const wx = p.gx, wy = p.gy, wz = p.gz;
    const wMag = Math.sqrt(wx * wx + wy * wy + wz * wz);
    const theta = wMag * dt;

    let grx, gry, grz;
    if (theta > 1e-9) {
      const kx = wx / wMag, ky = wy / wMag, kz = wz / wMag;
      const cosT = Math.cos(theta), sinT = Math.sin(theta);
      const dot = kx * gvx + ky * gvy + kz * gvz;
      const cx = ky * gvz - kz * gvy;
      const cy = kz * gvx - kx * gvz;
      const cz = kx * gvy - ky * gvx;
      grx = gvx * cosT + cx * sinT + kx * dot * (1 - cosT);
      gry = gvy * cosT + cy * sinT + ky * dot * (1 - cosT);
      grz = gvz * cosT + cz * sinT + kz * dot * (1 - cosT);
    } else {
      grx = gvx; gry = gvy; grz = gvz;
    }

    gvx = alpha * grx + (1 - alpha) * p.ax;
    gvy = alpha * gry + (1 - alpha) * p.ay;
    gvz = alpha * grz + (1 - alpha) * p.az;
    gMag = Math.sqrt(gvx * gvx + gvy * gvy + gvz * gvz);
    if (gMag > 0.01) { gvx *= G / gMag; gvy *= G / gMag; gvz *= G / gMag; }

    p.linX = p.ax - gvx;
    p.linY = p.ay - gvy;
    p.linZ = p.az - gvz;
    p.linMag = Math.sqrt(p.linX * p.linX + p.linY * p.linY + p.linZ * p.linZ);
    p.t = (p.tick - d[0].tick) / 1000;
  }

  // GPS jump filter: reject (0,0)/NaN null-island fixes and samples implying
  // speed above human limit. 15 m/s ≈ 54 km/h > elite sprint (~12 m/s).
  const MAX_SPEED_MS = 15;
  const isBadFix = (lat, lon) =>
    !Number.isFinite(lat) || !Number.isFinite(lon) ||
    (Math.abs(lat) < 1e-4 && Math.abs(lon) < 1e-4);

  let lastGoodIdx = -1;
  for (let i = 0; i < d.length; i++) {
    const bad = isBadFix(d[i].lat, d[i].lon);
    if (bad) {
      d[i].gpsJump = true;
      if (lastGoodIdx >= 0) {
        d[i].lat = d[lastGoodIdx].lat;
        d[i].lon = d[lastGoodIdx].lon;
      }
      d[i].dist = 0;
      d[i].cumDist = i === 0 ? 0 : d[i - 1].cumDist;
      continue;
    }
    if (lastGoodIdx < 0) {
      d[i].gpsJump = false;
      d[i].dist = 0;
      d[i].cumDist = i === 0 ? 0 : d[i - 1].cumDist;
      lastGoodIdx = i;
      continue;
    }
    const dt = d[i].t - d[lastGoodIdx].t;
    const raw = haversine(d[lastGoodIdx].lat, d[lastGoodIdx].lon, d[i].lat, d[i].lon);
    const impliedMs = dt > 0 ? raw / dt : Infinity;
    if (impliedMs > MAX_SPEED_MS) {
      d[i].gpsJump = true;
      d[i].lat = d[lastGoodIdx].lat;
      d[i].lon = d[lastGoodIdx].lon;
      d[i].dist = 0;
      d[i].cumDist = d[i - 1].cumDist;
      if (d[i].speed > MAX_SPEED_MS) d[i].speed = d[lastGoodIdx].speed;
    } else {
      d[i].gpsJump = false;
      d[i].dist = raw;
      d[i].cumDist = d[i - 1].cumDist + raw;
      lastGoodIdx = i;
    }
  }

  return d;
}

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
