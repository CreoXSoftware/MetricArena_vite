import React from 'react';
import { formatDuration } from '../utils/format';

export default function SpeedZones({ metrics, thresholds }) {
  if (!metrics) return null;

  const T = thresholds;
  const zones = metrics.zones;
  const total = zones.reduce((a, b) => a + b, 0) || 1;
  const colors = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444'];
  const names = [
    `Z1: 0–${T.zone1}`,
    `Z2: ${T.zone1}–${T.zone2}`,
    `Z3: ${T.zone2}–${T.zone3}`,
    `Z4: ${T.zone3}–${T.zone4}`,
    `Z5: >${T.zone4}`,
  ];

  return (
    <div className="section">
      <div className="section-title">
        <span className="dot" style={{ background: 'var(--warn)' }}></span> Speed Zone Distribution
      </div>
      <div className="zone-bar">
        {zones.map((z, i) => {
          const pct = (z / total) * 100;
          return (
            <div key={i} style={{ background: colors[i], flex: pct < 0.5 ? 0 : pct.toFixed(1) }}>
              {pct >= 5 ? `${pct.toFixed(0)}%` : ''}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.8' }}>
        {zones.map((z, i) => {
          const pct = (z / total) * 100;
          return (
            <span key={i} style={{ marginRight: '12px' }}>
              <span style={{
                display: 'inline-block', width: '10px', height: '10px', borderRadius: '3px',
                background: colors[i], verticalAlign: 'middle', marginRight: '4px'
              }}></span>
              {names[i]} m/s — {formatDuration(z)} ({pct.toFixed(1)}%)
            </span>
          );
        })}
      </div>
    </div>
  );
}
