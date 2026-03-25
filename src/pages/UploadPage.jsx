import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import UploadBox from '../components/UploadBox';
import BLECard from '../components/BLECard';
import { parseBinary, parseCSV, inferBinaryVersion } from '../utils/parsers';
import { processSession } from '../utils/processing';
import { computeMetrics } from '../utils/metrics';
import { useSession } from '../contexts/SessionContext';
import { useAuth } from '../contexts/AuthContext';
import { useTeamSessions } from '../hooks/useTeamSessions';
import { useSessions } from '../hooks/useSessions';
import { formatDuration } from '../utils/format';
import { SESSION_TYPES } from '../utils/constants';
import { supabase } from '../lib/supabase';

const STORAGE_BUCKET = 'session-files';

/** Build a UTC Date from a raw parsed row's timestamp fields. */
function rowToUTCDate(r) {
  return new Date(Date.UTC(+r.year, +r.month - 1, +r.day, +r.hour, +r.minute, +r.second, +r.millisecond || 0));
}

export default function UploadPage() {
  const { profile, thresholds, setProcessedData, setCurrentSessionId, setLoadedSplits, activeSport } = useSession();
  const { user } = useAuth();
  const { myAvailableTeamSessions } = useTeamSessions();
  const { saveSession } = useSessions();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Parsed rows waiting for session details before processing
  const [pendingRows, setPendingRows] = useState(null);
  // Raw file blob for upload to Supabase Storage
  const [pendingFileBlob, setPendingFileBlob] = useState(null);
  const [fileName, setFileName] = useState('');
  const [sessionType, setSessionType] = useState('game');
  const [selectedTeamSessionId, setSelectedTeamSessionId] = useState('');

  const parseFile = useCallback((file) => {
    const isBinary = /\.bin$/i.test(file.name);
    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      setTimeout(() => {
        try {
          let rows;
          if (isBinary) {
            const version = inferBinaryVersion(file.name);
            rows = parseBinary(e.target.result, version);
          } else {
            rows = parseCSV(e.target.result);
          }
          setPendingRows(rows);
          setPendingFileBlob(file);
          setFileName(file.name);
          setLoading(false);
        } catch (err) {
          console.error('Processing error:', err);
          setError(err.message);
          setLoading(false);
        }
      }, 50);
    };

    if (isBinary) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  }, []);

  const handleBLEFileReady = useCallback((filename, payload) => {
    setLoading(true);
    setError(null);
    setTimeout(() => {
      try {
        const version = inferBinaryVersion(filename);
        const ab = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
        const rows = parseBinary(ab, version);
        setPendingRows(rows);
        setPendingFileBlob(new Blob([ab]));
        setFileName(filename);
        setLoading(false);
      } catch (err) {
        console.error('BLE parse error:', err);
        setError(err.message);
        setLoading(false);
      }
    }, 50);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!pendingRows || !user) return;
    setLoading(true);
    try {
      const data = processSession(pendingRows);
      const metrics = computeMetrics(data, profile, thresholds);
      const startUtc = rowToUTCDate(pendingRows[0]);
      const endUtc = rowToUTCDate(pendingRows[pendingRows.length - 1]);
      const durationSec = Math.max(0, (endUtc - startUtc) / 1000);

      // Upload raw file to Supabase Storage
      let filePath = null;
      if (pendingFileBlob) {
        const storageName = `${user.id}/${Date.now()}-${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storageName, pendingFileBlob, { upsert: false });
        if (!uploadError) filePath = storageName;
      }

      // Persist to Supabase
      const { data: saved } = await saveSession({
        sport: activeSport === 'all' ? (profile.sport || 'general') : activeSport,
        session_type: sessionType,
        session_date: startUtc.toISOString(),
        duration: durationSec,
        metrics,
        thresholds,
        profile_snapshot: profile,
        team_session_id: selectedTeamSessionId || null,
        file_name: fileName,
        file_path: filePath,
        splits: [],
      });

      setLoadedSplits([]);
      setProcessedData(data);
      setCurrentSessionId(saved?.id || null);
      navigate('/app/dashboard');
    } catch (err) {
      console.error('Processing error:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [pendingRows, user, profile, thresholds, activeSport, sessionType, selectedTeamSessionId, fileName, pendingFileBlob, setProcessedData, setCurrentSessionId, navigate, saveSession]);

  const handleCancel = useCallback(() => {
    setPendingRows(null);
    setPendingFileBlob(null);
    setFileName('');
    setError(null);
  }, []);

  // Derive session date/time and duration from raw parsed rows
  const sessionInfo = useMemo(() => {
    if (!pendingRows || pendingRows.length === 0) return null;
    const first = pendingRows[0];
    const last = pendingRows[pendingRows.length - 1];
    const startUtc = rowToUTCDate(first);
    const endUtc = rowToUTCDate(last);
    const durationSec = Math.max(0, (endUtc - startUtc) / 1000);
    return { startUtc, endUtc, durationSec };
  }, [pendingRows]);

  if (loading) {
    return (
      <div className="loading" style={{ display: 'flex' }}>
        <div className="spinner"></div>
        <p>{pendingRows ? 'Processing session data…' : 'Reading file…'}</p>
      </div>
    );
  }

  // Step 2: File parsed, show session details form
  if (pendingRows) {
    const localDate = sessionInfo?.startUtc.toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const localTime = sessionInfo?.startUtc.toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit',
    });
    const localEndTime = sessionInfo?.endUtc.toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit',
    });

    return (
      <div className="upload-details-page">
        {error && (
          <div className="upload-error">
            Error: {error}
            <button onClick={() => setError(null)} className="upload-error-close">&#x2715;</button>
          </div>
        )}

        <h2 className="upload-details-title">Session Details</h2>

        <div className="upload-session-summary">
          <div className="upload-session-date">{localDate}</div>
          <div className="upload-session-time">
            {localTime} — {localEndTime} · {formatDuration(sessionInfo?.durationSec || 0)}
          </div>
          <div className="upload-session-meta">
            {fileName} · {pendingRows.length.toLocaleString()} data points
          </div>
        </div>

        <div className="upload-details-card">
          <div className="upload-details-row">
            <label className="upload-details-label">
              Session Type
              <select value={sessionType} onChange={(e) => setSessionType(e.target.value)}>
                {SESSION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="upload-details-label">
            Link to Team Session (optional)
            <select
              value={selectedTeamSessionId}
              onChange={(e) => setSelectedTeamSessionId(e.target.value)}
            >
              <option value="">None (private)</option>
              {myAvailableTeamSessions.map(ts => (
                <option key={ts.id} value={ts.id}>
                  {ts.team_name} — {ts.name} ({new Date(ts.session_date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="upload-details-actions">
          <button className="btn btn-accent btn-lg" onClick={handleConfirm}>
            Analyze Session
          </button>
          <button className="btn btn-outline" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Step 1: Upload / BLE file selection
  return (
    <>
      {error && (
        <div className="upload-error" style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 999, maxWidth: '90%' }}>
          Error: {error}
          <button onClick={() => setError(null)} className="upload-error-close">&#x2715;</button>
        </div>
      )}
      <div id="upload-screen" style={{ display: 'flex' }}>
        <div className="upload-panels">
          <UploadBox onFile={parseFile} />
          <div className="upload-or">or</div>
          <BLECard onFileReady={handleBLEFileReady} />
        </div>
      </div>
    </>
  );
}
