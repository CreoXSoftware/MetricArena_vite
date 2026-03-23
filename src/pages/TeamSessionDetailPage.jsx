import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTeams } from '../hooks/useTeams';
import { useTeamSessions } from '../hooks/useTeamSessions';
import { useTeamSessionDetail } from '../hooks/useTeamSessionDetail';
import { useSession } from '../contexts/SessionContext';
import { parseBinary, parseCSV, inferBinaryVersion } from '../utils/parsers';
import { processSession } from '../utils/processing';
import { supabase } from '../lib/supabase';
import { formatDuration } from '../utils/format';

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
  const { teamId, teamSessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { myTeams } = useTeams();
  const { teamSessions } = useTeamSessions(teamId);
  const { playerSessions, loading } = useTeamSessionDetail(teamSessionId);
  const { loadSessionFromHistory } = useSession();

  const [openingId, setOpeningId] = useState(null);
  const [openError, setOpenError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const team = myTeams.find(t => t.id === teamId);
  const isCoach = team?.is_coach || false;
  const teamSession = teamSessions.find(ts => ts.id === teamSessionId);

  const openSession = async (s) => {
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
      loadSessionFromHistory(data, s.thresholds, s.splits || [], s.id);
      navigate('/app/dashboard');
    } catch (err) {
      setOpenError(err.message);
      setOpeningId(null);
    }
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
        <button className="btn btn-outline btn-sm" onClick={() => navigate(`/app/teams/${teamId}`)}>
          ← Back
        </button>
        <div>
          <h2 className="page-title" style={{ marginBottom: 2 }}>
            {teamSession?.name || 'Team Session'}
          </h2>
          {sessionDate && <div className="text-dim" style={{ fontSize: 13 }}>{sessionDate}</div>}
        </div>
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
            {isCoach
              ? 'Players can link their sessions to this team session from the Session History page.'
              : 'Link your session to this team session from the Session History page.'}
          </p>
        </div>
      ) : (
        <>
          {/* Comparison table */}
          <div className="ts-detail-section">
            <h3 className="team-section-title">
              {isCoach ? 'Player Comparison' : 'Your Session'}
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
                    const isOpening = openingId === s.id;
                    const isExpanded = expandedId === s.id;
                    return (
                      <tr
                        key={s.id}
                        className={`ts-player-row${isOwnSession ? ' ts-player-row-own' : ''}${isExpanded ? ' ts-player-row-expanded' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : s.id)}
                        title={isOwnSession ? 'Click to expand · Double-click to open session' : 'Click to expand'}
                        onDoubleClick={() => isOwnSession && !isOpening && openSession(s)}
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
              Click a row to expand all metrics · Double-click your own row to open in dashboard
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
            return (
              <div className="ts-detail-section ts-expanded-panel">
                <div className="ts-expanded-header">
                  <span className="ts-expanded-title">
                    {s.playerProfile.display_name}
                    {isOwnSession && <span className="ts-you-badge" style={{ marginLeft: 8 }}>you</span>}
                  </span>
                  <span className="text-dim" style={{ fontSize: 12 }}>Metrics from: {summary.source}</span>
                  {isOwnSession && (
                    <button
                      className="btn btn-sm btn-accent"
                      onClick={() => openSession(s)}
                      disabled={isOpening || !s.file_path}
                      title={!s.file_path ? 'No stored file' : undefined}
                    >
                      {isOpening ? 'Opening…' : 'Open Session'}
                    </button>
                  )}
                  <button className="btn btn-sm btn-outline" onClick={() => setExpandedId(null)}>Close</button>
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
