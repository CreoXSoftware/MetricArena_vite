/**
 * Default threshold definitions and values.
 */
export const thresholdDefs = [
  { id: 'sprintSpeed', label: 'Sprint Speed', unit: 'm/s', min: 3, max: 10, step: 0.1, default: 5.5 },
  { id: 'sprintHyst', label: 'Sprint Hysteresis (off)', unit: 'm/s', min: 1.5, max: 8, step: 0.1, default: 5 },
  { id: 'runSpeed', label: 'Run Speed', unit: 'm/s', min: 1, max: 6, step: 0.1, default: 2.2 },
  { id: 'runHyst', label: 'Run Hysteresis (off)', unit: 'm/s', min: 0.5, max: 4, step: 0.1, default: 1.4 },
  { id: 'highSpeedThresh', label: 'High-Speed Zone', unit: 'm/s', min: 2, max: 8, step: 0.1, default: 4.2 },
  { id: 'impactThresh', label: 'Impact Threshold', unit: 'm/s²', min: 2, max: 100, step: 0.5, default: 40 },
  { id: 'impactBase', label: 'Impact Baseline (below)', unit: 'm/s²', min: 1, max: 100, step: 0.5, default: 10 },
  { id: 'movingThresh', label: 'Moving Threshold', unit: 'm/s', min: 0.1, max: 1.5, step: 0.05, default: 0.3 },
  { id: 'zone1', label: 'Speed Zone 1 Upper', unit: 'm/s', min: 0.3, max: 3, step: 0.1, default: 1.4 },
  { id: 'zone2', label: 'Speed Zone 2 Upper', unit: 'm/s', min: 1.5, max: 5, step: 0.1, default: 2.8 },
  { id: 'zone3', label: 'Speed Zone 3 Upper', unit: 'm/s', min: 3, max: 7, step: 0.1, default: 4.2 },
  { id: 'zone4', label: 'Speed Zone 4 Upper', unit: 'm/s', min: 4, max: 10, step: 0.1, default: 5.5 },
];

export function getDefaultThresholds() {
  const t = {};
  thresholdDefs.forEach(td => { t[td.id] = td.default; });
  return t;
}

/**
 * Compute all session metrics from processed data array.
 * profile: { weight, height, age, maxHR, sex, sport, vo2max }
 * thresholds: { sprintSpeed, sprintHyst, runSpeed, ... }
 */
export function computeMetrics(data, profile, thresholds) {
  if (!data || data.length < 2) return null;

  const T = thresholds;
  const mass = profile.weight;

  const speeds = data.map(d => d.speed);
  const maxSpeed = Math.max(...speeds);
  const maxSpeedMs = maxSpeed;

  const accels = data.map(d => d.linMag);
  const maxAccel = Math.max(...accels);

  const movingAccels = [];
  const movingSpeeds = [];
  data.forEach(d => {
    if (d.speed > T.movingThresh) { movingAccels.push(d.linMag); movingSpeeds.push(d.speed); }
  });
  const avgAccel = movingAccels.length ? movingAccels.reduce((a, b) => a + b, 0) / movingAccels.length : 0;
  const avgSpeed = movingSpeeds.length ? movingSpeeds.reduce((a, b) => a + b, 0) / movingSpeeds.length : 0;

  // Distance & time to max speed
  const maxSpeedIdx = speeds.indexOf(maxSpeed);
  let startIdx = 0;
  for (let i = maxSpeedIdx - 1; i >= 0; i--) { if (data[i].speed < T.movingThresh) { startIdx = i; break; } }
  let distToMax = 0;
  for (let i = startIdx; i < maxSpeedIdx; i++) distToMax += data[i + 1].dist;
  const timeToMax = data[maxSpeedIdx].t - data[startIdx].t;

  const totalDist = data[data.length - 1].cumDist - data[0].cumDist;
  const duration = data[data.length - 1].t - data[0].t;

  // Sprints
  let sprints = 0, inSprint = false;
  let sprintDist = 0, sprintTime = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i].speed > T.sprintSpeed && !inSprint) { sprints++; inSprint = true; }
    if (data[i].speed < T.sprintHyst) inSprint = false;
    if (data[i].speed > T.sprintSpeed) {
      if (i > 0) sprintDist += data[i].dist;
      sprintTime += (i > 0 ? (data[i].t - data[i - 1].t) : 0);
    }
  }

  // Runs
  let runs = 0, inRun = false;
  for (let i = 0; i < data.length; i++) {
    if (data[i].speed > T.runSpeed && !inRun) { runs++; inRun = true; }
    if (data[i].speed < T.runHyst) inRun = false;
  }

  // Impacts
  let impacts = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i].linMag > T.impactThresh && data[i - 1].linMag < T.impactBase) impacts++;
  }

  // High speed distance
  let highSpeedDist = 0;
  for (let i = 1; i < data.length; i++) { if (data[i].speed > T.highSpeedThresh) highSpeedDist += data[i].dist; }

  // Work
  let work = 0;
  for (let i = 1; i < data.length; i++) work += mass * data[i].linMag * data[i].dist;

  // Player load
  let playerLoad = 0;
  for (let i = 1; i < data.length; i++) {
    const dx = data[i].linX - data[i - 1].linX;
    const dy = data[i].linY - data[i - 1].linY;
    const dz = data[i].linZ - data[i - 1].linZ;
    playerLoad += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Peak Force
  const peakForce = mass * maxAccel;
  const avgForce = mass * avgAccel;

  // Peak Power
  let peakPower = 0;
  for (let i = 0; i < data.length; i++) {
    const pw = mass * data[i].linMag * data[i].speed;
    if (pw > peakPower) peakPower = pw;
  }

  // Avg Power when moving
  let avgPower = 0;
  let movingCount = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i].speed > T.movingThresh) {
      avgPower += mass * data[i].linMag * data[i].speed;
      movingCount++;
    }
  }
  avgPower = movingCount > 0 ? avgPower / movingCount : 0;

  // Calorie estimate
  let totalCal = 0;
  for (let i = 1; i < data.length; i++) {
    const dt = data[i].t - data[i - 1].t;
    if (dt <= 0 || dt > 2) continue;
    const spd = data[i].speed;
    let met;
    if (spd < 0.28) met = 1.2;
    else if (spd < 1.39) met = 3.5;
    else if (spd < 2.22) met = 6.0;
    else if (spd < 3.33) met = 9.0;
    else if (spd < 4.44) met = 11.0;
    else if (spd < 5.56) met = 13.5;
    else met = 16.0;
    totalCal += met * 3.5 * mass / 12000 * dt;
  }

  // Metabolic Power
  const metabolicPower = duration > 0 ? (work / duration) / mass : 0;

  // Player Load per min
  const plPerMin = duration > 0 ? playerLoad / (duration / 60) : 0;

  // BMI
  const heightM = profile.height / 100;
  const bmi = mass / (heightM * heightM);

  // Max deceleration
  let maxDecel = 0;
  for (let i = 1; i < data.length; i++) {
    const dv = data[i].speed - data[i - 1].speed;
    const dt = data[i].t - data[i - 1].t;
    if (dt > 0) {
      const decel = -dv / dt;
      if (decel > maxDecel) maxDecel = decel;
    }
  }

  // Time moving vs stationary
  let timeMoving = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i].speed > T.movingThresh) timeMoving += (data[i].t - data[i - 1].t);
  }
  const timeStationary = duration - timeMoving;

  // Speed zones
  const zones = [0, 0, 0, 0, 0];
  for (let i = 1; i < data.length; i++) {
    const dt = data[i].t - data[i - 1].t;
    if (dt <= 0 || dt > 2) continue;
    const spd = data[i].speed;
    if (spd <= T.zone1) zones[0] += dt;
    else if (spd <= T.zone2) zones[1] += dt;
    else if (spd <= T.zone3) zones[2] += dt;
    else if (spd <= T.zone4) zones[3] += dt;
    else zones[4] += dt;
  }

  return {
    maxSpeed, maxSpeedMs, maxAccel, avgAccel,
    distToMax, timeToMax, totalDist, duration,
    sprints, sprintDist, sprintTime,
    runs, impacts, work, avgSpeed,
    highSpeedDist, playerLoad,
    peakForce, avgForce, peakPower, avgPower,
    totalCal, metabolicPower, plPerMin,
    bmi, maxDecel, timeMoving, timeStationary,
    zones,
  };
}

