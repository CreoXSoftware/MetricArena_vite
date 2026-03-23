import { useState } from 'react';
import { useSessions } from '../hooks/useSessions';
import { useTeamSessions } from '../hooks/useTeamSessions';
import TeamSessionTag from '../components/TeamSessionTag';
import { formatDuration } from '../utils/format';
import { SPORTS } from '../utils/constants';

export default function SessionHistoryPage() {
  const { sessions, loading, linkToTeamSession, unlinkFromTeamSession, deleteSession } = useSessions();
  const { myAvailableTeamSessions } = useTeamSessions();
  const [linkingId, setLinkingId] = useState(null); // session id currently being linked

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

      {sessions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No sessions yet</div>
          <p className="empty-state-desc">Upload a session file to get started.</p>
        </div>
      ) : (
        <div className="sessions-list">
          {sessions.map(s => {
            const date = new Date(s.session_date);
            const metrics = s.metrics || {};
            return (
              <div key={s.id} className="session-card">
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
                  <span className="session-card-sport">
                    {SPORTS.find(sp => sp.value === s.sport)?.label || s.sport}
                  </span>
                </div>

                <div className="session-card-metrics">
                  {metrics.maxSpeed != null && (
                    <div className="session-card-metric">
                      <span className="session-card-metric-value">{metrics.maxSpeed.toFixed(1)}</span> km/h
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
                        <TeamSessionTag teamName={s.team_name} sessionName={s.team_session_name} />
                        <button
                          className="btn-link btn-link-dim"
                          onClick={() => unlinkFromTeamSession(s.id)}
                        >
                          unlink
                        </button>
                      </div>
                    ) : (
                      linkingId === s.id ? (
                        <select
                          autoFocus
                          className="session-link-select"
                          value=""
                          onChange={async (e) => {
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
                        <button className="btn-link" onClick={() => setLinkingId(s.id)}>
                          Link to team session
                        </button>
                      )
                    )}
                  </div>

                  <div className="session-card-actions">
                    {s.file_name && <span className="session-card-file">{s.file_name}</span>}
                    <button className="btn btn-sm btn-outline btn-danger" onClick={() => deleteSession(s.id)}>
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
