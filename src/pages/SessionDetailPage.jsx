import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import MetricsGrid from '../components/MetricsGrid';
import SpeedZones from '../components/SpeedZones';
import ThresholdsPanel from '../components/ThresholdsPanel';
import { SpeedChart, AccelChart } from '../components/Charts';
import HeatMap from '../components/HeatMap';
import SplitsPanel from '../components/SplitsPanel';
import ExportMenu from '../components/ExportMenu';
import { computeMetrics, aggregateMetrics } from '../utils/metrics';
import { exportGPX, exportMetricsJSON, exportMetricsCSV } from '../utils/exporters';
import { formatDuration } from '../utils/format';
import { useSession } from '../contexts/SessionContext';
import { useSessions } from '../hooks/useSessions';

export default function SessionDetailPage() {
  const { processedData, profile, thresholds, setThresholds, loadedSplits, currentSessionId } = useSession();
  const { updateSessionSplits, updateSessionThresholds } = useSessions();
  const navigate = useNavigate();
  const location = useLocation();
  const fromSessions = location.state?.from === 'sessions';

  const [localThresholds, setLocalThresholds] = useState(thresholds);
  const [chartView, setChartView] = useState(() => ({
    tStart: 0,
    tEnd: processedData ? processedData[processedData.length - 1].t : 0,
  }));
  // splits stores { id, name, tStart, tEnd, isCombined, sourceIds, sourceSplits }
  // metrics are derived via splitsWithCurrentMetrics below
  const [splits, setSplits] = useState(() => loadedSplits || []);
  const [selectedSplitId, setSelectedSplitId] = useState(null);
  const splitsInitialized = useRef(false);
  const [selectionRange, setSelectionRange] = useState(null);
  const [splitNameInput, setSplitNameInput] = useState('');
  const [showSplitInput, setShowSplitInput] = useState(false);

  const metrics = useMemo(
    () => processedData ? computeMetrics(processedData, profile, localThresholds) : null,
    [processedData, profile, localThresholds]
  );

  /** Re-derives split metrics (and combined tStart/tEnd) whenever thresholds or time ranges change. */
  const splitsWithCurrentMetrics = useMemo(() => {
    if (!processedData || splits.length === 0) return splits;
    const baseMap = {};
    splits.forEach(s => {
      if (!s.isCombined) {
        const slice = processedData.filter(d => d.t >= s.tStart && d.t <= s.tEnd);
        baseMap[s.id] = { ...s, metrics: computeMetrics(slice, profile, localThresholds) };
      }
    });
    return splits.map(s => {
      if (s.isCombined) {
        const sources = (s.sourceIds || []).map(id => baseMap[id]).filter(Boolean);
        // Keep tStart/tEnd in sync with whatever the source splits currently cover
        const tStart = sources.length ? Math.min(...sources.map(src => src.tStart)) : s.tStart;
        const tEnd   = sources.length ? Math.max(...sources.map(src => src.tEnd))   : s.tEnd;
        return { ...s, tStart, tEnd, metrics: aggregateMetrics(sources.map(src => src.metrics), profile) };
      }
      return baseMap[s.id] || s;
    });
  }, [splits, processedData, profile, localThresholds]);

  const handleThresholdsApply = useCallback(() => {
    setThresholds(localThresholds);
    if (currentSessionId) updateSessionThresholds(currentSessionId, localThresholds);
  }, [localThresholds, setThresholds, currentSessionId, updateSessionThresholds]);

  // Auto-save splits to DB whenever the splits array changes (add/delete/rename/combine).
  // Skip the initial mount to avoid overwriting DB splits with the loaded state.
  useEffect(() => {
    if (!splitsInitialized.current) {
      splitsInitialized.current = true;
      return;
    }
    if (!currentSessionId) return;
    updateSessionSplits(currentSessionId, splitsWithCurrentMetrics);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splits]); // intentionally only `splits` — threshold changes don't trigger a DB write

  const handleZoom = useCallback((cursorTime, delta) => {
    if (!processedData) return;
    if (cursorTime === null) {
      setChartView({ tStart: 0, tEnd: processedData[processedData.length - 1].t });
      return;
    }
    setChartView(prev => {
      const totalDur = processedData[processedData.length - 1].t;
      const range = prev.tEnd - prev.tStart;
      const factor = delta > 0 ? 1.18 : 0.85;
      const newRange = Math.max(5, Math.min(totalDur, range * factor));
      const ratio = range > 0 ? (cursorTime - prev.tStart) / range : 0.5;
      let tStart = Math.max(0, cursorTime - ratio * newRange);
      let tEnd = Math.min(totalDur, tStart + newRange);
      if (tEnd - tStart < newRange) tStart = Math.max(0, tEnd - newRange);
      return { tStart, tEnd };
    });
  }, [processedData]);

  const handleAccelSelection = useCallback((tMin, tMax) => {
    if (tMin === null) {
      setSelectionRange(null);
      setShowSplitInput(false);
      return;
    }
    setSelectionRange({ tStart: tMin, tEnd: tMax });
    setSplitNameInput(splits.length === 0 ? '1st Half' : (splits.length === 1 ? '2nd Half' : ''));
    setShowSplitInput(true);
  }, [splits.length]);

  const saveSplit = useCallback(() => {
    if (!selectionRange) return;
    const name = splitNameInput.trim() || `Split ${splits.length + 1}`;
    setSplits(prev => [...prev, {
      id: Date.now(),
      name,
      tStart: selectionRange.tStart,
      tEnd: selectionRange.tEnd,
      isCombined: false,
    }]);
    setSelectionRange(null);
    setShowSplitInput(false);
  }, [selectionRange, splitNameInput, splits.length]);

  const clearSelection = useCallback(() => {
    setSelectionRange(null);
    setShowSplitInput(false);
  }, []);

  const deleteSplit = useCallback((id) => {
    if (selectedSplitId === id) setSelectedSplitId(null);
    setSplits(prev => prev.filter(s => s.id !== id));
  }, [selectedSplitId]);

  const renameSplit = useCallback((id, newName) => {
    setSplits(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));
  }, []);

  const selectSplit = useCallback((id) => {
    setSelectedSplitId(prev => prev === id ? null : id);
  }, []);

  const combineSplits = useCallback((ids, name) => {
    const selected = splits.filter(s => ids.includes(s.id));
    const tMin = Math.min(...selected.map(s => s.tStart));
    const tMax = Math.max(...selected.map(s => s.tEnd));
    setSplits(prev => [...prev, {
      id: Date.now(),
      name,
      tStart: tMin,
      tEnd: tMax,
      isCombined: true,
      sourceIds: ids,
      sourceSplits: selected.map(s => s.name),
    }]);
  }, [splits]);

  const handleSplitResize = useCallback((splitId, edge, newTime) => {
    const totalDur = processedData ? processedData[processedData.length - 1].t : Infinity;
    setSplits(prev => prev.map(s => {
      if (s.id !== splitId) return s;
      if (edge === 'start') return { ...s, tStart: Math.max(0, Math.min(newTime, s.tEnd - 0.5)) };
      return { ...s, tEnd: Math.min(totalDur, Math.max(newTime, s.tStart + 0.5)) };
    }));
  }, [processedData]);

  if (!processedData) return <Navigate to="/app/upload" replace />;

  const d0 = processedData[0];
  const sessionInfo = d0
    ? `${d0.ts.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · ${d0.ts.toLocaleTimeString('en-ZA')} · ${formatDuration(metrics?.duration || 0)} · ${profile.weight}kg`
    : '';

  return (
    <div className="dashboard">
      <div className="dash-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {fromSessions && (
            <button className="btn-link back-btn" onClick={() => navigate('/app/sessions')}>
              ← Sessions
            </button>
          )}
          <div>
            <h2>Session Overview</h2>
            <div className="session-info">{sessionInfo}</div>
          </div>
        </div>
        <div className="export-bar">
          <ExportMenu
            onExportGPX={() => exportGPX(processedData)}
            onExportJSON={() => exportMetricsJSON(processedData, profile, localThresholds, splitsWithCurrentMetrics)}
            onExportCSV={() => exportMetricsCSV(processedData, profile, localThresholds, splitsWithCurrentMetrics)}
          />
        </div>
      </div>

      <ThresholdsPanel
        thresholds={localThresholds}
        onChange={setLocalThresholds}
        onApply={handleThresholdsApply}
      />

      <MetricsGrid metrics={metrics} thresholds={localThresholds} />

      <SpeedZones metrics={metrics} thresholds={localThresholds} />

      <div className="two-col">
        <HeatMap data={processedData} chartView={chartView} />
        <SpeedChart
          data={processedData}
          chartView={chartView}
          thresholds={localThresholds}
          onZoom={handleZoom}
        />
      </div>

      <AccelChart
        data={processedData}
        chartView={chartView}
        thresholds={localThresholds}
        onZoom={handleZoom}
        onSelection={handleAccelSelection}
        splits={splitsWithCurrentMetrics}
        selectedSplitId={selectedSplitId}
        onSplitResize={handleSplitResize}
      />

      {showSplitInput && (
        <div className="split-actions">
          <input
            type="text"
            placeholder="Split name…"
            value={splitNameInput}
            onChange={e => setSplitNameInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveSplit(); } }}
            autoFocus
            style={{
              background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px',
              padding: '7px 12px', color: 'var(--text)', fontFamily: 'inherit', fontSize: '13px',
              outline: 'none', width: '160px'
            }}
          />
          <button className="btn btn-accent" onClick={saveSplit}>Save Split</button>
          <button className="btn" onClick={clearSelection}>Clear</button>
        </div>
      )}

      {!showSplitInput && (
        <div className="split-actions">
          <span className="split-hint">Drag to select a range · Click a saved split to highlight it on the chart</span>
        </div>
      )}

      <SplitsPanel
        splits={splitsWithCurrentMetrics}
        profile={profile}
        thresholds={localThresholds}
        onDelete={deleteSplit}
        onRename={renameSplit}
        onSelect={selectSplit}
        selectedSplitId={selectedSplitId}
        onCombine={combineSplits}
      />
    </div>
  );
}
