import { computeMetrics } from './metrics';

const METRIC_UNITS = {
  maxSpeed: 'km/h', maxSpeedMs: 'm/s', avgSpeed: 'km/h',
  maxAccel: 'm/s²', avgAccel: 'm/s²', maxDecel: 'm/s²',
  totalDist: 'm', distToMax: 'm', sprintDist: 'm', highSpeedDist: 'm',
  duration: 's', timeToMax: 's', sprintTime: 's', timeMoving: 's', timeStationary: 's',
  sprints: '', runs: '', impacts: '',
  peakForce: 'N', avgForce: 'N',
  peakPower: 'W', avgPower: 'W',
  work: 'J', totalCal: 'kcal',
  metabolicPower: 'W/kg', playerLoad: '', plPerMin: '/min',
  bmi: 'kg/m²',
  zone1: 's', zone2: 's', zone3: 's', zone4: 's', zone5: 's'
};

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportMetricsJSON(processedData, profile, thresholds, splits) {
  const m = computeMetrics(processedData, profile, thresholds);
  const data = {
    units: {
      profile: { weight: 'kg', height: 'cm', age: 'yr', maxHR: 'bpm', vo2max: 'mL/kg/min' },
      thresholds: {
        sprintSpeed: 'km/h', sprintHyst: 'km/h', runSpeed: 'km/h', runHyst: 'km/h',
        highSpeedThresh: 'km/h', impactThresh: 'm/s²', impactBase: 'm/s²',
        movingThresh: 'km/h', zone1: 'km/h', zone2: 'km/h', zone3: 'km/h', zone4: 'km/h'
      },
      metrics: METRIC_UNITS
    },
    profile,
    thresholds,
    session: { date: processedData[0].ts.toISOString(), duration: m.duration, metrics: m },
    splits: splits.map(s => ({
      name: s.name,
      type: s.isCombined ? 'combined' : 'split',
      timeRange: [s.tStart, s.tEnd],
      sourceSplits: s.isCombined ? s.sourceSplits : null,
      metrics: s.metrics
    }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'session_' + processedData[0].ts.toISOString().slice(0, 10) + '.json');
}

export function exportMetricsCSV(processedData, profile, thresholds, splits) {
  const sessionMetrics = computeMetrics(processedData, profile, thresholds);
  const dateStr = processedData[0].ts.toISOString().slice(0, 10);

  const q = v => String(v).indexOf(',') >= 0 ? '"' + v + '"' : String(v);
  const h = name => METRIC_UNITS[name] ? name + ' (' + METRIC_UNITS[name] + ')' : name;

  const meta = [
    '# MetricArena Session Export',
    '# date,' + processedData[0].ts.toISOString(),
    '#',
    '# Profile',
    '# weight (kg),' + profile.weight,
    '# height (cm),' + profile.height,
    '# age (yr),' + profile.age,
    '# maxHR (bpm),' + profile.maxHR,
    '# sex,' + profile.sex,
    '# sport,' + profile.sport,
    '# vo2max (mL/kg/min),' + profile.vo2max,
    '#',
    '# Thresholds',
    ...Object.entries(thresholds).map(([k, v]) => `# ${k},${v}`),
    '#'
  ];

  const headers = [
    'name', 'type', 'date', 'tStart (s)', 'tEnd (s)',
    h('duration'), h('totalDist'), h('avgSpeed'), h('maxSpeed'),
    h('avgAccel'), h('maxAccel'), h('maxDecel'),
    h('sprints'), h('sprintDist'), h('sprintTime'), h('runs'), h('impacts'),
    h('highSpeedDist'), h('distToMax'), h('timeToMax'),
    h('peakForce'), h('avgForce'), h('peakPower'), h('avgPower'),
    h('work'), h('totalCal'), h('metabolicPower'), h('playerLoad'), h('plPerMin'),
    h('timeMoving'), h('timeStationary'),
    h('zone1'), h('zone2'), h('zone3'), h('zone4'), h('zone5'),
    h('bmi'), 'sourceSplits'
  ];

  function metricsToRow(name, type, date, tStart, tEnd, m, sourceSplitNames) {
    if (!m) return null;
    return [
      q(name), type, date,
      tStart != null ? tStart.toFixed(3) : '',
      tEnd != null ? tEnd.toFixed(3) : '',
      m.duration.toFixed(2), m.totalDist.toFixed(1), m.avgSpeed.toFixed(2), m.maxSpeed.toFixed(2),
      m.avgAccel.toFixed(4), m.maxAccel.toFixed(4), m.maxDecel.toFixed(4),
      m.sprints, m.sprintDist.toFixed(1), m.sprintTime.toFixed(2), m.runs, m.impacts,
      m.highSpeedDist.toFixed(1), m.distToMax.toFixed(1), m.timeToMax.toFixed(2),
      m.peakForce.toFixed(1), m.avgForce.toFixed(1), m.peakPower.toFixed(1), m.avgPower.toFixed(1),
      m.work.toFixed(1), m.totalCal.toFixed(2), m.metabolicPower.toFixed(4), m.playerLoad.toFixed(4), m.plPerMin.toFixed(4),
      m.timeMoving.toFixed(2), m.timeStationary.toFixed(2),
      m.zones[0].toFixed(2), m.zones[1].toFixed(2), m.zones[2].toFixed(2), m.zones[3].toFixed(2), m.zones[4].toFixed(2),
      m.bmi.toFixed(2),
      sourceSplitNames ? q(sourceSplitNames.join('; ')) : ''
    ];
  }

  const rows = [headers];
  const d0 = processedData[0], dN = processedData[processedData.length - 1];
  const sessionRow = metricsToRow('Session', 'session', d0.ts.toISOString(), d0.t, dN.t, sessionMetrics, null);
  if (sessionRow) rows.push(sessionRow);
  splits.forEach(s => {
    const sources = s.isCombined ? s.sourceSplits : null;
    const row = metricsToRow(s.name, s.isCombined ? 'combined' : 'split', '', s.tStart, s.tEnd, s.metrics, sources);
    if (row) rows.push(row);
  });

  const csv = meta.join('\n') + '\n' + rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  downloadBlob(blob, 'metrics_' + dateStr + '.csv');
}

export function exportGPX(processedData) {
  if (!processedData || processedData.length === 0) return;

  const hasGPS = processedData.some(p => isFinite(p.lat) && isFinite(p.lon) && !(p.lat === 0 && p.lon === 0));
  const startTime = processedData[0].ts.toISOString();
  const name = 'MetricArena ' + startTime.slice(0, 10);

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx creator="MetricArena" version="1.1"',
    '  xmlns="http://www.topografix.com/GPX/1/1"',
    '  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"',
    '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    `  <metadata><name>${name}</name><time>${startTime}</time></metadata>`,
    '  <trk>',
    `    <name>${name}</name>`,
    '    <type>9</type>',
    '    <trkseg>',
  ];

  processedData.forEach(p => {
    const lat = (isFinite(p.lat) ? p.lat : 0).toFixed(7);
    const lon = (isFinite(p.lon) ? p.lon : 0).toFixed(7);
    const speedMs = (isFinite(p.speed) ? p.speed / 3.6 : 0).toFixed(4);
    lines.push(`      <trkpt lat="${lat}" lon="${lon}">`);
    lines.push(`        <time>${p.ts.toISOString()}</time>`);
    if (hasGPS) {
      lines.push(`        <extensions><gpxtpx:TrackPointExtension><gpxtpx:speed>${speedMs}</gpxtpx:speed></gpxtpx:TrackPointExtension></extensions>`);
    }
    lines.push('      </trkpt>');
  });

  lines.push('    </trkseg>', '  </trk>', '</gpx>');

  const blob = new Blob([lines.join('\n')], { type: 'application/gpx+xml' });
  downloadBlob(blob, 'session_' + startTime.slice(0, 10) + '.gpx');

  if (!hasGPS) alert('No GPS data found. GPX exported with zero coordinates — Strava will record it as a manual activity without a map.');
}
