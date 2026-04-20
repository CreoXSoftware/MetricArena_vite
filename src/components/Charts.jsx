import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { formatDuration } from '../utils/format';

function formatClock(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

// ========== Shared helpers ==========
function setupCanvas(canvas, container) {
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(rect.width, 100);
  const h = Math.max(rect.height, 100);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, W: w, H: h };
}

function findClosestInView(data, chartView, t) {
  const inView = data.filter(d => d.t >= chartView.tStart && d.t <= chartView.tEnd);
  if (!inView.length) return null;
  let best = inView[0], bestDist = Math.abs(inView[0].t - t);
  for (let i = 1; i < inView.length; i++) {
    const d = Math.abs(inView[i].t - t);
    if (d < bestDist) { bestDist = d; best = inView[i]; }
  }
  return best;
}

function drawHoverTooltip(ctx, lines, colors, bx, by) {
  ctx.font = '11px JetBrains Mono, monospace';
  let maxW = 0;
  for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width);
  const pad = 8, lineH = 16, bW = maxW + pad * 2, bH = lines.length * lineH + pad;
  ctx.fillStyle = 'rgba(10,10,22,0.88)';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(bx, by, bW, bH);
  ctx.fill(); ctx.stroke();
  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = colors[i];
    ctx.fillText(lines[i], bx + pad, by + pad + (i + 0.75) * lineH);
  }
}

