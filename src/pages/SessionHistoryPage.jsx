import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSessions } from '../hooks/useSessions';
import { useTeamSessions } from '../hooks/useTeamSessions';
import { useTeams } from '../hooks/useTeams';
import { useSession } from '../contexts/SessionContext';
import TeamSessionTag from '../components/TeamSessionTag';
import { formatDuration } from '../utils/format';
import { SPORTS, SESSION_TYPES } from '../utils/constants';
import { parseBinary, parseCSV, inferBinaryVersion } from '../utils/parsers';
import { processSession } from '../utils/processing';
import { supabase } from '../lib/supabase';

function getSummaryMetrics(session) {
  const splits = session.splits || [];
  const combined = splits.find(s => s.isCombined && s.metrics);
  if (combined) return { metrics: combined.metrics, source: combined.name };
  if (session.metrics) return { metrics: session.metrics, source: 'Full session' };
  return null;
}

export default function SessionHistoryPage() {
  const { sessions, loading: sessionsLoading, loadingMore: sessionsLoadingMore, hasMore: sessionsHasMore, loadMoreSessions, linkToTeamSession, unlinkFromTeamSession, deleteSession } = useSessions();
  const { myAvailableTeamSessions, loading: teamSessionsLoading, loadingMore: tsLoadingMore, hasMore: tsHasMore, loadMoreTeamSessions, createTeamSession, updateTeamSession, deleteTeamSession, refreshAvailable } = useTeamSessions();
  const { myTeams } = useTeams();
  const { loadSessionFromHistory, activeSport } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [viewMode, setViewMode] = useState(location.state?.viewMode || 'individual');
  const [filterType, setFilterType] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [linkingId, setLinkingId] = useState(null);
  const [pendingLinkSessionId, setPendingLinkSessionId] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [openError, setOpenError] = useState(null);

  // Edit team session
  const [editingTs, setEditingTs] = useState(null); // { id, name, session_date, team_id }
  const [editSubmitting, setEditSubmitting] = useState(false);

  const handleEditTeamSession = async (e) => {
    e.preventDefault();
    setEditSubmitting(true);
    await updateTeamSession(editingTs.id, {
      name: editingTs.name,
      session_date: editingTs.session_date,
      team_id: editingTs.team_id,
    });
    setEditSubmitting(false);
    setEditingTs(null);
  };

  // Create team session form
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDate, setCreateDate] = useState('');
  const [createTeamId, setCreateTeamId] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const managerTeams = myTeams.filter(t => t.is_manager);

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
      navigate('/app/dashboard', { state: { from: 'sessions' } });
    } catch (err) {
      console.error('Failed to open session:', err);
      setOpenError(err.message);
      setOpeningId(null);
    }
  };

  const handleCreateTeamSession = async (e) => {
    e.preventDefault();
    if (!createName.trim() || !createDate || !createTeamId) return;
    setCreateSubmitting(true);
    const { data: newTs } = await createTeamSession(createTeamId, createName.trim(), createDate);
    setCreateSubmitting(false);
    setCreateName('');
    setCreateDate('');
    setCreateTeamId('');
    setShowCreate(false);
    await refreshAvailable();
    if (pendingLinkSessionId && newTs?.id) {
      await linkToTeamSession(pendingLinkSessionId, newTs.id);
      setPendingLinkSessionId(null);
      setViewMode('individual');
    }
  };

  const clearFilters = () => {
    setFilterType('all');
    setFilterTeam('all');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  const hasActiveFilters = filterType !== 'all' || filterTeam !== 'all' || filterDateFrom || filterDateTo;

  const filteredSessions = useMemo(() => sessions.filter(s => {
    if (activeSport !== 'all' && s.sport !== activeSport) return false;
    if (filterType !== 'all' && s.session_type !== filterType) return false;
    if (filterTeam === 'none' && s.team_id) return false;
    if (filterTeam !== 'all' && filterTeam !== 'none' && s.team_id !== filterTeam) return false;
    if (filterDateFrom && s.session_date < filterDateFrom) return false;
    if (filterDateTo && s.session_date > filterDateTo) return false;
    return true;
  }), [sessions, activeSport, filterType, filterTeam, filterDateFrom, filterDateTo]);

  const filteredTeamSessions = useMemo(() => myAvailableTeamSessions
    .filter(ts => {
      if (filterTeam !== 'all' && ts.team_id !== filterTeam) return false;
      if (filterDateFrom && ts.session_date < filterDateFrom) return false;
      if (filterDateTo && ts.session_date > filterDateTo) return false;
      return true;
    })
    .sort((a, b) => {
      const teamCmp = (a.team_name || '').localeCompare(b.team_name || '');
      if (teamCmp !== 0) return teamCmp;
      return b.session_date.localeCompare(a.session_date);
    }),
  [myAvailableTeamSessions, filterTeam, filterDateFrom, filterDateTo]);

  if (sessionsLoading || teamSessionsLoading) {
    return (
      <div className="loading" style={{ display: 'flex' }}>
        <div className="spinner"></div>
        <p>Loading sessions…</p>
      </div>
    );
  }

  return (
    <div className="sessions-page">
      <div className="sessions-page-header">
        <h2 className="page-title">Sessions</h2>
        <div className="sessions-mode-toggle">
          <button
            className={`sessions-mode-btn${viewMode === 'individual' ? ' active' : ''}`}
            onClick={() => { setViewMode('individual'); setFilterTeam('all'); setShowCreate(false); }}
          >
            Individual
          </button>
          <button
            className={`sessions-mode-btn${viewMode === 'team' ? ' active' : ''}`}
            onClick={() => { setViewMode('team'); setFilterType('all'); }}
          >
            Team Sessions
          </button>
        </div>
      </div>

      <div className="sessions-filters">
        {viewMode === 'individual' && (
          <>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="filter-select">
              <option value="all">Game &amp; Practice</option>
              {SESSION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {myTeams.length > 0 && (
              <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} className="filter-select">
                <option value="all">All teams</option>
                <option value="none">Unlinked</option>
                {myTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </>
        )}
        {viewMode === 'team' && myTeams.length > 0 && (
          <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} className="filter-select">
            <option value="all">All teams</option>
            {myTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <input
          type="date"
          value={filterDateFrom}
          onChange={e => setFilterDateFrom(e.target.value)}
          className="filter-date"
          title="From date"
        />
        <span className="filter-date-sep">–</span>
        <input
          type="date"
          value={filterDateTo}
          onChange={e => setFilterDateTo(e.target.value)}
          className="filter-date"
          title="To date"
        />
        {hasActiveFilters && (
          <button className="btn-link filter-clear" onClick={clearFilters}>Clear</button>
        )}
      </div>

      {viewMode === 'individual' && (
        <div className="sessions-add-row">
          <button className="sessions-add-btn" onClick={() => navigate('/app/upload')} title="Upload session">
            <span>+</span>
          </button>
        </div>
      )}

      {viewMode === 'team' && managerTeams.length > 0 && (
        <div className="sessions-add-row">
          <button
            className={`sessions-add-btn${showCreate ? ' sessions-add-btn-active' : ''}`}
            onClick={() => setShowCreate(v => !v)}
            title={showCreate ? 'Cancel' : 'New team session'}
          >
            <span>+</span>
          </button>
        </div>
      )}

      {viewMode === 'team' && showCreate && (
        <form className="teams-inline-form" onSubmit={handleCreateTeamSession}>
          {pendingLinkSessionId && (
            <div className="session-link-pending-note">
              After creating, your session will be automatically linked.
            </div>
          )}
          <select
            value={createTeamId}
            onChange={e => setCreateTeamId(e.target.value)}
            className="filter-select"
            required
          >
            <option value="">Select team…</option>
            {managerTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input
            type="text"
            placeholder="Session name (e.g. Bats vs Rats)"
            value={createName}
            onChange={e => setCreateName(e.target.value)}
            required
            autoFocus
          />
          <input
            type="date"
            value={createDate}
            onChange={e => setCreateDate(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-accent" disabled={createSubmitting}>
            {createSubmitting ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      {openError && (
        <div className="upload-error" style={{ marginBottom: '0' }}>
          {openError}
          <button onClick={() => setOpenError(null)} className="upload-error-close">&#x2715;</button>
        </div>
      )}

      {viewMode === 'individual' ? (
        <>
          {filteredSessions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">
                {sessions.length === 0 ? 'No sessions yet' : 'No sessions match filters'}
              </div>
              {sessions.length === 0 && (
                <p className="empty-state-desc">Upload a session file to get started.</p>
              )}
            </div>
          ) : (
            <div className="sessions-list">
              {filteredSessions.map(s => {
                const date = new Date(s.session_date);
                const summary = getSummaryMetrics(s);
                const m = summary?.metrics || {};
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
                          {' · '}{formatDuration(m.duration || s.duration || 0)}
                          {summary && (
                            <span className={`session-source-badge${summary.source === 'Full session' ? ' session-source-full' : ' session-source-combined'}`}>
                              {summary.source}
                            </span>
                          )}
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
                      {(m.maxSpeedMs ?? m.maxSpeed) != null && (
                        <div className="session-card-metric">
                          <span className="session-card-metric-label">Max spd</span>
                          <span className="session-card-metric-value">
                            {m.maxSpeedMs != null ? m.maxSpeedMs.toFixed(2) : (m.maxSpeed / 3.6).toFixed(2)}
                          </span>
                          <span className="session-card-metric-unit">m/s</span>
                        </div>
                      )}
                      {m.avgSpeed != null && (
                        <div className="session-card-metric">
                          <span className="session-card-metric-label">Avg spd</span>
                          <span className="session-card-metric-value">{(m.avgSpeed / 3.6).toFixed(2)}</span>
                          <span className="session-card-metric-unit">m/s</span>
                        </div>
                      )}
                      {m.totalDist != null && (
                        <div className="session-card-metric">
                          <span className="session-card-metric-label">Distance</span>
                          <span className="session-card-metric-value">{(m.totalDist / 1000).toFixed(2)}</span>
                          <span className="session-card-metric-unit">km</span>
                        </div>
                      )}
                      {m.sprints != null && (
                        <div className="session-card-metric">
                          <span className="session-card-metric-label">Sprints</span>
                          <span className="session-card-metric-value">{m.sprints}</span>
                        </div>
                      )}
                      {m.impacts != null && (
                        <div className="session-card-metric">
                          <span className="session-card-metric-label">Impacts</span>
                          <span className="session-card-metric-value">{m.impacts}</span>
                        </div>
                      )}
                      {m.playerLoad != null && (
                        <div className="session-card-metric">
                          <span className="session-card-metric-label">Player load</span>
                          <span className="session-card-metric-value">{m.playerLoad.toFixed(0)}</span>
                          <span className="session-card-metric-unit">au</span>
                        </div>
                      )}
                      {m.peakPower != null && (
                        <div className="session-card-metric">
                          <span className="session-card-metric-label">Peak power</span>
                          <span className="session-card-metric-value">{m.peakPower.toFixed(0)}</span>
                          <span className="session-card-metric-unit">W</span>
                        </div>
                      )}
                      {m.totalCal != null && (
                        <div className="session-card-metric">
                          <span className="session-card-metric-label">Calories</span>
                          <span className="session-card-metric-value">{m.totalCal.toFixed(0)}</span>
                          <span className="session-card-metric-unit">kcal</span>
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
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/app/sessions/team/${s.team_session_id}`);
                              }}
                            />
                          </div>
                        ) : linkingId === s.id ? (
                          <div
                            className="session-link-dropdown"
                            tabIndex={-1}
                            ref={el => el && el.focus()}
                            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setLinkingId(null); }}
                            onClick={e => e.stopPropagation()}
                          >
                            {(() => {
                              const matching = myAvailableTeamSessions.filter(ts => ts.session_date === s.session_date.slice(0, 10));
                              return matching.length > 0 ? matching.map(ts => (
                                <button
                                  key={ts.id}
                                  className="session-link-option"
                                  onMouseDown={async (e) => {
                                    e.preventDefault();
                                    await linkToTeamSession(s.id, ts.id);
                                    setLinkingId(null);
                                  }}
                                >
                                  <span className="session-link-option-team">{ts.team_name}</span>
                                  <span className="session-link-option-name">{ts.name}</span>
                                </button>
                              )) : (
                                <div className="session-link-option-empty">No team sessions on this date</div>
                              );
                            })()}
                            <button
                              className="session-link-option session-link-option-create"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setPendingLinkSessionId(s.id);
                                setViewMode('team');
                                setShowCreate(true);
                                setLinkingId(null);
                              }}
                            >
                              + Create new team session…
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn-link"
                            onClick={(e) => { e.stopPropagation(); setLinkingId(s.id); }}
                          >
                            Link to team session
                          </button>
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
          {sessionsHasMore && (
            <button
              className="btn btn-outline load-more-btn"
              onClick={loadMoreSessions}
              disabled={sessionsLoadingMore}
            >
              {sessionsLoadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      ) : (
        <>
          {filteredTeamSessions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-title">
                {myAvailableTeamSessions.length === 0 ? 'No team sessions yet' : 'No team sessions match filters'}
              </div>
              {myAvailableTeamSessions.length === 0 && (
                <p className="empty-state-desc">Team sessions are created by managers from the Sessions page.</p>
              )}
            </div>
          ) : (
            <div className="sessions-list">
              {filteredTeamSessions.map(ts => {
                const isManager = managerTeams.some(t => t.id === ts.team_id);
                const isEditing = editingTs?.id === ts.id;
                return (
                  <div
                    key={ts.id}
                    className={`session-card${isEditing ? '' : ' session-card-clickable'}`}
                    onClick={() => !isEditing && navigate(`/app/sessions/team/${ts.id}`)}
                  >
                    {isEditing ? (
                      <form className="ts-edit-form" onSubmit={handleEditTeamSession} onClick={e => e.stopPropagation()}>
                        <select
                          className="filter-select"
                          value={editingTs.team_id}
                          onChange={e => setEditingTs(v => ({ ...v, team_id: e.target.value }))}
                          required
                        >
                          {managerTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <input
                          type="text"
                          value={editingTs.name}
                          onChange={e => setEditingTs(v => ({ ...v, name: e.target.value }))}
                          required
                          autoFocus
                        />
                        <input
                          type="date"
                          value={editingTs.session_date}
                          onChange={e => setEditingTs(v => ({ ...v, session_date: e.target.value }))}
                          required
                        />
                        <div className="ts-edit-actions">
                          <button type="submit" className="btn btn-sm btn-accent" disabled={editSubmitting}>
                            {editSubmitting ? 'Saving…' : 'Save'}
                          </button>
                          <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditingTs(null)}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="session-card-header">
                          <div>
                            <div className="session-card-date">
                              <button
                                className="team-chip"
                                onClick={e => { e.stopPropagation(); navigate(`/app/teams/${ts.team_id}`); }}
                              >
                                {ts.team_name}
                              </button>
                              {ts.name}
                            </div>
                            <div className="session-card-time">
                              {new Date(ts.session_date + 'T00:00:00').toLocaleDateString(undefined, {
                                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                              })}
                            </div>
                          </div>
                        </div>
                        {ts.aggregateMetrics && (
                          <div className="session-card-metrics">
                            <div className="session-card-metric">
                              <span className="session-card-metric-label">Players</span>
                              <span className="session-card-metric-value">{ts.aggregateMetrics.playerCount}</span>
                            </div>
                            {ts.aggregateMetrics.totalDist != null && (
                              <div className="session-card-metric">
                                <span className="session-card-metric-label">Total dist</span>
                                <span className="session-card-metric-value">{(ts.aggregateMetrics.totalDist / 1000).toFixed(1)}</span>
                                <span className="session-card-metric-unit">km</span>
                              </div>
                            )}
                            {ts.aggregateMetrics.avgSpeed != null && (
                              <div className="session-card-metric">
                                <span className="session-card-metric-label">Avg speed</span>
                                <span className="session-card-metric-value">{(ts.aggregateMetrics.avgSpeed / 3.6).toFixed(2)}</span>
                                <span className="session-card-metric-unit">m/s</span>
                              </div>
                            )}
                            {ts.aggregateMetrics.maxSpeedMs != null && (
                              <div className="session-card-metric">
                                <span className="session-card-metric-label">Max speed</span>
                                <span className="session-card-metric-value">{ts.aggregateMetrics.maxSpeedMs.toFixed(2)}</span>
                                <span className="session-card-metric-unit">m/s</span>
                              </div>
                            )}
                            {ts.aggregateMetrics.totalSprints != null && (
                              <div className="session-card-metric">
                                <span className="session-card-metric-label">Sprints</span>
                                <span className="session-card-metric-value">{ts.aggregateMetrics.totalSprints}</span>
                              </div>
                            )}
                            {ts.aggregateMetrics.totalImpacts != null && (
                              <div className="session-card-metric">
                                <span className="session-card-metric-label">Impacts</span>
                                <span className="session-card-metric-value">{ts.aggregateMetrics.totalImpacts}</span>
                              </div>
                            )}
                            {ts.aggregateMetrics.avgPlayerLoad != null && (
                              <div className="session-card-metric">
                                <span className="session-card-metric-label">Avg load</span>
                                <span className="session-card-metric-value">{ts.aggregateMetrics.avgPlayerLoad.toFixed(0)}</span>
                                <span className="session-card-metric-unit">au</span>
                              </div>
                            )}
                          </div>
                        )}
                        {isManager && (
                          <div className="session-card-footer">
                            <div />
                            <div className="session-card-actions">
                              <button
                                className="btn btn-sm btn-outline"
                                onClick={(e) => { e.stopPropagation(); setEditingTs({ id: ts.id, name: ts.name, session_date: ts.session_date, team_id: ts.team_id }); }}
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-sm btn-outline btn-danger"
                                onClick={(e) => { e.stopPropagation(); deleteTeamSession(ts.id); }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {tsHasMore && (
            <button
              className="btn btn-outline load-more-btn"
              onClick={loadMoreTeamSessions}
              disabled={tsLoadingMore}
            >
              {tsLoadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
