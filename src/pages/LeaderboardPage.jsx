import { useState, useEffect, useCallback, useRef } from 'react';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useTeams } from '../hooks/useTeams';
import { useSession } from '../contexts/SessionContext';
import { useAuth } from '../contexts/AuthContext';
import {
  SPORTS, SESSION_TYPES,
  LEADERBOARD_METRICS, TEAM_LEADERBOARD_METRICS, AGGREGATION_MODES,
  COUNTRIES, POSITIONS_BY_SPORT,
} from '../utils/constants';

export default function LeaderboardPage() {
  const { user } = useAuth();
  const { activeSport } = useSession();
  const { myTeams, loading: teamsLoading } = useTeams();
  const { entries, loading, loadingMore, hasMore, fetchIndividual, fetchTeam, clear } = useLeaderboard();

  // View mode
  const [viewMode, setViewMode] = useState('individuals');

  // Individual filters
  const [scope, setScope] = useState('all'); // 'all' | team id
  const [metric, setMetric] = useState(LEADERBOARD_METRICS[0].value);
  const [aggregation, setAggregation] = useState('best');
  const [sessionType, setSessionType] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [positions, setPositions] = useState([]);
  const [province, setProvince] = useState('');
  const [country, setCountry] = useState('');

  // Team filters
  const [teamMetric, setTeamMetric] = useState(TEAM_LEADERBOARD_METRICS[0].value);
  const [teamSessionType, setTeamSessionType] = useState('all');
  const [teamDateFrom, setTeamDateFrom] = useState('');
  const [teamDateTo, setTeamDateTo] = useState('');

  // Track current params for load-more
  const paramsRef = useRef(null);

  const fetchData = useCallback(() => {
    if (viewMode === 'individuals') {
      const params = {
        metric,
        aggregation,
        teamId: scope !== 'all' ? scope : null,
        sport: activeSport,
        sessionType,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        ageMin: ageMin ? parseInt(ageMin, 10) : null,
        ageMax: ageMax ? parseInt(ageMax, 10) : null,
        positions: positions.length > 0 ? positions : null,
        province: province || null,
        country: country || null,
      };
      paramsRef.current = { mode: 'individual', params };
      fetchIndividual(params, true);
    } else {
      const tmDef = TEAM_LEADERBOARD_METRICS.find(m => m.value === teamMetric);
      const params = {
        metric: teamMetric,
        aggType: tmDef?.agg || 'avg',
        sport: activeSport,
        sessionType: teamSessionType,
        dateFrom: teamDateFrom || null,
        dateTo: teamDateTo || null,
      };
      paramsRef.current = { mode: 'team', params };
      fetchTeam(params, true);
    }
  }, [viewMode, metric, aggregation, scope, activeSport, sessionType, dateFrom, dateTo,
      ageMin, ageMax, positions, province, country, teamMetric, teamSessionType,
      teamDateFrom, teamDateTo, fetchIndividual, fetchTeam]);

  // Fetch on filter change (debounced for text inputs)
  const debounceRef = useRef(null);
  useEffect(() => {
    if (teamsLoading) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchData, 200);
    return () => clearTimeout(debounceRef.current);
  }, [fetchData, teamsLoading]);

  const handleLoadMore = () => {
    if (!paramsRef.current) return;
    if (paramsRef.current.mode === 'individual') {
      fetchIndividual({ ...paramsRef.current.params, offset: entries.length }, false);
    } else {
      fetchTeam({ ...paramsRef.current.params, offset: entries.length }, false);
    }
  };

  const currentMetricDef = viewMode === 'individuals'
    ? LEADERBOARD_METRICS.find(m => m.value === metric)
    : TEAM_LEADERBOARD_METRICS.find(m => m.value === teamMetric);

  const clearFilters = () => {
    if (viewMode === 'individuals') {
      setScope('all');
      setAggregation('best');
      setSessionType('all');
      setDateFrom('');
      setDateTo('');
      setAgeMin('');
      setAgeMax('');
      setPositions([]);
      setProvince('');
      setCountry('');
    } else {
      setTeamSessionType('all');
      setTeamDateFrom('');
      setTeamDateTo('');
    }
  };

  const hasActiveFilters = viewMode === 'individuals'
    ? (scope !== 'all' || aggregation !== 'best' || sessionType !== 'all' || dateFrom || dateTo || ageMin || ageMax || positions.length > 0 || province || country)
    : (teamSessionType !== 'all' || teamDateFrom || teamDateTo);

  return (
    <div className="leaderboard-page">
      {/* Header */}
      <div className="leaderboard-page-header">
        <h2 className="page-title">Leaderboard</h2>
        <div className="sessions-mode-toggle">
          <button
            className={`sessions-mode-btn${viewMode === 'individuals' ? ' active' : ''}`}
            onClick={() => { clear(); setViewMode('individuals'); }}
          >
            Individuals
          </button>
          <button
            className={`sessions-mode-btn${viewMode === 'teams' ? ' active' : ''}`}
            onClick={() => { clear(); setViewMode('teams'); }}
          >
            Teams
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="leaderboard-filters">
        {viewMode === 'individuals' ? (
          <>
            <select className="filter-select" value={metric} onChange={e => setMetric(e.target.value)}>
              {LEADERBOARD_METRICS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <select className="filter-select" value={aggregation} onChange={e => setAggregation(e.target.value)}>
              {AGGREGATION_MODES.map(a => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            <select className="filter-select" value={scope} onChange={e => setScope(e.target.value)}>
              <option value="all">All Players</option>
              {myTeams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <select className="filter-select" value={sessionType} onChange={e => setSessionType(e.target.value)}>
              <option value="all">All Types</option>
              {SESSION_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </>
        ) : (
          <>
            <select className="filter-select" value={teamMetric} onChange={e => setTeamMetric(e.target.value)}>
              {TEAM_LEADERBOARD_METRICS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <select className="filter-select" value={teamSessionType} onChange={e => setTeamSessionType(e.target.value)}>
              <option value="all">All Types</option>
              {SESSION_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </>
        )}
        {hasActiveFilters && (
          <button className="btn-link filter-clear" onClick={clearFilters}>Clear</button>
        )}
      </div>

      {/* Date range + advanced filters */}
      <div className="leaderboard-filters">
        <input
          type="date"
          className="filter-date"
          value={viewMode === 'individuals' ? dateFrom : teamDateFrom}
          onChange={e => viewMode === 'individuals' ? setDateFrom(e.target.value) : setTeamDateFrom(e.target.value)}
          title="From date"
        />
        <span className="filter-date-sep">–</span>
        <input
          type="date"
          className="filter-date"
          value={viewMode === 'individuals' ? dateTo : teamDateTo}
          onChange={e => viewMode === 'individuals' ? setDateTo(e.target.value) : setTeamDateTo(e.target.value)}
          title="To date"
        />
        {viewMode === 'individuals' && (
          <button
            className="leaderboard-more-toggle"
            onClick={() => setShowMoreFilters(v => !v)}
          >
            {showMoreFilters ? 'Less filters' : 'More filters'}
          </button>
        )}
      </div>

      {viewMode === 'individuals' && showMoreFilters && (
        <div className="leaderboard-adv-filters">
          <input
            type="number"
            className="filter-input"
            placeholder="Age min"
            value={ageMin}
            onChange={e => setAgeMin(e.target.value)}
            min="1"
            max="99"
          />
          <input
            type="number"
            className="filter-input"
            placeholder="Age max"
            value={ageMax}
            onChange={e => setAgeMax(e.target.value)}
            min="1"
            max="99"
          />
          {(() => {
            const sportKey = activeSport === 'all' ? null : activeSport;
            const availablePositions = sportKey ? (POSITIONS_BY_SPORT[sportKey] || []) : [];
            if (availablePositions.length === 0) return null;
            const unselected = availablePositions.filter(p => !positions.includes(p));
            return (
              <div className="multi-select-combo">
                {positions.map(p => (
                  <span key={p} className="multi-select-chip">
                    {p}
                    <button type="button" onClick={() => setPositions(positions.filter(x => x !== p))}>×</button>
                  </span>
                ))}
                <select
                  className="multi-select-input"
                  value=""
                  onChange={e => { if (e.target.value) setPositions([...positions, e.target.value]); }}
                >
                  <option value="">{positions.length ? '+' : 'All Positions'}</option>
                  {unselected.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            );
          })()}
          <select className="filter-select" value={country} onChange={e => { setCountry(e.target.value); setProvince(''); }}>
            <option value="">All Countries</option>
            {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {(() => {
            const cDef = COUNTRIES.find(c => c.value === country);
            return cDef?.provinces?.length > 0 ? (
              <select className="filter-select" value={province} onChange={e => setProvince(e.target.value)}>
                <option value="">All Provinces</option>
                {cDef.provinces.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : null;
          })()}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="loading" style={{ display: 'flex' }}>
          <div className="spinner"></div>
          <p>Loading leaderboard…</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No results</div>
          <p className="empty-state-desc">
            {viewMode === 'individuals'
              ? 'No players found for the selected filters. Try broadening your criteria.'
              : 'No team sessions found. Teams need linked sessions from team events to appear here.'}
          </p>
        </div>
      ) : (
        <>
          {/* Column header */}
          <div className="leaderboard-header-row">
            <span className="leaderboard-col-rank">#</span>
            <span className="leaderboard-col-name">
              {viewMode === 'individuals' ? 'Player' : 'Team'}
            </span>
            <span className="leaderboard-col-value">{currentMetricDef?.label || 'Value'}</span>
            <span className="leaderboard-col-meta">Sessions</span>
          </div>

          <div className="leaderboard-list">
            {entries.map((entry) => {
              const isMe = viewMode === 'individuals' && entry.user_id === user?.id;
              const rankClass = entry.rank === 1 ? 'gold' : entry.rank === 2 ? 'silver' : entry.rank === 3 ? 'bronze' : '';
              const name = viewMode === 'individuals' ? entry.display_name : entry.team_name;
              const avatarUrl = viewMode === 'individuals' ? entry.avatar_url : entry.team_avatar_url;
              const initial = (name || '?').charAt(0).toUpperCase();

              return (
                <div
                  key={entry.user_id || entry.team_id}
                  className={`leaderboard-entry${isMe ? ' is-me' : ''}`}
                >
                  <div className={`leaderboard-rank ${rankClass}`}>
                    {entry.rank}
                  </div>
                  <div className="leaderboard-player">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="leaderboard-avatar" />
                    ) : (
                      <div className="leaderboard-avatar-placeholder">{initial}</div>
                    )}
                    <span className="leaderboard-name">{name || 'Unknown'}</span>
                    {isMe && <span className="leaderboard-you-badge">You</span>}
                  </div>
                  <div className="leaderboard-value">
                    {currentMetricDef?.fmt
                      ? currentMetricDef.fmt(Number(entry.metric_value))
                      : Number(entry.metric_value).toFixed(2)}
                    {currentMetricDef?.unit && (
                      <span className="leaderboard-unit">{currentMetricDef.unit}</span>
                    )}
                  </div>
                  <div className="leaderboard-meta">
                    {entry.session_count}
                    {viewMode === 'teams' && entry.player_count != null && (
                      <span className="leaderboard-meta-extra"> · {entry.player_count}p</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {hasMore && (
            <button
              className="btn btn-outline load-more-btn"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
