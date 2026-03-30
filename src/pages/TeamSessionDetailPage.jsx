import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTeams } from '../hooks/useTeams';
import { useTeamSessions } from '../hooks/useTeamSessions';
import { useTeamSessionDetail } from '../hooks/useTeamSessionDetail';
import { computeTeamAggregate } from '../hooks/useTeamSessions';
import { useSession } from '../contexts/SessionContext';
import { parseBinary, parseCSV, inferBinaryVersion } from '../utils/parsers';
import { processSession } from '../utils/processing';
import { supabase } from '../lib/supabase';
import { formatDuration } from '../utils/format';
import { exportTeamSessionPDF, exportPlayerTeamSessionPDF } from '../utils/pdfExport';
import ExportMenu from '../components/ExportMenu';

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCSVRow(cells) {
  return cells.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
}

function exportTeamSessionCSV(teamSessionName, sessionDate, playerSessions) {
  const headers = toCSVRow(['Player', ...SUMMARY_COLS.map(c => c.label), 'Source']);
  const rows = playerSessions.map(s => {
    const summary = getSummaryMetrics(s);
    const m = summary?.metrics;
    return toCSVRow([
      s.playerProfile.display_name || 'Unknown',
      ...SUMMARY_COLS.map(c => m ? c.fmt(m[c.key]) : '—'),
      summary?.source || '—',
    ]);
  });
  downloadCSV([headers, ...rows].join('\n'), `${teamSessionName || 'team-session'}_${sessionDate || ''}.csv`);
}

function exportPlayerSessionCSV(teamSessionName, sessionDate, s) {
  const summary = getSummaryMetrics(s);
  const m = summary?.metrics;
  if (!m) return;
  const header = toCSVRow(['Metric', 'Value']);
  const rows = [
    ['Player', s.playerProfile.display_name || 'Unknown'],
    ['Session', teamSessionName || ''],
    ['Date', sessionDate || ''],
    ['Source', summary.source],
    ['Max Speed', `${(m.maxSpeedMs ?? m.maxSpeed / 3.6).toFixed(2)} m/s`],
    ['Avg Speed', `${(m.avgSpeed / 3.6).toFixed(2)} m/s`],
    ['Max Accel', m.maxAccel != null ? `${m.maxAccel.toFixed(1)} m/s²` : '—'],
    ['Avg Accel', m.avgAccel != null ? `${m.avgAccel.toFixed(2)} m/s²` : '—'],
    ['Max Decel', m.maxDecel != null ? `${m.maxDecel.toFixed(1)} m/s²` : '—'],
    ['Distance', m.totalDist != null ? `${m.totalDist.toFixed(0)} m` : '—'],
    ['High Speed Distance', m.highSpeedDist != null ? `${m.highSpeedDist.toFixed(0)} m` : '—'],
    ['Sprint Distance', m.sprintDist != null ? `${m.sprintDist.toFixed(0)} m` : '—'],
    ['Duration', m.duration != null ? formatDuration(m.duration) : '—'],
    ['Time Moving', m.timeMoving != null ? formatDuration(m.timeMoving) : '—'],
    ['Sprints', m.sprints ?? '—'],
    ['Runs', m.runs ?? '—'],
    ['Impacts', m.impacts ?? '—'],
    ['Peak Force', m.peakForce != null ? `${m.peakForce.toFixed(0)} N` : '—'],
    ['Avg Force', m.avgForce != null ? `${m.avgForce.toFixed(0)} N` : '—'],
    ['Peak Power', m.peakPower != null ? `${m.peakPower.toFixed(0)} W` : '—'],
    ['Avg Power', m.avgPower != null ? `${m.avgPower.toFixed(0)} W` : '—'],
    ['Calories', m.totalCal != null ? `${m.totalCal.toFixed(0)} kcal` : '—'],
    ['Work', m.work != null ? `${(m.work / 1000).toFixed(1)} kJ` : '—'],
    ['Player Load', m.playerLoad != null ? `${m.playerLoad.toFixed(0)} au` : '—'],
    ['PL / min', m.plPerMin != null ? `${m.plPerMin.toFixed(1)} au/min` : '—'],
    ['Metabolic Power', m.metabolicPower != null ? `${m.metabolicPower.toFixed(1)} W/kg` : '—'],
  ].map(toCSVRow);
  const name = s.playerProfile.display_name || 'player';
  downloadCSV([header, ...rows].join('\n'), `${teamSessionName || 'team-session'}_${name}_${sessionDate || ''}.csv`);
}

