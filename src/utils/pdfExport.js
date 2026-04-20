import { jsPDF } from 'jspdf';
import { formatDuration } from './format';

/* ── colour palette (print-friendly) ─────────────────────────── */
const ACCENT   = [0, 229, 160];   // #00e5a0
const DARK     = [30, 30, 40];
const MID      = [100, 100, 120];
const LIGHT_BG = [245, 245, 248];
const WHITE    = [255, 255, 255];
const ZONE_COLORS = [
  [59, 130, 246],   // blue
  [34, 197, 94],    // green
  [234, 179, 8],    // yellow
  [249, 115, 22],   // orange
  [239, 68, 68],    // red
];

/* ── helpers ──────────────────────────────────────────────────── */
function setColor(doc, rgb) { doc.setTextColor(...rgb); }
function drawLine(doc, x1, y, x2) { doc.setDrawColor(...ACCENT); doc.setLineWidth(0.5); doc.line(x1, y, x2, y); }

const LOGO_SVG = `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" width="128" height="128">
  <polygon points="50,5 91,28 91,72 50,95 9,72 9,28" fill="none" stroke="url(#gs2)" stroke-width="3" stroke-linejoin="round"/>
  <rect x="26" y="58" width="8" height="14" rx="2" fill="#ff8c00" opacity="0.85"/>
  <rect x="38" y="48" width="8" height="24" rx="2" fill="#ffb800" opacity="0.9"/>
  <rect x="50" y="38" width="8" height="34" rx="2" fill="#00e5a0" opacity="0.9"/>
  <rect x="62" y="28" width="8" height="44" rx="2" fill="#00b8ff" opacity="0.95"/>
  <polygon points="66,22 62,28 70,28" fill="#00b8ff" opacity="0.9"/>
  <defs>
    <linearGradient id="gs2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff8c00"/>
      <stop offset="50%" stop-color="#00e5a0"/>
      <stop offset="100%" stop-color="#00b8ff"/>
    </linearGradient>
  </defs>
</svg>`;