/**
 * Aggregate metrics from multiple splits (for combined splits).
 */
export function aggregateMetrics(metricsArr, profile) {
  const valid = metricsArr.filter(m => m);
  if (!valid.length) return null;
  const totalMovingTime = valid.reduce((s, m) => s + m.timeMoving, 0);
  const combined = {
    maxSpeed: Math.max(...valid.map(m => m.maxSpeed)),
    maxSpeedMs: Math.max(...valid.map(m => m.maxSpeedMs)),
    maxAccel: Math.max(...valid.map(m => m.maxAccel)),
    maxDecel: Math.max(...valid.map(m => m.maxDecel)),
    peakForce: Math.max(...valid.map(m => m.peakForce)),
    peakPower: Math.max(...valid.map(m => m.peakPower)),
    distToMax: Math.max(...valid.map(m => m.distToMax)),
    timeToMax: Math.max(...valid.map(m => m.timeToMax)),
    bmi: valid[0].bmi,
    totalDist: valid.reduce((s, m) => s + m.totalDist, 0),
    duration: valid.reduce((s, m) => s + m.duration, 0),
    sprints: valid.reduce((s, m) => s + m.sprints, 0),
    runs: valid.reduce((s, m) => s + m.runs, 0),
    impacts: valid.reduce((s, m) => s + m.impacts, 0),
    work: valid.reduce((s, m) => s + m.work, 0),
    totalCal: valid.reduce((s, m) => s + m.totalCal, 0),
    playerLoad: valid.reduce((s, m) => s + m.playerLoad, 0),
    sprintDist: valid.reduce((s, m) => s + m.sprintDist, 0),
    sprintTime: valid.reduce((s, m) => s + m.sprintTime, 0),
    highSpeedDist: valid.reduce((s, m) => s + m.highSpeedDist, 0),
    timeMoving: valid.reduce((s, m) => s + m.timeMoving, 0),
    timeStationary: valid.reduce((s, m) => s + m.timeStationary, 0),
    zones: [0, 1, 2, 3, 4].map(i => valid.reduce((s, m) => s + m.zones[i], 0)),
  };
  combined.avgSpeed = totalMovingTime > 0 ? valid.reduce((s, m) => s + m.avgSpeed * m.timeMoving, 0) / totalMovingTime : 0;
  combined.avgAccel = totalMovingTime > 0 ? valid.reduce((s, m) => s + m.avgAccel * m.timeMoving, 0) / totalMovingTime : 0;
  combined.avgForce = totalMovingTime > 0 ? valid.reduce((s, m) => s + m.avgForce * m.timeMoving, 0) / totalMovingTime : 0;
  combined.avgPower = totalMovingTime > 0 ? valid.reduce((s, m) => s + m.avgPower * m.timeMoving, 0) / totalMovingTime : 0;
  combined.plPerMin = combined.duration > 0 ? combined.playerLoad / (combined.duration / 60) : 0;
  combined.metabolicPower = combined.duration > 0 ? (combined.work / combined.duration) / profile.weight : 0;
  return combined;
}
