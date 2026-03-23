import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { BrandSmall } from '../components/Brand';
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

export default function DashboardPage() {
  const { processedData, profile, thresholds, setThresholds } = useSession();
  const navigate = useNavigate();

  const [localThresholds, setLocalThresholds] = useState(thresholds);
  const [chartView, setChartView] = useState(() => ({
    tStart: 0,
    tEnd: processedData ? processedData[processedData.length - 1].t : 0,
  }));
  const [splits, setSplits] = useState([]);
  const [selectedSplitId, setSelectedSplitId] = useState(null);
  const [selectionRange, setSelectionRange] = useState(null);
  const [splitNameInput, setSplitNameInput] = useState('');
  const [showSplitInput, setShowSplitInput] = useState(false);

  const metrics = useMemo(
    () => processedData ? computeMetrics(processedData, profile, localThresholds) : null,
    [processedData, profile, localThresholds]
  );

  const handleThresholdsApply = useCallback(() => {
    setThresholds(localThresholds);
  }, [localThresholds, setThresholds]);

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
    if (!selectionRange || !processedData) return;
    const name = splitNameInput.trim() || `Split ${splits.length + 1}`;
    const splitData = processedData.filter(d => d.t >= selectionRange.tStart && d.t <= selectionRange.tEnd);
    const splitMetrics = computeMetrics(splitData, profile, localThresholds);
    setSplits(prev => [...prev, {
      id: Date.now(),
      name,
      tStart: selectionRange.tStart,
      tEnd: selectionRange.tEnd,
      metrics: splitMetrics,
      isCombined: false,
    }]);
    setSelectionRange(null);
    setShowSplitInput(false);
  }, [selectionRange, splitNameInput, processedData, profile, localThresholds, splits.length]);

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
    const combinedMetrics = aggregateMetrics(selected.map(s => s.metrics), profile);
    setSplits(prev => [...prev, {
      id: Date.now(),
      name,
      tStart: tMin,
      tEnd: tMax,
      isCombined: true,
      sourceIds: ids,
      sourceSplits: selected.map(s => s.name),
      metrics: combinedMetrics,
    }]);
  }, [splits, profile]);

  if (!processedData) return <Navigate to="/app/upload" replace />;

  const d0 = processedData[0];
  const sessionInfo = d0
    ? `${d0.ts.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · ${d0.ts.toLocaleTimeString('en-ZA')} · ${formatDuration(metrics?.duration || 0)} · ${profile.weight}kg`
    : '';

  return (
    <div className="dashboard">
      <div className="dash-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <BrandSmall />
          <div>
            <h2>Session Overview</h2>
            <div className="session-info">{sessionInfo}</div>
          </div>
        </div>
        <div className="export-bar">
          <ExportMenu
            onExportGPX={() => exportGPX(processedData)}
            onExportJSON={() => exportMetricsJSON(processedData, profile, localThresholds, splits)}
            onExportCSV={() => exportMetricsCSV(processedData, profile, localThresholds, splits)}
          />
          <button className="btn" onClick={() => navigate('/app/upload')}>Load Session</button>
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
        splits={splits}
        selectedSplitId={selectedSplitId}
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
        splits={splits}
        profile={profile}
        onDelete={deleteSplit}
        onRename={renameSplit}
        onSelect={selectSplit}
        selectedSplitId={selectedSplitId}
        onCombine={combineSplits}
      />
    </div>
  );
}
