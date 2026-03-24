import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessions } from '../hooks/useSessions';
import { useTeamSessions } from '../hooks/useTeamSessions';
import { useSession } from '../contexts/SessionContext';
import TeamSessionTag from '../components/TeamSessionTag';
import { formatDuration } from '../utils/format';
import { SPORTS, SESSION_TYPES } from '../utils/constants';
import { parseBinary, parseCSV, inferBinaryVersion } from '../utils/parsers';
import { processSession } from '../utils/processing';
import { supabase } from '../lib/supabase';

export default function SessionHistoryPage() {
  const { sessions, loading, linkToTeamSession, unlinkFromTeamSession, deleteSession } = useSessions();
  const { myAvailableTeamSessions } = useTeamSessions();
  const { loadSessionFromHistory, activeSport } = useSession();
  const visibleSessions = activeSport === 'all' ? sessions : sessions.filter(s => s.sport === activeSport);
  const navigate = useNavigate();
  const [linkingId, setLinkingId] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [openError, setOpenError] = useState(null);

  const openSession = async (s) => {
    if (!s.file_path) {
      setOpenError(`Session "${s.file_name || s.id}" has no stored file and cannot be re-opened.`);
      return;
    }
    setOpeningId(s.id);
    setOpenError(null);
    try {
      const { data: blob, error } = await supabase.storage
        .from('session-files')
        .download(s.file_path);
      if (error) throw new Error(error.message);

      const fileName = s.file_name || '';
      const isBinary = /\.bin$/i.test(fileName);

      let rows;
      if (isBinary) {
        const ab = await blob.arrayBuffer();
        const version = inferBinaryVersion(fileName);
        rows = parseBinary(ab, version);
      } else {
        const text = await blob.text();
        rows = parseCSV(text);
      }

      const data = processSession(rows);
      loadSessionFromHistory(data, s.thresholds, s.splits || [], s.id);
      navigate('/app/dashboard');
    } catch (err) {
      console.error('Failed to open session:', err);
      setOpenError(err.message);
      setOpeningId(null);
    }
  };

  if (loading) {
    return (
      <div className="loading" style={{ display: 'flex' }}>
        <div className="spinner"></div>
        <p>Loading sessions…</p>
      </div>
    );
  }

  return (
    <div className="sessions-page">
      <h2 className="page-title">Session History</h2>

      {openError && (
        <div className="upload-error" style={{ marginBottom: '16px' }}>
          {openError}
          <button onClick={() => setOpenError(null)} className="upload-error-close">&#x2715;</button>
        </div>
      )}

      {visibleSessions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No sessions yet</div>
          <p className="empty-state-desc">Upload a session file to get started.</p>
        </div>
      ) : (
        <div className="sessions-list">
          {visibleSessions.map(s => {
            const date = new Date(s.session_date);
            const metrics = s.metrics || {};
            const isOpening = openingId === s.id;
            return (
              <div
                key={s.id}
                className={`session-card${s.file_path ? ' session-card-clickable' : ''}`}
                onClick={() => s.file_path && !isOpening && openSession(s)}
                title={s.file_path ? undefined : 'No file stored — cannot re-open'}
              >
                <div className="session-card-header">
                  <div>
                    <div className="session-card-date">
                      {date.toLocaleDateString(undefined, {
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                      })}
                    </div>
                    <div className="session-card-time">
                      {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      {' · '}{formatDuration(s.duration || 0)}
                    </div>
                  </div>
                  <div className="session-card-badges">
                    <span className="session-card-sport">
                      {SPORTS.find(sp => sp.value === s.sport)?.label || s.sport}
                    </span>
                    {s.session_type && (
                      <span className="session-card-type">
                        {SESSION_TYPES.find(t => t.value === s.session_type)?.label || s.session_type}
                      </span>
                    )}
                  </div>
                </div>

                <div className="session-card-metrics">
                  {(metrics.maxSpeedMs ?? metrics.maxSpeed) != null && (
                    <div className="session-card-metric">
                      <span className="session-card-metric-value">
                        {metrics.maxSpeedMs != null
                          ? metrics.maxSpeedMs.toFixed(2)
                          : (metrics.maxSpeed / 3.6).toFixed(2)}
                      </span> m/s
                    </div>
                  )}
                  {metrics.totalDist != null && (
                    <div className="session-card-metric">
                      <span className="session-card-metric-value">{(metrics.totalDist / 1000).toFixed(2)}</span> km
                    </div>
                  )}
                  {metrics.sprints != null && (
                    <div className="session-card-metric">
                      <span className="session-card-metric-value">{metrics.sprints}</span> sprints
                    </div>
                  )}
                  {metrics.playerLoad != null && (
                    <div className="session-card-metric">
                      <span className="session-card-metric-value">{metrics.playerLoad.toFixed(1)}</span> PL
                    </div>
                  )}
                </div>

                <div className="session-card-footer">
                  <div className="session-card-tags">
                    {s.team_session_name && s.team_name ? (
                      <div className="session-card-tag-row">
                        <TeamSessionTag
                          teamName={s.team_name}
                          sessionName={s.team_session_name}
                          onUnlink={() => unlinkFromTeamSession(s.id)}
                          onClick={(e) => { e.stopPropagation(); navigate(`/app/teams/${s.team_id}/sessions/${s.team_session_id}`); }}
                        />
                      </div>
                    ) : (
                      linkingId === s.id ? (
                        <select
                          autoFocus
                          className="session-link-select"
                          value=""
                          onClick={(e) => e.stopPropagation()}
                          onChange={async (e) => {
                            e.stopPropagation();
                            if (e.target.value) {
                              await linkToTeamSession(s.id, e.target.value);
                            }
                            setLinkingId(null);
                          }}
                          onBlur={() => setLinkingId(null)}
                        >
                          <option value="">Select team session…</option>
                          {myAvailableTeamSessions.map(ts => (
                            <option key={ts.id} value={ts.id}>
                              {ts.team_name} — {ts.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button className="btn-link" onClick={(e) => { e.stopPropagation(); setLinkingId(s.id); }}>
                          Link to team session
                        </button>
                      )
                    )}
                  </div>

                  <div className="session-card-actions">
                    {isOpening && <span className="session-card-file">Opening…</span>}
                    {!isOpening && s.file_name && <span className="session-card-file">{s.file_name}</span>}
                    <button
                      className="btn btn-sm btn-outline btn-danger"
                      onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