// ========== SPEED CHART ==========
export function SpeedChart({ data, chartView, thresholds, onZoom }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const infoRef = useRef(null);
  const imageRef = useRef(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data) return;

    const { ctx, W, H } = setupCanvas(canvas, container);
    const pad = { top: 20, right: 20, bottom: 40, left: 50 };
    const cW = W - pad.left - pad.right, cH = H - pad.top - pad.bottom;
    const tStart = chartView.tStart, tEnd = chartView.tEnd;
    const tRange = tEnd - tStart;

    const visible = data.filter(d => d.t >= tStart && d.t <= tEnd);
    if (!visible.length) return;
    const maxS = Math.max(...visible.map(d => d.speed)) * 1.1 || 1;

    infoRef.current = { pad, cW, cH, tStart, tEnd, W, H, maxS };

    const tToX = t => pad.left + ((t - tStart) / tRange) * cW;

    // Grid
    ctx.strokeStyle = '#1a1a26'; ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + (cH / 5) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    }

    // Zone backgrounds
    const T = thresholds;
    const zoneBounds = [0, T.zone1, T.zone2, T.zone3, T.zone4, maxS * 1.2];
    const zoneColors = ['rgba(59,130,246,0.06)', 'rgba(34,197,94,0.06)', 'rgba(234,179,8,0.06)', 'rgba(249,115,22,0.06)', 'rgba(239,68,68,0.06)'];
    for (let z = 0; z < 5; z++) {
      let yTop = pad.top + cH - (Math.min(zoneBounds[z + 1], maxS) / maxS) * cH;
      let yBot = pad.top + cH - (zoneBounds[z] / maxS) * cH;
      if (yTop < pad.top) yTop = pad.top;
      if (yBot > pad.top + cH) yBot = pad.top + cH;
      ctx.fillStyle = zoneColors[z];
      ctx.fillRect(pad.left, yTop, cW, yBot - yTop);
    }

    // Clip
    ctx.save(); ctx.beginPath(); ctx.rect(pad.left, pad.top, cW, cH); ctx.clip();

    // Fill
    ctx.beginPath(); ctx.moveTo(tToX(visible[0].t), pad.top + cH);
    for (const pt of visible) ctx.lineTo(tToX(pt.t), pad.top + cH - (pt.speed / maxS) * cH);
    ctx.lineTo(tToX(visible[visible.length - 1].t), pad.top + cH); ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
    grad.addColorStop(0, 'rgba(0,184,255,0.3)'); grad.addColorStop(1, 'rgba(0,184,255,0.02)');
    ctx.fillStyle = grad; ctx.fill();

    // Line
    ctx.beginPath(); ctx.strokeStyle = '#00b8ff'; ctx.lineWidth = 2;
    visible.forEach((pt, i) => {
      const x = tToX(pt.t), y = pad.top + cH - (pt.speed / maxS) * cH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Sprint highlight
    ctx.fillStyle = 'rgba(255,107,107,0.1)';
    let inSp = false, spStartX = 0;
    for (const pt of visible) {
      if (pt.speed > T.sprintSpeed && !inSp) { inSp = true; spStartX = tToX(pt.t); }
      if ((pt.speed < T.sprintHyst) && inSp) {
        ctx.fillRect(spStartX, pad.top, tToX(pt.t) - spStartX, cH);
        inSp = false;
      }
    }
    if (inSp) ctx.fillRect(spStartX, pad.top, tToX(visible[visible.length - 1].t) - spStartX, cH);
    ctx.restore();

    // Y-axis (m/s)
    ctx.fillStyle = '#8888a0'; ctx.font = '11px JetBrains Mono, monospace'; ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) ctx.fillText((maxS / 5 * (5 - i)).toFixed(1), pad.left - 8, pad.top + (cH / 5) * i + 4);
    // X-axis
    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const t = tStart + (tRange / 4) * i;
      ctx.fillText(formatDuration(t), tToX(t), H - 10);
    }
    ctx.font = '11px DM Sans, sans-serif'; ctx.fillStyle = '#555570'; ctx.textAlign = 'right';
    ctx.fillText('scroll to zoom  •  dbl-click to reset', W - pad.right, 14);

    imageRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, [data, chartView, thresholds]);

  useEffect(() => { render(); }, [render]);

  useEffect(() => {
    const handleResize = () => { clearTimeout(handleResize._t); handleResize._t = setTimeout(render, 150); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [render]);

  // Zoom handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onZoom) return;
    const handleWheel = (e) => {
      e.preventDefault();
      const si = infoRef.current;
      if (!si) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = si.tStart + ((x - si.pad.left) / si.cW) * (si.tEnd - si.tStart);
      onZoom(Math.max(si.tStart, Math.min(si.tEnd, t)), e.deltaY);
    };
    const handleDblClick = () => onZoom(null, 0); // signal reset
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('dblclick', handleDblClick);
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('dblclick', handleDblClick);
    };
  }, [onZoom]);

  // Hover
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleMove = (e) => {
      if (!imageRef.current || !infoRef.current) return;
      const si = infoRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ctx = canvas.getContext('2d');
      ctx.putImageData(imageRef.current, 0, 0);
      if (x < si.pad.left || x > si.pad.left + si.cW) return;
      const t = si.tStart + ((x - si.pad.left) / si.cW) * (si.tEnd - si.tStart);
      const pt = findClosestInView(data, { tStart: si.tStart, tEnd: si.tEnd }, t);
      if (!pt) return;
      const px = si.pad.left + ((pt.t - si.tStart) / (si.tEnd - si.tStart)) * si.cW;
      const py = si.pad.top + si.cH - (pt.speed / si.maxS) * si.cH;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(px, si.pad.top); ctx.lineTo(px, si.pad.top + si.cH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fillStyle = '#00b8ff'; ctx.fill();
      const lines = [pt.speed.toFixed(2) + ' m/s', formatDuration(pt.t)];
      const colors = ['#00b8ff', '#8888a0'];
      let bx = px + 10, by = py - 10;
      ctx.font = '11px JetBrains Mono, monospace';
      const bW = Math.max(ctx.measureText(lines[0]).width, ctx.measureText(lines[1]).width) + 16;
      if (bx + bW > si.W - si.pad.right) bx = px - bW - 10;
      if (by < si.pad.top) by = si.pad.top + 4;
      ctx.textAlign = 'left';
      drawHoverTooltip(ctx, lines, colors, bx, by);
      ctx.restore();
    };
    const handleLeave = () => {
      if (imageRef.current) canvas.getContext('2d').putImageData(imageRef.current, 0, 0);
    };
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseleave', handleLeave);
    return () => {
      canvas.removeEventListener('mousemove', handleMove);
      canvas.removeEventListener('mouseleave', handleLeave);
    };
  }, [data]);

  return (
    <div className="section">
      <div className="section-title"><span className="dot" style={{ background: 'var(--accent2)' }}></span> Speed Profile</div>
      <div className="speed-chart-container" ref={containerRef}>
        <canvas ref={canvasRef}></canvas>
      </div>
    </div>
  );
}

