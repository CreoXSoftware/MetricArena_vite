import React, { useState } from 'react';
import { thresholdDefs } from '../utils/metrics';

export default function ThresholdsPanel({ thresholds, onChange, onApply }) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState({ ...thresholds });

  const handleSlider = (id, value) => {
    setLocal(prev => ({ ...prev, [id]: parseFloat(value) }));
  };

  const handleReset = () => {
    const defaults = {};
    thresholdDefs.forEach(td => { defaults[td.id] = td.default; });
    setLocal(defaults);
  };

  const handleApply = () => {
    onChange(local);
    onApply();
  };

  return (
    <div className={`collapsible${open ? ' open' : ''}`}>
      <div className="collapsible-header" onClick={() => setOpen(!open)}>
        <span className="title">
          <span className="dot" style={{ background: 'var(--warn)' }}></span> Thresholds &amp; Zones
        </span>
        <span className="chevron">▼</span>
      </div>
      <div className="collapsible-body">
        <div className="threshold-grid">
          {thresholdDefs.map(td => (
            <div className="threshold-item" key={td.id}>
              <div className="th-label">
                <span>{td.label}</span>
                <span className="th-value">{local[td.id]} {td.unit}</span>
              </div>
              <input
                type="range"
                min={td.min}
                max={td.max}
                step={td.step}
                value={local[td.id]}
                onChange={e => handleSlider(td.id, e.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="threshold-actions">
          <button className="btn btn-small" onClick={handleReset}>Reset Defaults</button>
          <button className="btn btn-small btn-accent" onClick={handleApply}>Apply &amp; Recalculate</button>
        </div>
      </div>
    </div>
  );
}
