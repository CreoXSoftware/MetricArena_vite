import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAdmin } from '../hooks/useAdmin';
import { SPORTS, SESSION_TYPES } from '../utils/constants';
import { formatDuration } from '../utils/format';

/* ── SVG icon helpers ──────────────────────────────────────────────── */

/** Blue circle with white checkmark — player identity verified */
function VerifiedIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="8" fill="#1d9bf0"/>
      <path d="M4.8 8.2l2 2.1L11.2 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/** Blue shield with white checkmark — session data verified */
function SessionVerifiedIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M8 1L2 4v4c0 3.5 2.5 6.8 6 7.6 3.5-.8 6-4.1 6-7.6V4L8 1z" fill="#1d9bf0"/>
      <path d="M5.3 8.2l1.8 1.8L10.7 6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/** Shield inheriting currentColor — for toggle buttons */
function VerifiedToggleIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M8 1L2 4v4c0 3.5 2.5 6.8 6 7.6 3.5-.8 6-4.1 6-7.6V4L8 1z" fill="currentColor"/>
      <path d="M5.3 8.2l1.8 1.8L10.7 6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ── Main component ────────────────────────────────────────────────── */

export default function AdminPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const {
    players, playersLoading, fetchPlayers, setPlayerVerified,
    sessions, sessionsLoading, sessionsHasMore, fetchSessions, setSessionVerified,
    teams, teamsLoading, fetchTeams, setTeamVerified,
  } = useAdmin();

  const [tab, setTab] = useState('players');

  // Players tab state
  const [playerQuery, setPlayerQuery] = useState('');
  const playerDebounce = useRef(null);

  // Sessions tab state
  const [sessionPlayerQuery, setSessionPlayerQuery] = useState('');
  const [sessionSport, setSessionSport] = useState('all');
  const [sessionType, setSessionType] = useState('all');
  const [sessionDateFrom, setSessionDateFrom] = useState('');
  const [sessionDateTo, setSessionDateTo] = useState('');
  const [sessionVerifiedOnly, setSessionVerifiedOnly] = useState(false);
  const sessionDebounce = useRef(null);

  // Teams tab state
  const [teamQuery, setTeamQuery] = useState('');
  const teamDebounce = useRef(null);

  // Redirect non-admins
  useEffect(() => {
    if (profile && profile.role !== 'admin') {
      navigate('/app/leaderboard', { replace: true });
    }
  }, [profile, navigate]);

  // Initial load
  useEffect(() => {
    if (profile?.role === 'admin') {
      fetchPlayers('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const handlePlayerSearch = useCallback((q) => {
    setPlayerQuery(q);
    clearTimeout(playerDebounce.current);
    playerDebounce.current = setTimeout(() => fetchPlayers(q), 300);
  }, [fetchPlayers]);

  const handleTeamSearch = useCallback((q) => {
    setTeamQuery(q);
    clearTimeout(teamDebounce.current);
    teamDebounce.current = setTimeout(() => fetchTeams(q), 300);
  }, [fetchTeams]);

  const buildSessionFilters = useCallback(() => ({
    sport: sessionSport,
    sessionType,
    dateFrom: sessionDateFrom || null,
    dateTo: sessionDateTo || null,
    verifiedOnly: sessionVerifiedOnly,
  }), [sessionSport, sessionType, sessionDateFrom, sessionDateTo, sessionVerifiedOnly]);

  const fetchSessionsWithFilters = useCallback((reset = true) => {
    clearTimeout(sessionDebounce.current);
    sessionDebounce.current = setTimeout(() => fetchSessions(buildSessionFilters(), reset), 300);
  }, [fetchSessions, buildSessionFilters]);

  // Load data when tab switches
  useEffect(() => {
    if (tab === 'sessions') fetchSessionsWithFilters(true);
    if (tab === 'teams') fetchTeams('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Re-fetch when session filters change
  useEffect(() => {
    if (tab === 'sessions') fetchSessionsWithFilters(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionSport, sessionType, sessionDateFrom, sessionDateTo, sessionVerifiedOnly]);

  if (!profile || profile.role !== 'admin') return null;

  const filteredSessions = sessionPlayerQuery.trim().length > 0
    ? sessions.filter(s =>
        (s.playerProfile.display_name || '').toLowerCase().includes(sessionPlayerQuery.toLowerCase())
      )
    : sessions;

  return (
    <div className="admin-page">
      <h2 className="admin-page-title">Admin Panel</h2>

      <div className="admin-tabs">
        <button className={`admin-tab${tab === 'players' ? ' active' : ''}`} onClick={() => setTab('players')}>
          Players
        </button>
        <button className={`admin-tab${tab === 'sessions' ? ' active' : ''}`} onClick={() => setTab('sessions')}>
          Sessions
        </button>
        <button className={`admin-tab${tab === 'teams' ? ' active' : ''}`} onClick={() => setTab('teams')}>
          Teams
        </button>
      </div>

      {/* ── Players Tab ── */}
      {tab === 'players' && (
        <>
          <div className="admin-search-bar">
            <input
              type="text"
              className="admin-search-input"
              placeholder="Search players by name…"
              value={playerQuery}
              onChange={e => handlePlayerSearch(e.target.value)}
            />
          </div>

          {playersLoading ? (
            <div className="loading" style={{ display: 'flex', paddingTop: 24 }}>
              <div className="spinner"></div>
              <p>Loading players…</p>
            </div>
          ) : players.length === 0 ? (
            <div className="admin-empty">No players found.</div>
          ) : (
            <div className="admin-list">
              {players.map(p => (
                <div key={p.id} className="admin-list-item">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="admin-item-avatar" />
                  ) : (
                    <div className="admin-item-avatar-placeholder">
                      {(p.display_name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="admin-item-info">
                    <div className="admin-item-name">
                      {p.display_name || '(no name)'}
                      {p.is_verified && <span className="verified-badge" title="Verified player"><VerifiedIcon /></span>}
                      {p.role === 'admin' && (
                        <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 6, fontWeight: 600 }}>admin</span>
                      )}
                    </div>
                    <div className="admin-item-meta">
                      Joined {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="admin-item-actions">
                    {p.is_verified ? (
                      <button className="btn-unverify" onClick={() => setPlayerVerified(p.id, false)}>Unverify</button>
                    ) : (
                      <button className="btn-verify" onClick={() => setPlayerVerified(p.id, true)}>Verify</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Sessions Tab ── */}
      {tab === 'sessions' && (
        <>
          <div className="admin-filter-row">
            <input
              type="text"
              className="admin-search-input"
              placeholder="Filter by player name…"
              value={sessionPlayerQuery}
              onChange={e => setSessionPlayerQuery(e.target.value)}
              style={{ maxWidth: 220 }}
            />
            <select className="admin-filter-select" value={sessionSport} onChange={e => setSessionSport(e.target.value)}>
              <option value="all">All Sports</option>
              {SPORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select className="admin-filter-select" value={sessionType} onChange={e => setSessionType(e.target.value)}>
              <option value="all">All Types</option>
              {SESSION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input type="date" className="admin-filter-select" value={sessionDateFrom} onChange={e => setSessionDateFrom(e.target.value)} title="From date" />
            <input type="date" className="admin-filter-select" value={sessionDateTo} onChange={e => setSessionDateTo(e.target.value)} title="To date" />
            <button
              className={`leaderboard-verified-toggle${sessionVerifiedOnly ? ' active' : ''}`}
              onClick={() => setSessionVerifiedOnly(v => !v)}
            >
              <VerifiedToggleIcon />
              Verified only
            </button>
          </div>

          {sessionsLoading ? (
            <div className="loading" style={{ display: 'flex', paddingTop: 24 }}>
              <div className="spinner"></div>
              <p>Loading sessions…</p>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="admin-empty">No sessions found.</div>
          ) : (
            <>
              <div className="admin-list">
                {filteredSessions.map(s => {
                  const date = new Date(s.session_date);
                  const m = s.metrics || {};
                  const maxSpd = (m.maxSpeedMs ?? m.maxSpeed) != null ? (m.maxSpeedMs ?? m.maxSpeed).toFixed(2) : null;
                  const dist = m.totalDist != null ? (m.totalDist / 1000).toFixed(2) : null;
                  return (
                    <div key={s.id} className="admin-list-item">
                      {s.playerProfile.avatar_url ? (
                        <img src={s.playerProfile.avatar_url} alt="" className="admin-item-avatar" />
                      ) : (
                        <div className="admin-item-avatar-placeholder">
                          {(s.playerProfile.display_name || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="admin-item-info">
                        <div className="admin-item-name">
                          {s.playerProfile.display_name || 'Unknown'}
                          {s.is_verified && <span className="session-verified-badge"><SessionVerifiedIcon /> Verified</span>}
                        </div>
                        <div className="admin-item-meta">
                          {date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' · '}
                          <span className="admin-session-sport">{s.sport}</span>
                          {' · '}
                          {SESSION_TYPES.find(t => t.value === s.session_type)?.label || s.session_type}
                          {s.duration > 0 && ` · ${formatDuration(s.duration)}`}
                          {maxSpd && ` · ${maxSpd} m/s max`}
                          {dist && ` · ${dist} km`}
                        </div>
                      </div>
                      <div className="admin-item-actions">
                        {s.is_verified ? (
                          <button className="btn-unverify" onClick={() => setSessionVerified(s.id, false)}>Unverify</button>
                        ) : (
                          <button className="btn-verify" onClick={() => setSessionVerified(s.id, true)}>Verify</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {sessionsHasMore && (
                <div className="admin-load-more">
                  <button className="btn btn-outline" onClick={() => fetchSessions(buildSessionFilters(), false)} disabled={sessionsLoading}>
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Teams Tab ── */}
      {tab === 'teams' && (
        <>
          <div className="admin-search-bar">
            <input
              type="text"
              className="admin-search-input"
              placeholder="Search teams by name…"
              value={teamQuery}
              onChange={e => handleTeamSearch(e.target.value)}
            />
          </div>

          {teamsLoading ? (
            <div className="loading" style={{ display: 'flex', paddingTop: 24 }}>
              <div className="spinner"></div>
              <p>Loading teams…</p>
            </div>
          ) : teams.length === 0 ? (
            <div className="admin-empty">No teams found.</div>
          ) : (
            <div className="admin-list">
              {teams.map(t => (
                <div key={t.id} className="admin-list-item">
                  <div className="admin-item-avatar-placeholder">
                    {(t.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="admin-item-info">
                    <div className="admin-item-name">
                      {t.name}
                      {t.is_verified && <span className="verified-badge" title="Verified team"><VerifiedIcon /></span>}
                    </div>
                    <div className="admin-item-meta">
                      <span className="admin-session-sport">{t.sport}</span>
                      {' · '}{t.member_count ?? 0} members
                      {' · '}Created {new Date(t.created_at).toLocaleDateString()}
                      {!t.is_public && <span style={{ marginLeft: 6, color: 'var(--text-dim)', fontSize: 10 }}>Private</span>}
                    </div>
                  </div>
                  <div className="admin-item-actions">
                    {t.is_verified ? (
                      <button className="btn-unverify" onClick={() => setTeamVerified(t.id, false)}>Unverify</button>
                    ) : (
                      <button className="btn-verify" onClick={() => setTeamVerified(t.id, true)}>Verify</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
