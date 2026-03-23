import React, { useState, useEffect, useRef } from 'react';

export default function ExportMenu({ onExportGPX, onExportJSON, onExportCSV }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  return (
    <div className="export-dropdown" ref={ref}>
      <button className="btn" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>Export ▾</button>
      <div className={`export-menu${open ? ' open' : ''}`}>
        <button onClick={() => { onExportGPX(); setOpen(false); }}>GPX</button>
        <button onClick={() => { onExportJSON(); setOpen(false); }}>Metrics (JSON)</button>
        <button onClick={() => { onExportCSV(); setOpen(false); }}>Metrics (CSV)</button>
      </div>
    </div>
  );
}