/** Pick the best available metrics for a session: first combined split, else full session. */
function getSummaryMetrics(session) {
  const splits = session.splits || [];
  const combined = splits.find(s => s.isCombined && s.metrics);
  if (combined) return { metrics: combined.metrics, source: combined.name };
  if (session.metrics) return { metrics: session.metrics, source: 'Full session' };
  return null;
}

const SUMMARY_COLS = [
  { label: 'Max Speed', key: 'maxSpeedMs', fmt: v => v != null ? v.toFixed(2) + ' m/s' : '—' },
  { label: 'Avg Speed', key: 'avgSpeed', fmt: v => v != null ? (v / 3.6).toFixed(2) + ' m/s' : '—' },
  { label: 'Distance', key: 'totalDist', fmt: v => v != null ? (v / 1000).toFixed(2) + ' km' : '—' },
  { label: 'Duration', key: 'duration', fmt: v => v != null ? formatDuration(v) : '—' },
  { label: 'Sprints', key: 'sprints', fmt: v => v != null ? String(v) : '—' },
  { label: 'Impacts', key: 'impacts', fmt: v => v != null ? String(v) : '—' },
  { label: 'Player Load', key: 'playerLoad', fmt: v => v != null ? v.toFixed(0) + ' au' : '—' },
  { label: 'Peak Power', key: 'peakPower', fmt: v => v != null ? v.toFixed(0) + ' W' : '—' },
  { label: 'Calories', key: 'totalCal', fmt: v => v != null ? v.toFixed(0) + ' kcal' : '—' },
];

