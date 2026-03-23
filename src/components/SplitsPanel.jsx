import React, { useState } from 'react';
import { formatDuration } from '../utils/format';
import { aggregateMetrics } from '../utils/metrics';

function SplitMetric({ label, value }) {
  return (
    <div className="split-metric">
      <span className="sm-label">{label}</span><br />
      <span className="sm-value">{value}</span>
    </div>
  );
}

export default function SplitsPanel({ splits, profile, thresholds, onDelete, onRename, onSelect, selectedSplitId, onCombine }) {
  const T = thresholds || {};
  const [combineSelection, setCombineSelection] = useState([]);
  const [combineName, setCombineName] = useState('Full Game');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const validSplits = splits.filter(s => s?.metrics);
  if (!validSplits.length) return null;

  const baseSplits = validSplits.filter(s => !s.isCombined);

  const handleCombine = () => {
    if (combineSelection.length < 2) { alert('Select at least 2 splits to combine.'); return; }
    if (!combineName.trim()) { alert('Enter a name for the combined split.'); return; }
    onCombine(combineSelection, combineName.trim());
    setCombineSelection([]);
  };

  const toggleCombineCheck = (id) => {
    setCombineSelection(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const startRename = (s, e) => {
    e.stopPropagation();
    setEditingId(s.id);
    setEditName(s.name);
  };

  const commitRename = (id) => {
    if (editName.trim()) onRename(id, editName.trim());
    setEditingId(null);
  };

  return (
    <div className="section">
      <div className="section-title">
        <span className="dot" style={{ background: 'var(--accent3)' }}></span> Saved Splits
      </div>
      <div className="splits-container">
        {validSplits.map(s => {
          const m = s.metrics;
          const isSelected = selectedSplitId === s.id;
          const cls = `split-card${isSelected ? (s.isCombined ? ' selected-split-combined' : ' selected-split') : ''}`;
          const badge = s.isCombined
            ? ' <span style="font-size:10px;color:var(--accent2);background:rgba(0,184,255,0.12);border:1px solid rgba(0,184,255,0.3);border-radius:4px;padding:1px 5px;margin-left:6px;letter-spacing:0.5px;text-transform:uppercase">combined</span>'
            : '';

          return (
            <div key={s.id} className={cls} onClick={() => onSelect(s.id)}>
              <div className="split-header">
                <div>
                  {editingId === s.id ? (
                    <input
                      type="text"
                      value={editName}
                      autoFocus
                      style={{
                        width: '160px', background: 'var(--surface2)', border: '1px solid var(--accent)',
                        borderRadius: '6px', padding: '2px 8px', color: 'var(--text)', fontFamily: 'inherit',
                        fontSize: '14px', fontWeight: '700', outline: 'none'
                      }}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commitRename(s.id); }
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onBlur={() => commitRename(s.id)}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className="split-name" title="Click to rename"
                      onClick={e => startRename(s, e)}>
                      {s.name}
                    </span>
                  )}
                  {s.isCombined && <span style={{ fontSize: '10px', color: 'var(--accent2)', marginLeft: '6px' }}>[combined]</span>}
                </div>
                <div>
                  <span className="split-time">{formatDuration(s.tStart)} → {formatDuration(s.tEnd)}</span>{' '}
                  <button className="delete-split" onClick={e => { e.stopPropagation(); onDelete(s.id); }}>✕</button>
                </div>
              </div>
              {s.isCombined && s.sourceSplits && (
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '8px' }}>
                  From: {s.sourceSplits.join(', ')}
                </div>
              )}
              <div className="split-metrics">
                <SplitMetric label="Max Speed" value={(m.maxSpeedMs ?? m.maxSpeed / 3.6).toFixed(2) + ' m/s'} />
                <SplitMetric label="Avg Speed" value={(m.avgSpeed / 3.6).toFixed(2) + ' m/s'} />
                <SplitMetric label="Max Accel" value={m.maxAccel.toFixed(1) + ' m/s²'} />
                <SplitMetric label="Avg Accel" value={m.avgAccel.toFixed(2) + ' m/s²'} />
                <SplitMetric label="Max Decel" value={m.maxDecel.toFixed(1) + ' m/s²'} />
                <SplitMetric label="Distance" value={m.totalDist.toFixed(0) + ' m'} />
                <SplitMetric label="High Speed Dist" value={m.highSpeedDist.toFixed(0) + ' m'} />
                <SplitMetric label="Sprint Dist" value={m.sprintDist.toFixed(0) + ' m'} />
                <SplitMetric label="Dist to Max Spd" value={m.distToMax.toFixed(1) + ' m'} />
                <SplitMetric label="Time to Max Spd" value={m.timeToMax.toFixed(1) + ' s'} />
                <SplitMetric label="Duration" value={formatDuration(m.duration)} />
                <SplitMetric label="Time Moving" value={formatDuration(m.timeMoving)} />
                <SplitMetric label="Time Stationary" value={formatDuration(m.timeStationary)} />
                <SplitMetric label={`Sprints (>${T.sprintSpeed} km/h)`} value={m.sprints} />
                <SplitMetric label={`Runs (>${T.runSpeed} km/h)`} value={m.runs} />
                <SplitMetric label={`Impacts (>${T.impactThresh} m/s²)`} value={m.impacts} />
                <SplitMetric label="Peak Force" value={m.peakForce.toFixed(0) + ' N'} />
                <SplitMetric label="Avg Force" value={m.avgForce.toFixed(0) + ' N'} />
                <SplitMetric label="Peak Power" value={m.peakPower.toFixed(0) + ' W'} />
                <SplitMetric label="Avg Power" value={m.avgPower.toFixed(0) + ' W'} />
                <SplitMetric label="Calories" value={m.totalCal.toFixed(0) + ' kcal'} />
                <SplitMetric label="Work" value={(m.work / 1000).toFixed(1) + ' kJ'} />
                <SplitMetric label="Metabolic Power" value={m.metabolicPower.toFixed(1) + ' W/kg'} />
                <SplitMetric label="Player Load" value={m.playerLoad.toFixed(0) + ' au'} />
                <SplitMetric label="Player Load/min" value={m.plPerMin.toFixed(1) + ' au/min'} />
              </div>
            </div>
          );
        })}
      </div>

      {baseSplits.length >= 2 && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Combine Splits
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
            {baseSplits.map(s => (
              <label key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface2)',
                border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px'
              }}>
                <input type="checkbox" checked={combineSelection.includes(s.id)}
                  onChange={() => toggleCombineCheck(s.id)}
                  style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                {s.name}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="text" placeholder="Combined split name…" value={combineName}
              onChange={e => setCombineName(e.target.value)}
              style={{
                background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px',
                padding: '7px 12px', color: 'var(--text)', fontFamily: 'inherit', fontSize: '13px',
                outline: 'none', width: '200px'
              }} />
            <button className="btn btn-accent" onClick={handleCombine}>Create Combined Split</button>
          </div>
        </div>
      )}
    </div>
  );
}
