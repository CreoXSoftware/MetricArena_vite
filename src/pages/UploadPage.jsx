import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import UploadBox from '../components/UploadBox';
import BLECard from '../components/BLECard';
import { parseBinary, parseCSV, inferBinaryVersion } from '../utils/parsers';
import { processSession } from '../utils/processing';
import { computeMetrics } from '../utils/metrics';
import { useSession } from '../contexts/SessionContext';
import { useAuth } from '../contexts/AuthContext';
import { useTeamSessions } from '../hooks/useTeamSessions';
import { useTeams } from '../hooks/useTeams';
import { useSessions } from '../hooks/useSessions';
import { formatDuration } from '../utils/format';
import { SESSION_TYPES } from '../utils/constants';
import { supabase } from '../lib/supabase';

const STORAGE_BUCKET = 'session-files';

/** Build a UTC Date from a raw parsed row's timestamp fields. */
function rowToUTCDate(r) {
  return new Date(Date.UTC(+r.year, +r.month - 1, +r.day, +r.hour, +r.minute, +r.second, +r.millisecond || 0));
}

export default function UploadPage({ onClose } = {}) {
  const { profile, thresholds, setProcessedData, setCurrentSessionId, setLoadedSplits, loadSessionFromHistory, activeSport } = useSession();
  const { user } = useAuth();
  const { myAvailableTeamSessions } = useTeamSessions();
  const { myTeams, getTeamMembers } = useTeams();
  const { saveSession } = useSessions();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Parsed rows waiting for session details before processing
  const [pendingRows, setPendingRows] = useState(null);
  // Raw file blob for upload to Supabase Storage
  const [pendingFileBlob, setPendingFileBlob] = useState(null);
  const [fileName, setFileName] = useState('');
  const [sessionType, setSessionType] = useState('game');
  const [selectedTeamSessionId, setSelectedTeamSessionId] = useState('');

  // Manager upload-on-behalf state
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [teamMembers, setTeamMembers] = useState([]);
  const [playerProfileData, setPlayerProfileData] = useState(null);

  // Determine if selected team session is from a team where user is manager
  const selectedTs = myAvailableTeamSessions.find(ts => ts.id === selectedTeamSessionId);
  const isManagerOfSelectedTeam = selectedTs && myTeams.some(t => t.id === selectedTs.team_id && t.is_manager);

  // Fetch team members when a manager selects a team session
  useEffect(() => {
    if (!isManagerOfSelectedTeam || !selectedTs) {
      setTeamMembers([]);
      setSelectedPlayerId('');
      setPlayerProfileData(null);
      return;
    }
    getTeamMembers(selectedTs.team_id).then(members => {
      setTeamMembers(members.filter(m => m.is_player));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamSessionId, isManagerOfSelectedTeam]);

  // Fetch the selected player's profile for accurate metrics
  useEffect(() => {
    if (!selectedPlayerId || selectedPlayerId === user?.id) {
      setPlayerProfileData(null);
      return;
    }
    supabase
      .from('profiles')
      .select('athlete_profile, default_thresholds')
      .eq('id', selectedPlayerId)
      .single()
      .then(({ data }) => { if (data) setPlayerProfileData(data); });
  }, [selectedPlayerId, user?.id]);

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
      const targetUserId = selectedPlayerId || user.id;
      const isOnBehalf = targetUserId !== user.id;

      // Use the player's profile/thresholds when uploading on behalf
      const effectiveProfile = isOnBehalf && playerProfileData?.athlete_profile
        ? { weight: 75, height: 178, age: 25, maxHR: 195, sex: 'male', sport: 'general', vo2max: 0, ...playerProfileData.athlete_profile }
        : profile;
      const effectiveThresholds = isOnBehalf && playerProfileData?.default_thresholds
        ? playerProfileData.default_thresholds
        : thresholds;

      const data = processSession(pendingRows);
      const metrics = computeMetrics(data, effectiveProfile, effectiveThresholds);
      const startUtc = rowToUTCDate(pendingRows[0]);
      const endUtc = rowToUTCDate(pendingRows[pendingRows.length - 1]);
      const durationSec = Math.max(0, (endUtc - startUtc) / 1000);

      // Upload raw file to Supabase Storage (stored under uploader's path for storage RLS)
      let filePath = null;
      if (pendingFileBlob) {
        const storageName = `${user.id}/${Date.now()}-${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storageName, pendingFileBlob, { upsert: false });
        if (!uploadError) filePath = storageName;
      }

      // Persist to Supabase
      const { data: saved, error: saveError } = await saveSession({
        sport: activeSport === 'all' ? (effectiveProfile.sport || 'general') : activeSport,
        session_type: sessionType,
        session_date: startUtc.toISOString(),
        duration: durationSec,
        metrics,
        thresholds: effectiveThresholds,
        profile_snapshot: effectiveProfile,
        team_session_id: selectedTeamSessionId || null,
        file_name: fileName,
        file_path: filePath,
        splits: [],
      }, isOnBehalf ? targetUserId : null);

      if (saveError) throw new Error(saveError);

      if (isOnBehalf) {
        loadSessionFromHistory(data, effectiveThresholds, [], saved?.id || null, playerProfileData);
        navigate('/app/dashboard', { state: { from: 'sessions' } });
      } else {
        setLoadedSplits([]);
        setProcessedData(data);
        setCurrentSessionId(saved?.id || null);
        navigate('/app/dashboard');
      }
    } catch (err) {
      console.error('Processing error:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [pendingRows, user, profile, thresholds, activeSport, sessionType, selectedTeamSessionId, selectedPlayerId, playerProfileData, teamMembers, fileName, pendingFileBlob, setProcessedData, setCurrentSessionId, setLoadedSplits, loadSessionFromHistory, navigate, saveSession]);

  const handleCancel = useCallback(() => {
    setPendingRows(null);
    setPendingFileBlob(null);
    setFileName('');
    setError(null);
    setSelectedTeamSessionId('');
    setSelectedPlayerId('');
    if (onClose) onClose();
  }, [onClose]);

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

  // Filter team sessions to those whose date matches the file's UTC session date
  const filteredTeamSessions = useMemo(() => {
    if (!sessionInfo) return myAvailableTeamSessions;
    const sessionDateUTC = sessionInfo.startUtc.toISOString().slice(0, 10);
    return myAvailableTeamSessions.filter(ts => ts.session_date === sessionDateUTC);
  }, [sessionInfo, myAvailableTeamSessions]);

  const content = (() => {
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
                {filteredTeamSessions.map(ts => (
                  <option key={ts.id} value={ts.id}>
                    {ts.team_name} — {ts.name} ({new Date(ts.session_date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})
                  </option>
                ))}
              </select>
            </label>

            {isManagerOfSelectedTeam && selectedTeamSessionId && (
              <label className="upload-details-label">
                Upload on behalf of
                <select
                  value={selectedPlayerId}
                  onChange={(e) => setSelectedPlayerId(e.target.value)}
                >
                  <option value="">Myself</option>
                  {teamMembers.filter(m => m.id !== user.id).map(m => (
                    <option key={m.id} value={m.id}>{m.display_name || 'Unknown'}</option>
                  ))}
                </select>
              </label>
            )}
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
        {successMsg && (
          <div className="upload-success" style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 1100, maxWidth: '90%', background: 'var(--accent)', color: '#000', padding: '12px 24px', borderRadius: 8, fontWeight: 600 }}>
            {successMsg}
          </div>
        )}
        {error && (
          <div className="upload-error" style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 1100, maxWidth: '90%' }}>
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
  })();

  if (onClose) {
    return (
      <div className="upload-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="upload-modal">
          <button className="upload-modal-close" onClick={onClose} aria-label="Close">&#x2715;</button>
          {content}
        </div>
      </div>
    );
  }

  return content;
}