export default function TeamSessionDetailPage() {
  const { teamSessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { myTeams } = useTeams();
  const { myAvailableTeamSessions, updateTeamSession } = useTeamSessions();
  const { playerSessions, loading, refresh } = useTeamSessionDetail(teamSessionId);
  const { loadSessionFromHistory } = useSession();

  const [openingId, setOpeningId] = useState(null);
  const [openError, setOpenError] = useState(null);
  const [unlinkingId, setUnlinkingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTeamId, setEditTeamId] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const managerTeams = myTeams.filter(t => t.is_manager);

  const startEdit = () => {
    setEditName(teamSession?.name || '');
    setEditDate(teamSession?.session_date || '');
    setEditTeamId(teamSession?.team_id || '');
    setEditing(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setEditSubmitting(true);
    await updateTeamSession(teamSessionId, { name: editName, session_date: editDate, team_id: editTeamId });
    setEditSubmitting(false);
    setEditing(false);
  };

  const teamSession = myAvailableTeamSessions.find(ts => ts.id === teamSessionId);
  const teamId = teamSession?.team_id;
  const team = myTeams.find(t => t.id === teamId);
  const isManager = team?.is_manager || false;

  const aggregate = useMemo(() => computeTeamAggregate(playerSessions), [playerSessions]);

  const openSession = async (s, managerMode = false) => {
    if (!s.file_path) { setOpenError('No stored file — cannot open this session.'); return; }
    setOpeningId(s.id);
    setOpenError(null);
    try {
      const { data: blob, error } = await supabase.storage.from('session-files').download(s.file_path);
      if (error) throw new Error(error.message);
      const fileName = s.file_name || '';
      let rows;
      if (/\.bin$/i.test(fileName)) {
        const ab = await blob.arrayBuffer();
        rows = parseBinary(ab, inferBinaryVersion(fileName));
      } else {
        rows = parseCSV(await blob.text());
      }
      const data = processSession(rows);
      loadSessionFromHistory(data, s.thresholds, s.splits || [], s.id, managerMode ? s.profile_snapshot : null);
      navigate('/app/dashboard', {
        state: managerMode
          ? { from: 'teamSession', teamSessionId, managerMode: true }
          : { from: 'sessions' },
      });
    } catch (err) {
      setOpenError(err.message);
      setOpeningId(null);
    }
  };

  const unlinkSession = async (sessionId, e) => {
    e.stopPropagation();
    setUnlinkingId(sessionId);
    await supabase.rpc('manager_unlink_session', { p_session_id: sessionId });
    setExpandedId(null);
    setUnlinkingId(null);
    refresh();
  };

  if (loading) {
    return (
      <div className="loading" style={{ display: 'flex' }}>
        <div className="spinner"></div>
        <p>Loading…</p>
      </div>
    );
  }

  const sessionDate = teamSession?.session_date
    ? new Date(teamSession.session_date + 'T00:00:00').toLocaleDateString(undefined, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : '';

  return (
    <div className="ts-detail-page">
      <div className="ts-detail-header">
        <button className="btn-link back-btn" onClick={() => navigate('/app/sessions', { state: { viewMode: 'team' } })}>
          ← Sessions
        </button>
        {editing ? (
          <form className="ts-edit-form" onSubmit={handleSaveEdit}>
            {managerTeams.length > 1 && (
              <select
                className="filter-select"
                value={editTeamId}
                onChange={e => setEditTeamId(e.target.value)}
                required
              >
                {managerTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              required
              autoFocus
            />
            <input
              type="date"
              value={editDate}
              onChange={e => setEditDate(e.target.value)}
              required
            />
            <div className="ts-edit-actions">
              <button type="submit" className="btn btn-sm btn-accent" disabled={editSubmitting}>
                {editSubmitting ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            <div style={{ flex: 1 }}>
              <h2 className="page-title" style={{ marginBottom: 2 }}>
                {teamSession?.name || 'Team Session'}
              </h2>
              {sessionDate && <div className="text-dim" style={{ fontSize: 13 }}>{sessionDate}</div>}
            </div>
            {isManager && (
              <button className="btn btn-sm btn-outline" onClick={startEdit}>Edit</button>
            )}
            {playerSessions.length > 0 && (
              <ExportMenu
                onExportPDF={() => exportTeamSessionPDF(
                  teamSession?.name, teamSession?.session_date, aggregate, playerSessions, getSummaryMetrics
                )}
                onExportCSV={() => exportTeamSessionCSV(
                  teamSession?.name, teamSession?.session_date, playerSessions
                )}
              />
            )}
          </div>
        )}
      </div>

      {openError && (
        <div className="upload-error" style={{ marginBottom: 16 }}>
          {openError}
          <button onClick={() => setOpenError(null)} className="upload-error-close">&#x2715;</button>
        </div>
      )}

      {playerSessions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No sessions linked yet</div>
          <p className="empty-state-desc">
            {isManager
              ? 'Players can link their sessions to this team session from the Session History page.'
              : 'Link your session to this team session from the Session History page.'}
          </p>
        </div>
      ) : (
        <>
          {/* Team aggregate metrics */}
          {aggregate && (
            <div className="ts-detail-section">
              <h3 className="team-section-title">Team Overview</h3>
              <div className="split-metrics">
                <div className="split-metric">
                  <span className="sm-label">Players</span><br />
                  <span className="sm-value">{aggregate.playerCount}</span>
                </div>
                {aggregate.totalDist != null && (
                  <div className="split-metric">
                    <span className="sm-label">Total Distance</span><br />
                    <span className="sm-value">{(aggregate.totalDist / 1000).toFixed(2)} km</span>
                  </div>
                )}
                {aggregate.avgSpeed != null && (
                  <div className="split-metric">
                    <span className="sm-label">Avg Speed</span><br />
                    <span className="sm-value">{(aggregate.avgSpeed / 3.6).toFixed(2)} m/s</span>
                  </div>
                )}
                {aggregate.maxSpeedMs != null && (
                  <div className="split-metric">
                    <span className="sm-label">Max Speed</span><br />
                    <span className="sm-value">{aggregate.maxSpeedMs.toFixed(2)} m/s</span>
                  </div>
                )}
                {aggregate.avgMaxAccel != null && (
                  <div className="split-metric">
                    <span className="sm-label">Avg Max Accel</span><br />
                    <span className="sm-value">{aggregate.avgMaxAccel.toFixed(1)} m/s²</span>
                  </div>
                )}
                {aggregate.avgMaxDecel != null && (
                  <div className="split-metric">
                    <span className="sm-label">Avg Max Decel</span><br />
                    <span className="sm-value">{aggregate.avgMaxDecel.toFixed(1)} m/s²</span>
                  </div>
                )}
                {aggregate.totalHighSpeedDist != null && (
                  <div className="split-metric">
                    <span className="sm-label">Total Hi-Spd Dist</span><br />
                    <span className="sm-value">{aggregate.totalHighSpeedDist.toFixed(0)} m</span>
                  </div>
                )}
                {aggregate.totalSprintDist != null && (
                  <div className="split-metric">
                    <span className="sm-label">Total Sprint Dist</span><br />
                    <span className="sm-value">{aggregate.totalSprintDist.toFixed(0)} m</span>
                  </div>
                )}
                {aggregate.avgDuration != null && (
                  <div className="split-metric">
                    <span className="sm-label">Avg Duration</span><br />
                    <span className="sm-value">{formatDuration(aggregate.avgDuration)}</span>
                  </div>
                )}
                {aggregate.totalSprints != null && (
                  <div className="split-metric">
                    <span className="sm-label">Total Sprints</span><br />
                    <span className="sm-value">{aggregate.totalSprints}</span>
                  </div>
                )}
                {aggregate.totalImpacts != null && (
                  <div className="split-metric">
                    <span className="sm-label">Total Impacts</span><br />
                    <span className="sm-value">{aggregate.totalImpacts}</span>
                  </div>
                )}
                {aggregate.avgPlayerLoad != null && (
                  <div className="split-metric">
                    <span className="sm-label">Avg Player Load</span><br />
                    <span className="sm-value">{aggregate.avgPlayerLoad.toFixed(0)} au</span>
                  </div>
                )}
                {aggregate.avgPeakPower != null && (
                  <div className="split-metric">
                    <span className="sm-label">Avg Peak Power</span><br />
                    <span className="sm-value">{aggregate.avgPeakPower.toFixed(0)} W</span>
                  </div>
                )}
                {aggregate.avgAvgPower != null && (
                  <div className="split-metric">
                    <span className="sm-label">Avg Power</span><br />
                    <span className="sm-value">{aggregate.avgAvgPower.toFixed(0)} W</span>
                  </div>
                )}
                {aggregate.totalCal != null && (
                  <div className="split-metric">
                    <span className="sm-label">Total Calories</span><br />
                    <span className="sm-value">{aggregate.totalCal.toFixed(0)} kcal</span>
                  </div>
                )}
                {aggregate.totalWork != null && (
                  <div className="split-metric">
                    <span className="sm-label">Total Work</span><br />
                    <span className="sm-value">{(aggregate.totalWork / 1000).toFixed(1)} kJ</span>
                  </div>
                )}
                {aggregate.avgMetabolicPower != null && (
                  <div className="split-metric">
                    <span className="sm-label">Avg Metabolic Pwr</span><br />
                    <span className="sm-value">{aggregate.avgMetabolicPower.toFixed(1)} W/kg</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Comparison table */}
          <div className="ts-detail-section">
            <h3 className="team-section-title">
              {isManager ? 'Player Comparison' : 'Your Session'}
            </h3>
            <div className="ts-comparison-wrap">
              <table className="ts-comparison-table">
                <thead>
                  <tr>
                    <th className="ts-col-player">Player</th>
                    {SUMMARY_COLS.map(c => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {playerSessions.map(s => {
                    const summary = getSummaryMetrics(s);
                    const m = summary?.metrics;
                    const isOwnSession = s.user_id === user?.id;
                    const isExpanded = expandedId === s.id;
                    return (
                      <tr
                        key={s.id}
                        className={`ts-player-row${isOwnSession ? ' ts-player-row-own' : ''}${isExpanded ? ' ts-player-row-expanded' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : s.id)}
                        title="Click to expand"
                      >
                        <td className="ts-col-player">
                          <div className="ts-player-cell">
                            {s.playerProfile.avatar_url ? (
                              <img src={s.playerProfile.avatar_url} alt="" className="ts-player-avatar" />
                            ) : (
                              <div className="ts-player-avatar-placeholder">
                                {(s.playerProfile.display_name || '?').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="ts-player-name">{s.playerProfile.display_name || 'Unknown'}</span>
                            {isOwnSession && <span className="ts-you-badge">you</span>}
                          </div>
                        </td>
                        {SUMMARY_COLS.map(c => (
                          <td key={c.key} className="ts-metric-cell">
                            {m ? c.fmt(m[c.key]) : '—'}
                          </td>
                        ))}
                        <td className="ts-source-cell">
                          {summary ? (
                            <span className={`ts-source-badge${summary.source === 'Full session' ? ' ts-source-full' : ' ts-source-split'}`}>
                              {summary.source}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-dim" style={{ fontSize: 12, marginTop: 8 }}>
              Click a row to expand all metrics · Click the expanded card to open {isManager ? 'the' : 'your'} session
            </p>
          </div>

          {/* Expanded metrics panel */}
          {expandedId && (() => {
            const s = playerSessions.find(p => p.id === expandedId);
            if (!s) return null;
            const summary = getSummaryMetrics(s);
            const m = summary?.metrics;
            const isOwnSession = s.user_id === user?.id;
            const isOpening = openingId === s.id;
            if (!m) return null;
            const canOpen = (isOwnSession || isManager) && s.file_path;
            return (
              <div
                className={`ts-detail-section ts-expanded-panel${canOpen ? ' ts-expanded-panel-clickable' : ''}`}
                onClick={() => canOpen && !isOpening && openSession(s, !isOwnSession)}
                title={canOpen ? 'Click to open session' : undefined}
              >
                <div className="ts-expanded-header">
                  <span className="ts-expanded-title">
                    {s.playerProfile.display_name}
                    {isOwnSession && <span className="ts-you-badge" style={{ marginLeft: 8 }}>you</span>}
                  </span>
                  <span className="text-dim" style={{ fontSize: 12 }}>
                    Metrics from: {summary.source}
                    {isOpening && <span style={{ marginLeft: 8 }}>Opening…</span>}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div onClick={e => e.stopPropagation()}>
                      <ExportMenu
                        onExportPDF={() => exportPlayerTeamSessionPDF(
                          teamSession?.name, teamSession?.session_date, aggregate, s, getSummaryMetrics
                        )}
                        onExportCSV={() => exportPlayerSessionCSV(
                          teamSession?.name, teamSession?.session_date, s
                        )}
                      />
                    </div>
                    {(isManager || isOwnSession) && (
                      <button
                        className="btn btn-sm btn-outline btn-danger"
                        onClick={(e) => unlinkSession(s.id, e)}
                        disabled={unlinkingId === s.id}
                      >
                        {unlinkingId === s.id ? 'Unlinking…' : 'Unlink'}
                      </button>
                    )}
                    <button className="btn btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); setExpandedId(null); }}>Close</button>
                  </div>
                </div>
                <div className="split-metrics" style={{ marginTop: 12 }}>
                  <div className="split-metric"><span className="sm-label">Max Speed</span><br /><span className="sm-value">{(m.maxSpeedMs ?? m.maxSpeed / 3.6).toFixed(2)} m/s</span></div>
                  <div className="split-metric"><span className="sm-label">Avg Speed</span><br /><span className="sm-value">{(m.avgSpeed / 3.6).toFixed(2)} m/s</span></div>
                  <div className="split-metric"><span className="sm-label">Max Accel</span><br /><span className="sm-value">{m.maxAccel?.toFixed(1)} m/s²</span></div>
                  <div className="split-metric"><span className="sm-label">Avg Accel</span><br /><span className="sm-value">{m.avgAccel?.toFixed(2)} m/s²</span></div>
                  <div className="split-metric"><span className="sm-label">Max Decel</span><br /><span className="sm-value">{m.maxDecel?.toFixed(1)} m/s²</span></div>
                  <div className="split-metric"><span className="sm-label">Distance</span><br /><span className="sm-value">{m.totalDist?.toFixed(0)} m</span></div>
                  <div className="split-metric"><span className="sm-label">High Spd Dist</span><br /><span className="sm-value">{m.highSpeedDist?.toFixed(0)} m</span></div>
                  <div className="split-metric"><span className="sm-label">Sprint Dist</span><br /><span className="sm-value">{m.sprintDist?.toFixed(0)} m</span></div>
                  <div className="split-metric"><span className="sm-label">Duration</span><br /><span className="sm-value">{formatDuration(m.duration)}</span></div>
                  <div className="split-metric"><span className="sm-label">Time Moving</span><br /><span className="sm-value">{formatDuration(m.timeMoving)}</span></div>
                  <div className="split-metric"><span className="sm-label">Sprints</span><br /><span className="sm-value">{m.sprints}</span></div>
                  <div className="split-metric"><span className="sm-label">Runs</span><br /><span className="sm-value">{m.runs}</span></div>
                  <div className="split-metric"><span className="sm-label">Impacts</span><br /><span className="sm-value">{m.impacts}</span></div>
                  <div className="split-metric"><span className="sm-label">Peak Force</span><br /><span className="sm-value">{m.peakForce?.toFixed(0)} N</span></div>
                  <div className="split-metric"><span className="sm-label">Avg Force</span><br /><span className="sm-value">{m.avgForce?.toFixed(0)} N</span></div>
                  <div className="split-metric"><span className="sm-label">Peak Power</span><br /><span className="sm-value">{m.peakPower?.toFixed(0)} W</span></div>
                  <div className="split-metric"><span className="sm-label">Avg Power</span><br /><span className="sm-value">{m.avgPower?.toFixed(0)} W</span></div>
                  <div className="split-metric"><span className="sm-label">Calories</span><br /><span className="sm-value">{m.totalCal?.toFixed(0)} kcal</span></div>
                  <div className="split-metric"><span className="sm-label">Work</span><br /><span className="sm-value">{(m.work / 1000).toFixed(1)} kJ</span></div>
                  <div className="split-metric"><span className="sm-label">Player Load</span><br /><span className="sm-value">{m.playerLoad?.toFixed(0)} au</span></div>
                  <div className="split-metric"><span className="sm-label">PL / min</span><br /><span className="sm-value">{m.plPerMin?.toFixed(1)} au/min</span></div>
                  <div className="split-metric"><span className="sm-label">Metabolic Pwr</span><br /><span className="sm-value">{m.metabolicPower?.toFixed(1)} W/kg</span></div>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