function getLogoDataURL() {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const blob = new Blob([LOGO_SVG], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

async function header(doc, title, subtitle) {
  const pw = doc.internal.pageSize.getWidth();
  const logoMM = 10; // logo height in mm
  const logoY = 10;

  const logoPng = await getLogoDataURL();
  if (logoPng) {
    doc.addImage(logoPng, 'PNG', 14, logoY, logoMM, logoMM);
  }

  // "METRIC" in dark, "ARENA" in accent — inline with logo
  const textY = logoY + logoMM * 0.72;
  setColor(doc, DARK);
  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.text('METRIC', 14 + logoMM + 2.5, textY);
  const metricW = doc.getTextWidth('METRIC');
  setColor(doc, ACCENT);
  doc.text(' ARENA', 14 + logoMM + 2.5 + metricW, textY);

  drawLine(doc, 14, logoY + logoMM + 3, pw - 14);

  setColor(doc, DARK);
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text(title, 14, logoY + logoMM + 11);
  if (subtitle) {
    setColor(doc, MID);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(subtitle, 14, logoY + logoMM + 17);
  }
  return logoY + logoMM + (subtitle ? 23 : 17);
}

function sectionTitle(doc, y, label, pw) {
  y = checkPage(doc, y, 18);
  setColor(doc, DARK);
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text(label, 14, y);
  drawLine(doc, 14, y + 2, pw - 14);
  return y + 8;
}

function checkPage(doc, y, needed) {
  const ph = doc.internal.pageSize.getHeight();
  if (y + needed > ph - 14) {
    doc.addPage();
    return 18;
  }
  return y;
}

function footer(doc) {
  const pages = doc.getNumberOfPages();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    setColor(doc, MID);
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.text(`MetricAthlete · Metric Arena`, 14, ph - 6);
    doc.text(`Page ${i} of ${pages}`, pw - 14, ph - 6, { align: 'right' });
  }
}

/* ── metric grid renderer ────────────────────────────────────── */
function renderMetricCards(doc, y, cards, pw) {
  const cols = 4;
  const gap = 3;
  const cardW = (pw - 28 - gap * (cols - 1)) / cols;
  const cardH = 16;

  for (let i = 0; i < cards.length; i++) {
    const col = i % cols;
    if (col === 0 && i > 0) y += cardH + gap;
    y = checkPage(doc, y, cardH + gap);

    const x = 14 + col * (cardW + gap);
    const yTop = y;

    // card background
    doc.setFillColor(cards[i].sec ? 240 : 248, cards[i].sec ? 240 : 248, cards[i].sec ? 245 : 252);
    doc.roundedRect(x, yTop, cardW, cardH, 2, 2, 'F');

    // label
    setColor(doc, MID);
    doc.setFontSize(6.5);
    doc.setFont(undefined, 'normal');
    doc.text(cards[i].label, x + 3, yTop + 5.5);

    // value + unit
    setColor(doc, DARK);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    const valText = cards[i].value + (cards[i].unit ? ' ' : '');
    doc.text(valText, x + 3, yTop + 12.5);
    if (cards[i].unit) {
      const valW = doc.getTextWidth(valText);
      setColor(doc, MID);
      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.text(cards[i].unit, x + 3 + valW, yTop + 12.5);
    }
  }

  return y + cardH + gap + 6;
}

/* ── speed zone bar ──────────────────────────────────────────── */
function renderSpeedZones(doc, y, metrics, thresholds, pw) {
  if (!metrics?.zones) return y;
  y = checkPage(doc, y, 24);

  const zones = metrics.zones;
  const total = zones.reduce((a, b) => a + b, 0) || 1;
  const T = thresholds;
  const names = [
    `Z1: 0–${T.zone1}`, `Z2: ${T.zone1}–${T.zone2}`, `Z3: ${T.zone2}–${T.zone3}`,
    `Z4: ${T.zone3}–${T.zone4}`, `Z5: >${T.zone4}`,
  ];

  const barX = 14, barW = pw - 28, barH = 8;
  let cx = barX;
  zones.forEach((z, i) => {
    const w = (z / total) * barW;
    if (w > 0) {
      doc.setFillColor(...ZONE_COLORS[i]);
      doc.roundedRect(cx, y, Math.max(w, 0.5), barH, i === 0 ? 2 : 0, i === 4 ? 2 : 0, 'F');
      if (w > 12) {
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(6);
        doc.setFont(undefined, 'bold');
        doc.text(`${((z / total) * 100).toFixed(0)}%`, cx + w / 2, y + 5.5, { align: 'center' });
      }
    }
    cx += w;
  });

  y += barH + 4;
  setColor(doc, MID);
  doc.setFontSize(6.5);
  doc.setFont(undefined, 'normal');
  const legendParts = zones.map((z, i) => {
    const pct = ((z / total) * 100).toFixed(1);
    return `${names[i]} m/s — ${formatDuration(z)} (${pct}%)`;
  });
  doc.text(legendParts.join('   |   '), 14, y);
  return y + 6;
}

/* ── table renderer ──────────────────────────────────────────── */
function renderTable(doc, y, headers, rows, pw, colWidths) {
  const tableW = pw - 28;
  if (!colWidths) {
    const w = tableW / headers.length;
    colWidths = headers.map(() => w);
  }
  const rowH = 7;

  // header row
  y = checkPage(doc, y, rowH * 2);
  doc.setFillColor(...DARK);
  doc.rect(14, y, tableW, rowH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(6.5);
  doc.setFont(undefined, 'bold');
  let cx = 14;
  headers.forEach((h, i) => {
    doc.text(h, cx + 2, y + 5);
    cx += colWidths[i];
  });
  y += rowH;

  // data rows
  rows.forEach((row, ri) => {
    y = checkPage(doc, y, rowH);
    if (ri % 2 === 0) {
      doc.setFillColor(...LIGHT_BG);
      doc.rect(14, y, tableW, rowH, 'F');
    }
    setColor(doc, DARK);
    doc.setFontSize(6.5);
    doc.setFont(undefined, 'normal');
    cx = 14;
    row.forEach((cell, i) => {
      const txt = String(cell ?? '—');
      doc.text(txt, cx + 2, y + 5);
      cx += colWidths[i];
    });
    y += rowH;
  });

  return y + 2;
}

/* ═══════════════════════════════════════════════════════════════
   1. INDIVIDUAL SESSION PDF
   ═══════════════════════════════════════════════════════════════ */
export async function exportSessionPDF(processedData, profile, metrics, thresholds, splits) {
  if (!processedData || !metrics) return;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const T = thresholds;

  const d0 = processedData[0];
  const dateStr = d0.ts.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = d0.ts.toLocaleTimeString('en-ZA');
  const subtitle = `${dateStr} · ${timeStr} · ${formatDuration(metrics.duration)} · ${profile.weight}kg · ${profile.sport || 'general'}`;

  let y = await header(doc, 'Session Report', subtitle);

  // Metrics
  y = sectionTitle(doc, y, 'Performance Metrics', pw);
  const m = metrics;
  const cards = [
    { label: 'Max Speed', value: m.maxSpeedMs.toFixed(2), unit: 'm/s' },
    { label: 'Avg Speed (moving)', value: m.avgSpeed.toFixed(2), unit: 'm/s' },
    { label: 'Max Acceleration', value: m.maxAccel.toFixed(1), unit: 'm/s²' },
    { label: 'Max Deceleration', value: m.maxDecel.toFixed(1), unit: 'm/s²' },
    { label: 'Avg Acceleration', value: m.avgAccel.toFixed(2), unit: 'm/s²' },
    { label: 'Dist to Max Speed', value: m.distToMax.toFixed(1), unit: 'm' },
    { label: 'Time to Max Speed', value: m.timeToMax.toFixed(1), unit: 's' },
    { label: 'Total Distance', value: m.totalDist.toFixed(0), unit: 'm' },
    { label: 'High Speed Distance', value: m.highSpeedDist.toFixed(0), unit: 'm' },
    { label: 'Sprint Distance', value: m.sprintDist.toFixed(0), unit: 'm' },
    { label: 'Duration', value: formatDuration(m.duration), unit: '' },
    { label: 'Time Moving', value: formatDuration(m.timeMoving), unit: '' },
    { label: 'Time Stationary', value: formatDuration(m.timeStationary), unit: '' },
    { label: `Sprints (>${T.sprintSpeed} m/s)`, value: String(m.sprints), unit: '' },
    { label: `Runs (>${T.runSpeed} m/s)`, value: String(m.runs), unit: '' },
    { label: `Impacts (>${T.impactThresh} m/s²)`, value: String(m.impacts), unit: '' },
    { label: 'Peak Force', value: m.peakForce.toFixed(0), unit: 'N', sec: true },
    { label: 'Avg Force (moving)', value: m.avgForce.toFixed(0), unit: 'N', sec: true },
    { label: 'Peak Power', value: m.peakPower.toFixed(0), unit: 'W', sec: true },
    { label: 'Avg Power (moving)', value: m.avgPower.toFixed(0), unit: 'W', sec: true },
    { label: 'Est. Calories', value: m.totalCal.toFixed(0), unit: 'kcal', sec: true },
    { label: 'Est. Work', value: (m.work / 1000).toFixed(1), unit: 'kJ', sec: true },
    { label: 'Metabolic Power', value: m.metabolicPower.toFixed(1), unit: 'W/kg', sec: true },
    { label: 'Player Load', value: m.playerLoad.toFixed(0), unit: 'au', sec: true },
    { label: 'Player Load / min', value: m.plPerMin.toFixed(1), unit: 'au/min', sec: true },
    { label: 'BMI', value: m.bmi.toFixed(1), unit: '', sec: true },
  ];
  y = renderMetricCards(doc, y, cards, pw);

  // Speed zones
  y = sectionTitle(doc, y, 'Speed Zone Distribution', pw);
  y = renderSpeedZones(doc, y, metrics, thresholds, pw);

  // Splits
  if (splits && splits.length > 0) {
    y = sectionTitle(doc, y, 'Splits', pw);
    const splitHeaders = ['Name', 'Type', 'Duration', 'Distance', 'Max Spd', 'Avg Spd', 'Sprints', 'Impacts', 'PL', 'Calories'];
    const splitRows = splits.filter(s => s.metrics).map(s => {
      const sm = s.metrics;
      return [
        s.name,
        s.isCombined ? 'Combined' : 'Split',
        formatDuration(sm.duration),
        sm.totalDist.toFixed(0) + ' m',
        sm.maxSpeedMs.toFixed(2) + ' m/s',
        sm.avgSpeed.toFixed(2) + ' m/s',
        String(sm.sprints),
        String(sm.impacts),
        sm.playerLoad.toFixed(0) + ' au',
        sm.totalCal.toFixed(0) + ' kcal',
      ];
    });
    const cw = (pw - 28) / 10;
    renderTable(doc, y, splitHeaders, splitRows, pw, [cw * 1.4, cw * 0.9, cw, cw, cw, cw, cw * 0.7, cw * 0.7, cw * 0.7, cw * 0.9]);
  }

  footer(doc);
  const fname = 'session_' + d0.ts.toISOString().slice(0, 10) + '.pdf';
  doc.save(fname);
}

/* ═══════════════════════════════════════════════════════════════
   2. TEAM SESSION PDF (full team overview + all players table)
   ═══════════════════════════════════════════════════════════════ */
export async function exportTeamSessionPDF(teamSessionName, sessionDate, aggregate, playerSessions, getSummaryMetricsFn) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pw = doc.internal.pageSize.getWidth();

  const dateStr = sessionDate
    ? new Date(sessionDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  let y = await header(doc, teamSessionName || 'Team Session Report', dateStr ? `${dateStr} · ${aggregate?.playerCount || 0} players` : '');

  // Team aggregate
  if (aggregate) {
    y = sectionTitle(doc, y, 'Team Overview', pw);
    const aCards = [];
    const push = (label, val, unit) => { if (val != null) aCards.push({ label, value: val, unit }); };
    push('Players', String(aggregate.playerCount), '');
    push('Total Distance', (aggregate.totalDist / 1000).toFixed(2), 'km');
    push('Avg Speed', aggregate.avgSpeed.toFixed(2), 'm/s');
    push('Max Speed', aggregate.maxSpeedMs.toFixed(2), 'm/s');
    push('Avg Max Accel', aggregate.avgMaxAccel?.toFixed(1), 'm/s²');
    push('Avg Max Decel', aggregate.avgMaxDecel?.toFixed(1), 'm/s²');
    push('Total Hi-Spd Dist', aggregate.totalHighSpeedDist?.toFixed(0), 'm');
    push('Total Sprint Dist', aggregate.totalSprintDist?.toFixed(0), 'm');
    push('Avg Duration', aggregate.avgDuration != null ? formatDuration(aggregate.avgDuration) : null, '');
    push('Total Sprints', String(aggregate.totalSprints), '');
    push('Total Impacts', String(aggregate.totalImpacts), '');
    push('Avg Player Load', aggregate.avgPlayerLoad?.toFixed(0), 'au');
    push('Avg Peak Power', aggregate.avgPeakPower?.toFixed(0), 'W');
    push('Avg Power', aggregate.avgAvgPower?.toFixed(0), 'W');
    push('Total Calories', aggregate.totalCal?.toFixed(0), 'kcal');
    push('Total Work', aggregate.totalWork != null ? (aggregate.totalWork / 1000).toFixed(1) : null, 'kJ');
    push('Avg Metabolic Pwr', aggregate.avgMetabolicPower?.toFixed(1), 'W/kg');
    y = renderMetricCards(doc, y, aCards.filter(c => c.value != null), pw);
  }

  // Player comparison table
  if (playerSessions.length > 0) {
    y = sectionTitle(doc, y, 'Player Comparison', pw);
    const headers = ['Player', 'Max Speed', 'Avg Speed', 'Distance', 'Duration', 'Sprints', 'Impacts', 'Player Load', 'Peak Power', 'Calories', 'Source'];
    const rows = playerSessions.map(s => {
      const summary = getSummaryMetricsFn(s);
      const m = summary?.metrics;
      return [
        s.playerProfile?.display_name || 'Unknown',
        m?.maxSpeedMs != null ? m.maxSpeedMs.toFixed(2) + ' m/s' : '—',
        m?.avgSpeed != null ? m.avgSpeed.toFixed(2) + ' m/s' : '—',
        m?.totalDist != null ? (m.totalDist / 1000).toFixed(2) + ' km' : '—',
        m?.duration != null ? formatDuration(m.duration) : '—',
        m?.sprints != null ? String(m.sprints) : '—',
        m?.impacts != null ? String(m.impacts) : '—',
        m?.playerLoad != null ? m.playerLoad.toFixed(0) + ' au' : '—',
        m?.peakPower != null ? m.peakPower.toFixed(0) + ' W' : '—',
        m?.totalCal != null ? m.totalCal.toFixed(0) + ' kcal' : '—',
        summary?.source || '—',
      ];
    });
    const baseW = (pw - 28) / 11;
    const colWidths = [baseW * 1.6, baseW, baseW, baseW, baseW, baseW * 0.7, baseW * 0.7, baseW * 0.9, baseW * 0.9, baseW * 0.9, baseW * 1.1];
    renderTable(doc, y, headers, rows, pw, colWidths);
  }

  footer(doc);
  const fname = 'team_session_' + (sessionDate || 'report') + '.pdf';
  doc.save(fname);
}

/* ═══════════════════════════════════════════════════════════════
   3. TEAM SESSION + INDIVIDUAL PLAYER PDF
   ═══════════════════════════════════════════════════════════════ */
export async function exportPlayerTeamSessionPDF(teamSessionName, sessionDate, aggregate, playerSession, getSummaryMetricsFn) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();

  const playerName = playerSession.playerProfile?.display_name || 'Unknown';
  const dateStr = sessionDate
    ? new Date(sessionDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  let y = await header(doc, `${playerName} — ${teamSessionName || 'Team Session'}`, dateStr);

  // Compact team overview
  if (aggregate) {
    y = sectionTitle(doc, y, 'Team Overview', pw);
    const aCards = [];
    const push = (label, val, unit) => { if (val != null) aCards.push({ label, value: val, unit }); };
    push('Players', String(aggregate.playerCount), '');
    push('Total Distance', (aggregate.totalDist / 1000).toFixed(2), 'km');
    push('Avg Speed', aggregate.avgSpeed.toFixed(2), 'm/s');
    push('Max Speed', aggregate.maxSpeedMs.toFixed(2), 'm/s');
    push('Total Sprints', String(aggregate.totalSprints), '');
    push('Total Impacts', String(aggregate.totalImpacts), '');
    push('Avg Player Load', aggregate.avgPlayerLoad?.toFixed(0), 'au');
    push('Total Calories', aggregate.totalCal?.toFixed(0), 'kcal');
    y = renderMetricCards(doc, y, aCards.filter(c => c.value != null), pw);
  }

  // Player detail metrics
  const summary = getSummaryMetricsFn(playerSession);
  const m = summary?.metrics;
  if (m) {
    y = sectionTitle(doc, y, `${playerName} — Detailed Metrics (${summary.source})`, pw);
    const cards = [
      { label: 'Max Speed', value: (m.maxSpeedMs ?? m.maxSpeed).toFixed(2), unit: 'm/s' },
      { label: 'Avg Speed', value: m.avgSpeed.toFixed(2), unit: 'm/s' },
      { label: 'Max Acceleration', value: m.maxAccel?.toFixed(1), unit: 'm/s²' },
      { label: 'Avg Acceleration', value: m.avgAccel?.toFixed(2), unit: 'm/s²' },
      { label: 'Max Deceleration', value: m.maxDecel?.toFixed(1), unit: 'm/s²' },
      { label: 'Distance', value: m.totalDist?.toFixed(0), unit: 'm' },
      { label: 'High Speed Dist', value: m.highSpeedDist?.toFixed(0), unit: 'm' },
      { label: 'Sprint Distance', value: m.sprintDist?.toFixed(0), unit: 'm' },
      { label: 'Duration', value: formatDuration(m.duration), unit: '' },
      { label: 'Time Moving', value: formatDuration(m.timeMoving), unit: '' },
      { label: 'Sprints', value: String(m.sprints), unit: '' },
      { label: 'Runs', value: String(m.runs), unit: '' },
      { label: 'Impacts', value: String(m.impacts), unit: '' },
      { label: 'Peak Force', value: m.peakForce?.toFixed(0), unit: 'N', sec: true },
      { label: 'Avg Force', value: m.avgForce?.toFixed(0), unit: 'N', sec: true },
      { label: 'Peak Power', value: m.peakPower?.toFixed(0), unit: 'W', sec: true },
      { label: 'Avg Power', value: m.avgPower?.toFixed(0), unit: 'W', sec: true },
      { label: 'Calories', value: m.totalCal?.toFixed(0), unit: 'kcal', sec: true },
      { label: 'Work', value: (m.work / 1000).toFixed(1), unit: 'kJ', sec: true },
      { label: 'Player Load', value: m.playerLoad?.toFixed(0), unit: 'au', sec: true },
      { label: 'PL / min', value: m.plPerMin?.toFixed(1), unit: 'au/min', sec: true },
      { label: 'Metabolic Power', value: m.metabolicPower?.toFixed(1), unit: 'W/kg', sec: true },
    ];
    renderMetricCards(doc, y, cards, pw);
  }

  footer(doc);
  const safeName = playerName.replace(/[^a-zA-Z0-9]/g, '_');
  const fname = `player_${safeName}_${sessionDate || 'report'}.pdf`;
  doc.save(fname);
}