// ========== SPLIT OVERLAY HELPERS ==========
const SPLIT_COLORS = ['#00e5a0', '#00b8ff', '#f59e0b', '#f43f5e', '#a78bfa'];
const EDGE_HIT_PX = 10;

/** Returns the list of base-split objects whose ranges should be highlighted for a given selected split. */
function getEdgeSplits(allSplits, selectedSplitId) {
  const sel = allSplits.find(s => s.id === selectedSplitId);
  if (!sel) return [];
  if (sel.isCombined) return allSplits.filter(s => (sel.sourceIds || []).includes(s.id));
  return [sel];
}

/** Draw the range highlight + edge handles for the currently selected split (or its children). */
function drawSplitOverlays(ctx, ai, allSplits, selectedSplitId, previewEdge) {
  const edgeSplits = getEdgeSplits(allSplits, selectedSplitId);
  if (!edgeSplits.length) return;

  const tToX = t => ai.pad.left + ((t - ai.tStart) / (ai.tEnd - ai.tStart)) * ai.cW;

  ctx.save();
  ctx.beginPath(); ctx.rect(ai.pad.left, ai.pad.top, ai.cW, ai.cH); ctx.clip();

  edgeSplits.forEach((s, i) => {
    const color = SPLIT_COLORS[i % SPLIT_COLORS.length];
    const ts = previewEdge?.splitId === s.id && previewEdge.edge === 'start' ? previewEdge.time : s.tStart;
    const te = previewEdge?.splitId === s.id && previewEdge.edge === 'end' ? previewEdge.time : s.tEnd;
    const x1 = tToX(ts);
    const x2 = tToX(te);

    // Range fill
    ctx.fillStyle = color + '28';
    ctx.fillRect(Math.max(x1, ai.pad.left), ai.pad.top,
      Math.min(x2, ai.pad.left + ai.cW) - Math.max(x1, ai.pad.left), ai.cH);

    // Edge lines + handle circles (only if visible in current view)
    [[x1, ts], [x2, te]].forEach(([px]) => {
      if (px < ai.pad.left - 1 || px > ai.pad.left + ai.cW + 1) return;
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(px, ai.pad.top); ctx.lineTo(px, ai.pad.top + ai.cH); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(px, ai.pad.top + 10, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(px, ai.pad.top + ai.cH - 10, 5, 0, Math.PI * 2); ctx.fill();
    });

    // Label (only when showing multiple children)
    if (edgeSplits.length > 1) {
      const lx = Math.max(ai.pad.left + 4, Math.min(ai.pad.left + ai.cW - 4, (Math.max(x1, ai.pad.left) + Math.min(x2, ai.pad.left + ai.cW)) / 2));
      ctx.fillStyle = color;
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(s.name, lx, ai.pad.top + 26);
    }
  });

  ctx.restore();
}

/** Return the split edge (if any) within EDGE_HIT_PX of the cursor. */
function findHoveredEdge(clientX, canvasRect, ai, allSplits, selectedSplitId) {
  if (!ai || !selectedSplitId) return null;
  const x = clientX - canvasRect.left;
  const tToX = t => ai.pad.left + ((t - ai.tStart) / (ai.tEnd - ai.tStart)) * ai.cW;
  for (const s of getEdgeSplits(allSplits, selectedSplitId)) {
    if (Math.abs(x - tToX(s.tStart)) <= EDGE_HIT_PX) return { splitId: s.id, edge: 'start' };
    if (Math.abs(x - tToX(s.tEnd)) <= EDGE_HIT_PX) return { splitId: s.id, edge: 'end' };
  }
  return null;
}

// ========== ACCEL CHART ==========
export function AccelChart({ data, chartView, thresholds, onZoom, onSelection, splits, selectedSplitId, onSplitResize }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const infoRef = useRef(null);
  const imageRef = useRef(null);
  const baseImageRef = useRef(null);
  const overlayRef = useRef(null);
  const selRef = useRef({ start: null, end: null, dragging: false });
  // Keep fresh refs so event handlers don't need to re-register when splits change
  const splitsRef = useRef(splits);
  const selectedSplitIdRef = useRef(selectedSplitId);
  useEffect(() => { splitsRef.current = splits; }, [splits]);
  useEffect(() => { selectedSplitIdRef.current = selectedSplitId; }, [selectedSplitId]);

  const [xMode, setXMode] = useState('clock'); // 'elapsed' | 'clock'
  const startMs = useMemo(() => {
    const ts = data?.[0]?.ts;
    return ts instanceof Date ? ts.getTime() : (typeof ts === 'number' ? ts : null);
  }, [data]);
  const hasClock = startMs != null && !Number.isNaN(startMs);
  const fmtX = useCallback((t) => {
    if (xMode === 'clock' && hasClock) return formatClock(new Date(startMs + t * 1000));
    return formatDuration(t);
  }, [xMode, hasClock, startMs]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data) return;

    const { ctx, W, H } = setupCanvas(canvas, container);
    const pad = { top: 20, right: 50, bottom: 30, left: 50 };
    const cW = W - pad.left - pad.right, cH = H - pad.top - pad.bottom;
    const tStart = chartView.tStart, tEnd = chartView.tEnd;
    const tRange = tEnd - tStart;

    const tToX = t => pad.left + ((t - tStart) / tRange) * cW;

    const inView = data.filter(d => d.t >= tStart && d.t <= tEnd);
    if (!inView.length) return;
    const step = Math.max(1, Math.floor(inView.length / 800));
    const sampled = inView.filter((_, i) => i % step === 0);

    const maxA = Math.min(Math.max(...inView.map(d => d.linMag)) * 1.1, 60) || 1;
    const maxS = Math.max(...inView.map(d => d.speed)) * 1.1 || 1;

    infoRef.current = { pad, cW, cH, tStart, tEnd, W, H, maxA, maxS };

    // Grid
    ctx.strokeStyle = '#1a1a26'; ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + (cH / 5) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    }

    // Impact threshold line
    const T = thresholds;
    const impactY = pad.top + cH - (T.impactThresh / maxA) * cH;
    if (impactY > pad.top && impactY < pad.top + cH) {
      ctx.strokeStyle = 'rgba(255,107,107,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(pad.left, impactY); ctx.lineTo(W - pad.right, impactY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,107,107,0.5)'; ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`impact ${T.impactThresh} m/s²`, pad.left + 4, impactY - 4);
    }

    // Clip
    ctx.save(); ctx.beginPath(); ctx.rect(pad.left, pad.top, cW, cH); ctx.clip();

    // Accel fill
    ctx.beginPath(); ctx.moveTo(tToX(sampled[0].t), pad.top + cH);
    for (const pt of sampled) ctx.lineTo(tToX(pt.t), pad.top + cH - (Math.min(pt.linMag, maxA) / maxA) * cH);
    ctx.lineTo(tToX(sampled[sampled.length - 1].t), pad.top + cH); ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
    grad.addColorStop(0, 'rgba(0,229,160,0.25)'); grad.addColorStop(1, 'rgba(0,229,160,0.01)');
    ctx.fillStyle = grad; ctx.fill();

    // Accel line
    ctx.beginPath(); ctx.strokeStyle = '#00e5a0'; ctx.lineWidth = 1.5;
    sampled.forEach((pt, i) => {
      const x = tToX(pt.t), y = pad.top + cH - (Math.min(pt.linMag, maxA) / maxA) * cH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Speed overlay
    ctx.beginPath(); ctx.strokeStyle = '#00b8ff80'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    sampled.forEach((pt, i) => {
      const x = tToX(pt.t), y = pad.top + cH - (pt.speed / maxS) * cH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();

    // Y-axis labels
    ctx.fillStyle = '#00e5a0'; ctx.font = '11px JetBrains Mono, monospace'; ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) ctx.fillText((maxA / 5 * (5 - i)).toFixed(0), pad.left - 8, pad.top + (cH / 5) * i + 4);
    ctx.fillStyle = '#00b8ff'; ctx.textAlign = 'left';
    for (let i = 0; i <= 5; i++) ctx.fillText((maxS / 5 * (5 - i)).toFixed(0), W - pad.right + 8, pad.top + (cH / 5) * i + 4);
    // X-axis
    ctx.fillStyle = '#8888a0'; ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const t = tStart + (tRange / 4) * i;
      ctx.fillText(fmtX(t), tToX(t), H - 6);
    }

    baseImageRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (selectedSplitId && splits?.length) {
      drawSplitOverlays(ctx, infoRef.current, splits, selectedSplitId, null);
    }
    imageRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, [data, chartView, thresholds, splits, selectedSplitId, fmtX]);

  useEffect(() => { render(); }, [render]);

  useEffect(() => {
    const handleResize = () => { clearTimeout(handleResize._t); handleResize._t = setTimeout(render, 150); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [render]);

  // Zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onZoom) return;
    const handleWheel = (e) => {
      e.preventDefault();
      const ai = infoRef.current;
      if (!ai) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = ai.tStart + ((x - ai.pad.left) / ai.cW) * (ai.tEnd - ai.tStart);
      onZoom(Math.max(ai.tStart, Math.min(ai.tEnd, t)), e.deltaY);
    };
    const handleDblClick = () => onZoom(null, 0);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('dblclick', handleDblClick);
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('dblclick', handleDblClick);
    };
  }, [onZoom]);

  // Interaction: edge-drag, selection-drag, hover
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;

    // Local drag state (no re-renders during drag)
    const edgeDrag = { active: false, splitId: null, edge: null };

    const xToTime = (clientX) => {
      const ai = infoRef.current;
      if (!ai) return 0;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      return Math.max(ai.tStart, Math.min(ai.tEnd,
        ai.tStart + ((x - ai.pad.left) / ai.cW) * (ai.tEnd - ai.tStart)));
    };
    const timeToX = (t) => {
      const ai = infoRef.current;
      if (!ai) return 0;
      return ai.pad.left + ((t - ai.tStart) / (ai.tEnd - ai.tStart)) * ai.cW;
    };

    // ── mousedown: decide edge-drag vs selection-drag ──
    const handleDown = (e) => {
      const ai = infoRef.current;
      if (!ai) return;
      const rect = canvas.getBoundingClientRect();
      const hit = findHoveredEdge(e.clientX, rect, ai, splitsRef.current, selectedSplitIdRef.current);
      if (hit) {
        edgeDrag.active = true;
        edgeDrag.splitId = hit.splitId;
        edgeDrag.edge = hit.edge;
        return; // do not start selection drag
      }
      selRef.current.dragging = true;
      selRef.current.start = xToTime(e.clientX);
      selRef.current.end = selRef.current.start;
      overlay.style.display = 'block';
      overlay.style.width = '0px';
    };

    // ── document mousemove: drives both drag types ──
    const handleDocMove = (e) => {
      const ai = infoRef.current;
      if (!ai) return;
      if (edgeDrag.active) {
        // Redraw base + overlays with preview edge position
        const t = xToTime(e.clientX);
        const ctx = canvas.getContext('2d');
        if (baseImageRef.current) ctx.putImageData(baseImageRef.current, 0, 0);
        drawSplitOverlays(ctx, ai, splitsRef.current, selectedSplitIdRef.current,
          { splitId: edgeDrag.splitId, edge: edgeDrag.edge, time: t });
        return;
      }
      if (selRef.current.dragging) {
        selRef.current.end = xToTime(e.clientX);
        const s = selRef.current;
        overlay.style.left = Math.min(timeToX(s.start), timeToX(s.end)) + 'px';
        overlay.style.width = Math.abs(timeToX(s.end) - timeToX(s.start)) + 'px';
      }
    };

    // ── document mouseup: commit any active drag ──
    const handleDocUp = (e) => {
      if (edgeDrag.active) {
        edgeDrag.active = false;
        const t = xToTime(e.clientX);
        onSplitResize?.(edgeDrag.splitId, edgeDrag.edge, t);
        edgeDrag.splitId = null;
        edgeDrag.edge = null;
        return;
      }
      if (!selRef.current.dragging) return;
      selRef.current.dragging = false;
      selRef.current.end = xToTime(e.clientX);
      const s = selRef.current;
      overlay.style.display = 'none';
      if (Math.abs(s.end - s.start) > 0.3) {
        onSelection?.(Math.min(s.start, s.end), Math.max(s.start, s.end));
      } else {
        onSelection?.(null, null);
      }
    };

    // ── canvas mousemove: cursor + hover tooltip (when not dragging) ──
    const handleMove = (e) => {
      if (edgeDrag.active || selRef.current.dragging) return;
      const ai = infoRef.current;
      if (!ai || !imageRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;

      // Cursor style based on edge proximity
      const hit = findHoveredEdge(e.clientX, rect, ai, splitsRef.current, selectedSplitIdRef.current);
      canvas.style.cursor = hit ? 'ew-resize' : 'crosshair';

      // Hover tooltip
      const ctx = canvas.getContext('2d');
      ctx.putImageData(imageRef.current, 0, 0);
      if (x < ai.pad.left || x > ai.pad.left + ai.cW) return;
      const t = ai.tStart + ((x - ai.pad.left) / ai.cW) * (ai.tEnd - ai.tStart);
      const pt = findClosestInView(data, { tStart: ai.tStart, tEnd: ai.tEnd }, t);
      if (!pt) return;
      const px = ai.pad.left + ((pt.t - ai.tStart) / (ai.tEnd - ai.tStart)) * ai.cW;
      const pyA = ai.pad.top + ai.cH - (Math.min(pt.linMag, ai.maxA) / ai.maxA) * ai.cH;
      const pyS = ai.pad.top + ai.cH - (pt.speed / ai.maxS) * ai.cH;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(px, ai.pad.top); ctx.lineTo(px, ai.pad.top + ai.cH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(px, pyA, 4, 0, Math.PI * 2); ctx.fillStyle = '#00e5a0'; ctx.fill();
      ctx.beginPath(); ctx.arc(px, pyS, 4, 0, Math.PI * 2); ctx.fillStyle = '#00b8ff'; ctx.fill();
      const lines = [pt.linMag.toFixed(1) + ' m/s²', pt.speed.toFixed(2) + ' m/s', fmtX(pt.t)];
      const clrs = ['#00e5a0', '#00b8ff', '#8888a0'];
      ctx.font = '11px JetBrains Mono, monospace';
      const bW = Math.max(...lines.map(l => ctx.measureText(l).width)) + 16;
      let bx = px + 10, by = Math.min(pyA, pyS) - 10;
      if (bx + bW > ai.W - ai.pad.right) bx = px - bW - 10;
      if (by < ai.pad.top) by = ai.pad.top + 4;
      ctx.textAlign = 'left';
      drawHoverTooltip(ctx, lines, clrs, bx, by);
      ctx.restore();
    };

    const handleLeave = () => {
      if (!edgeDrag.active && !selRef.current.dragging) {
        canvas.style.cursor = 'crosshair';
        if (imageRef.current) canvas.getContext('2d').putImageData(imageRef.current, 0, 0);
      }
    };

    canvas.addEventListener('mousedown', handleDown);
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseleave', handleLeave);
    document.addEventListener('mousemove', handleDocMove);
    document.addEventListener('mouseup', handleDocUp);
    return () => {
      canvas.removeEventListener('mousedown', handleDown);
      canvas.removeEventListener('mousemove', handleMove);
      canvas.removeEventListener('mouseleave', handleLeave);
      document.removeEventListener('mousemove', handleDocMove);
      document.removeEventListener('mouseup', handleDocUp);
    };
  }, [data, onSelection, onSplitResize, fmtX]);

  return (
    <div className="section">
      <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="dot" style={{ background: 'var(--accent)' }}></span>
        <span>Acceleration (gravity-corrected via gyro) — Drag to select splits</span>
        {hasClock && (
          <button
            type="button"
            onClick={() => setXMode(m => m === 'elapsed' ? 'clock' : 'elapsed')}
            title={xMode === 'elapsed' ? 'Switch X-axis to local clock time' : 'Switch X-axis to elapsed time'}
            style={{
              marginLeft: 'auto',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {xMode === 'elapsed' ? 'Elapsed' : 'Clock'}
          </button>
        )}
      </div>
      <div className="accel-chart-container" ref={containerRef}>
        <canvas ref={canvasRef}></canvas>
        <div className="selection-overlay" ref={overlayRef}></div>
      </div>
      <div className="chart-legend">
        <span className="legend-mag">Net Acceleration (m/s²)</span>
        <span className="legend-speed">Speed (m/s)</span>
      </div>
    </div>
  );
}
