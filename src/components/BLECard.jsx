import React, { useState, useEffect, useCallback } from 'react';
import { bleManager } from '../utils/ble';
import { formatBLEFilename, formatBytes } from '../utils/format';

export default function BLECard({ onFileReady }) {
  const [connected, setConnected] = useState(() => bleManager.isConnected);
  const [connecting, setConnecting] = useState(false);
  const [files, setFiles] = useState(() => [...bleManager.availableFiles]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [status, setStatus] = useState('');
  const [statusError, setStatusError] = useState(false);
  const [progress, setProgress] = useState(null); // { received, total }

  useEffect(() => {
    bleManager.onStatusChange = (text, isError) => {
      setStatus(text);
      setStatusError(isError || false);
    };
    bleManager.onFilesUpdated = (f) => {
      setFiles([...f]);
      setConnecting(false);
    };
    bleManager.onProgress = (received, total) => {
      setProgress({ received, total });
    };
    bleManager.onDisconnect = () => {
      setConnected(false);
      setConnecting(false);
      setFiles([]);
      setSelectedIdx(-1);
      setProgress(null);
    };
    bleManager.onFileReady = (filename, payload) => {
      setProgress(null);
      onFileReady(filename, payload);
    };
    return () => {
      bleManager.onStatusChange = null;
      bleManager.onFilesUpdated = null;
      bleManager.onProgress = null;
      bleManager.onDisconnect = null;
      bleManager.onFileReady = null;
    };
  }, [onFileReady]);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    const ok = await bleManager.connect();
    if (ok) setConnected(true);
    else setConnecting(false);
  }, []);

  const handleDisconnect = useCallback(async () => {
    await bleManager.disconnect();
    setConnected(false);
    setFiles([]);
    setSelectedIdx(-1);
  }, []);

  const handleRefresh = useCallback(() => bleManager.refreshFileList(), []);

  const handleDownload = useCallback(() => {
    if (selectedIdx >= 0) bleManager.downloadFile(selectedIdx);
  }, [selectedIdx]);

  const handleDelete = useCallback((filename) => {
    bleManager.deleteFile(filename);
    setSelectedIdx(-1);
  }, []);

  const isCached = (filename) => bleManager.isCached(filename);

  return (
    <div className={`panel-card ble-card${connected ? ' connected' : ''}`}>
      <div className="ble-card-header">
        <div className="panel-icon">📶</div>
        <div className="panel-body">
          <div className="panel-title">Device Files</div>
          <div className="ble-device-name">
            {connected ? bleManager.deviceName : 'Not connected'}
          </div>
        </div>
        <span className={`ble-dot${connected ? ' connected' : ''}`}></span>
      </div>

      {!connected && !connecting && (
        <div className="ble-connect-area">
          <div className="ble-connect-hint">Pair your MetricAthlete device to browse sessions</div>
          <button className="btn btn-small" onClick={handleConnect}>Connect</button>
        </div>
      )}

      {connecting && !connected && (
        <div className="ble-connect-area">
          <div className="ble-empty"><div className="ble-spinner"></div>Connecting to device…</div>
        </div>
      )}

      {connected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
          <div className="ble-file-list">
            {files.length === 0 ? (
              <div className="ble-empty"><div className="ble-spinner"></div>Requesting file list from device…</div>
            ) : (
              files.map((f, i) => (
                <div key={f.name}
                  className={`ble-file-item${i === selectedIdx ? ' selected' : ''}`}
                  onClick={() => setSelectedIdx(i)}
                >
                  <span className="ble-file-icon">🗂</span>
                  <div className="ble-file-info">
                    <div className="ble-file-date">
                      {formatBLEFilename(f.name)}
                      {isCached(f.name) && <span className="ble-cached-badge">cached</span>}
                    </div>
                    <div className="ble-file-meta">{f.name} · {formatBytes(f.size)}</div>
                  </div>
                  <button className="ble-delete-btn" title="Delete file"
                    onClick={e => { e.stopPropagation(); handleDelete(f.name); }}>🗑</button>
                </div>
              ))
            )}
          </div>

          {status && <div id="ble-status" className={statusError ? 'error' : ''}>{status}</div>}

          {progress && (
            <div style={{ display: 'block' }}>
              <div className="ble-progress-track">
                <div className="ble-progress-fill"
                  style={{ width: progress.total > 0 ? `${(progress.received / progress.total * 100).toFixed(1)}%` : '0%' }}>
                </div>
              </div>
              <div className="ble-progress-text">
                {progress.total > 0
                  ? `${(progress.received / progress.total * 100).toFixed(1)}% · ${formatBytes(progress.received)} / ${formatBytes(progress.total)}`
                  : formatBytes(progress.received)}
              </div>
            </div>
          )}

          <div className="ble-actions">
            <button className="btn btn-small" onClick={handleRefresh}>↻ Refresh</button>
            <button className="btn btn-small btn-accent" disabled={selectedIdx < 0} onClick={handleDownload}>
              {selectedIdx >= 0 && files[selectedIdx] && isCached(files[selectedIdx].name) ? 'Open' : 'Download'}
            </button>
            <button className="btn btn-small" onClick={handleDisconnect}>Disconnect</button>
          </div>
        </div>
      )}
    </div>
  );
}
