import React, { useRef, useState } from 'react';

export default function UploadBox({ onFile }) {
  const inputRef = useRef(null);
  const [dragover, setDragover] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragover(false);
    if (e.dataTransfer.files.length) onFile(e.dataTransfer.files[0]);
  };

  return (
    <div
      className={`panel-card upload-box${dragover ? ' dragover' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragover(true); }}
      onDragLeave={() => setDragover(false)}
      onDrop={handleDrop}
    >
      <div className="panel-icon">📂</div>
      <div className="panel-body">
        <div className="panel-title">Load Session</div>
        <div className="panel-subtitle">Drop a CSV or .bin file here, or click to browse</div>
      </div>
      <input
        type="file"
        ref={inputRef}
        accept=".csv,.bin"
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files.length) onFile(e.target.files[0]); }}
      />
    </div>
  );
}
