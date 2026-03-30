import { useState, useEffect, useCallback, useRef } from 'react';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useTeams } from '../hooks/useTeams';
import { useSession } from '../contexts/SessionContext';
import { useAuth } from '../contexts/AuthContext';
import {
  SPORTS, SESSION_TYPES,
  LEADERBOARD_METRICS, TEAM_LEADERBOARD_METRICS, AGGREGATION_MODES,
  COUNTRIES, POSITIONS_BY_SPORT,
  PLAYER_COMPARISON_ROWS, TEAM_COMPARISON_ROWS,
} from '../utils/constants';

/* ─── tiny search-with-dropdown helper ─── */
function EntitySearch({ placeholder, onSearch, onSelect, renderItem }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef(null);

  const handleChange = (q) => {
    setQuery(q);
    clearTimeout(debounce.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      const r = await onSearch(q);
      setResults(r);
      setOpen(r.length > 0);
    }, 250);
  };

  return (
    <div className="compare-search">
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && (
        <div className="compare-search-dropdown">
          {results.map(r => (
            <button
              key={r.id}
              className="compare-search-item"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(r); setQuery(''); setResults([]); setOpen(false); }}
            >
              {renderItem(r)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const { activeSport } = useSession();
  const { myTeams, loading: teamsLoading } = useTeams();
  const {
    entries, loading, loadingMore, hasMore, fetchIndividual, fetchTeam, clear,
    comparison, comparisonLoading, fetchPlayerComparison, fetchTeamComparison, clearComparison,
    searchPlayers, searchTeams,
  } = useLeaderboard();

  // View mode: 'individuals' | 'teams' | 'compare'
  const [viewMode, setViewMode] = useState('individuals');

  // Individual filters
  const [scope, setScope] = useState('all');
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

  // Compare state
  const [compareType, setCompareType] = useState('players'); // 'players' | 'teams'
  const [compareA, setCompareA] = useState(null);
  const [compareB, setCompareB] = useState(null);
  const [compSessionType, setCompSessionType] = useState('all');
  const [compDateFrom, setCompDateFrom] = useState('');
  const [compDateTo, setCompDateTo] = useState('');

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
    } else if (viewMode === 'teams') {
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
    if (teamsLoading || viewMode === 'compare') return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchData, 200);
    return () => clearTimeout(debounceRef.current);
  }, [fetchData, teamsLoading, viewMode]);

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

  // ─── Compare logic ───
  const handleCompare = useCallback(() => {
    if (!compareA || !compareB) return;
    const filters = {
      sport: activeSport,
      sessionType: compSessionType,
      dateFrom: compDateFrom || null,
      dateTo: compDateTo || null,
    };
    if (compareType === 'players') {
      fetchPlayerComparison([compareA.id, compareB.id], filters);
    } else {
      fetchTeamComparison([compareA.id, compareB.id], filters);
    }
  }, [compareA, compareB, compareType, activeSport, compSessionType, compDateFrom, compDateTo, fetchPlayerComparison, fetchTeamComparison]);

  const switchViewMode = (mode) => {
    clear();
    clearComparison();
    setViewMode(mode);
  };

  // ─── Render helpers for comparison ───
  function renderComparisonTable() {
    if (comparisonLoading) {
      return (
        <div className="loading" style={{ display: 'flex' }}>
          <div className="spinner"></div>
          <p>Loading comparison…</p>
        </div>
      );
    }
    if (!comparison || comparison.length === 0) return null;

    const dataA = comparison.find(r =>
      compareType === 'players' ? r.user_id === compareA?.id : r.team_id === compareA?.id
    );
    const dataB = comparison.find(r =>
      compareType === 'players' ? r.user_id === compareB?.id : r.team_id === compareB?.id
    );

    if (!dataA && !dataB) {
      return (
        <div className="empty-state">
          <div className="empty-state-title">No data</div>
          <p className="empty-state-desc">No sessions found for the selected filters.</p>
        </div>
      );
    }

    const rows = compareType === 'players' ? PLAYER_COMPARISON_ROWS : TEAM_COMPARISON_ROWS;
    const nameA = compareType === 'players' ? compareA?.display_name : compareA?.name;
    const nameB = compareType === 'players' ? compareB?.display_name : compareB?.name;
    const avatarA = compareType === 'players' ? (dataA?.avatar_url || compareA?.avatar_url) : compareA?.avatar_url;
    const avatarB = compareType === 'players' ? (dataB?.avatar_url || compareB?.avatar_url) : compareB?.avatar_url;

    return (
      <div className="compare-table-wrapper">
        {/* Header with avatars */}
        <div className="compare-table-header">
          <div className="compare-col-label"></div>
          <div className="compare-col-entity">
            {avatarA ? <img src={avatarA} alt="" className="compare-avatar" /> : (
              <div className="compare-avatar-placeholder">{(nameA || '?')[0].toUpperCase()}</div>
            )}
            <span className="compare-entity-name">{nameA || 'Unknown'}</span>
          </div>
          <div className="compare-col-entity">
            {avatarB ? <img src={avatarB} alt="" className="compare-avatar" /> : (
              <div className="compare-avatar-placeholder">{(nameB || '?')[0].toUpperCase()}</div>
            )}
            <span className="compare-entity-name">{nameB || 'Unknown'}</span>
          </div>
        </div>

        {/* Rows */}
        {rows.map((row) => {
          let valA, valB;

          if (row.key) {
            // Simple key (sessions, players)
            valA = dataA?.[row.key];
            valB = dataB?.[row.key];
          } else if (compareType === 'players') {
            // Player rows have bestKey/totalKey and avgKey
            const primaryKey = row.bestKey || row.totalKey || row.avgKey;
            valA = dataA?.[primaryKey];
            valB = dataB?.[primaryKey];
          } else {
            valA = dataA?.[row.key];
            valB = dataB?.[row.key];
          }

          const fmtA = valA != null ? (row.fmt ? row.fmt(Number(valA)) : String(valA)) : '—';
          const fmtB = valB != null ? (row.fmt ? row.fmt(Number(valB)) : String(valB)) : '—';

          // Determine winner (higher is better for all metrics)
          const numA = Number(valA) || 0;
          const numB = Number(valB) || 0;
          const winA = numA > numB && numA > 0;
          const winB = numB > numA && numB > 0;

          return (
            <div key={row.label} className="compare-row">
              <div className="compare-col-label">
                {row.label}
                {row.unit && <span className="compare-unit">{row.unit}</span>}
              </div>
              <div className={`compare-col-value${winA ? ' winner' : ''}`}>
                {fmtA}
              </div>
              <div className={`compare-col-value${winB ? ' winner' : ''}`}>
                {fmtB}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="leaderboard-page">
      {/* Header */}
      <div className="leaderboard-page-header">
        <h2 className="page-title">Leaderboard</h2>
        <div className="sessions-mode-toggle">
          <button
            className={`sessions-mode-btn${viewMode === 'individuals' ? ' active' : ''}`}
            onClick={() => switchViewMode('individuals')}
          >
            Individuals
          </button>
          <button
            className={`sessions-mode-btn${viewMode === 'teams' ? ' active' : ''}`}
            onClick={() => switchViewMode('teams')}
          >
            Teams
          </button>
          <button
            className={`sessions-mode-btn${viewMode === 'compare' ? ' active' : ''}`}
            onClick={() => switchViewMode('compare')}
          >
            Compare
          </button>
        </div>
      </div>

      {/* ─── Leaderboard filters (individuals/teams only) ─── */}
      {viewMode !== 'compare' && (
        <>
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
        </>
      )}

      {/* ─── Compare view ─── */}
      {viewMode === 'compare' && (
        <div className="compare-section">
          {/* Compare type toggle */}
          <div className="compare-type-toggle">
            <button
              className={`sessions-mode-btn${compareType === 'players' ? ' active' : ''}`}
              onClick={() => { setCompareType('players'); setCompareA(null); setCompareB(null); clearComparison(); }}
            >
              Players
            </button>
            <button
              className={`sessions-mode-btn${compareType === 'teams' ? ' active' : ''}`}
              onClick={() => { setCompareType('teams'); setCompareA(null); setCompareB(null); clearComparison(); }}
            >
              Teams
            </button>
          </div>

          {/* Selection */}
          <div className="compare-pickers">
            <div className="compare-picker">
              {compareA ? (
                <div className="compare-selected">
                  {(compareType === 'players' ? compareA.avatar_url : compareA.avatar_url) ? (
                    <img src={compareA.avatar_url} alt="" className="compare-pick-avatar" />
                  ) : (
                    <div className="compare-pick-avatar-placeholder">
                      {((compareType === 'players' ? compareA.display_name : compareA.name) || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <span>{compareType === 'players' ? compareA.display_name : compareA.name}</span>
                  <button className="compare-remove" onClick={() => { setCompareA(null); clearComparison(); }}>×</button>
                </div>
              ) : (
                <EntitySearch
                  placeholder={compareType === 'players' ? 'Search player…' : 'Search team…'}
                  onSearch={compareType === 'players' ? searchPlayers : searchTeams}
                  onSelect={setCompareA}
                  renderItem={r => (
                    <span className="compare-search-entry">
                      {r.avatar_url ? (
                        <img src={r.avatar_url} alt="" className="compare-search-avatar" />
                      ) : (
                        <span className="compare-search-avatar-placeholder">
                          {((compareType === 'players' ? r.display_name : r.name) || '?')[0].toUpperCase()}
                        </span>
                      )}
                      {compareType === 'players' ? r.display_name : r.name}
                    </span>
                  )}
                />
              )}
            </div>

            <span className="compare-vs">VS</span>

            <div className="compare-picker">
              {compareB ? (
                <div className="compare-selected">
                  {(compareType === 'players' ? compareB.avatar_url : compareB.avatar_url) ? (
                    <img src={compareB.avatar_url} alt="" className="compare-pick-avatar" />
                  ) : (
                    <div className="compare-pick-avatar-placeholder">
                      {((compareType === 'players' ? compareB.display_name : compareB.name) || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <span>{compareType === 'players' ? compareB.display_name : compareB.name}</span>
                  <button className="compare-remove" onClick={() => { setCompareB(null); clearComparison(); }}>×</button>
                </div>
              ) : (
                <EntitySearch
                  placeholder={compareType === 'players' ? 'Search player…' : 'Search team…'}
                  onSearch={compareType === 'players' ? searchPlayers : searchTeams}
                  onSelect={setCompareB}
                  renderItem={r => (
                    <span className="compare-search-entry">
                      {r.avatar_url ? (
                        <img src={r.avatar_url} alt="" className="compare-search-avatar" />
                      ) : (
                        <span className="compare-search-avatar-placeholder">
                          {((compareType === 'players' ? r.display_name : r.name) || '?')[0].toUpperCase()}
                        </span>
                      )}
                      {compareType === 'players' ? r.display_name : r.name}
                    </span>
                  )}
                />
              )}
            </div>
          </div>

          {/* Compare filters */}
          <div className="leaderboard-filters">
            <select className="filter-select" value={compSessionType} onChange={e => setCompSessionType(e.target.value)}>
              <option value="all">All Types</option>
              {SESSION_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input type="date" className="filter-date" value={compDateFrom} onChange={e => setCompDateFrom(e.target.value)} title="From date" />
            <span className="filter-date-sep">–</span>
            <input type="date" className="filter-date" value={compDateTo} onChange={e => setCompDateTo(e.target.value)} title="To date" />
            <button
              className="btn btn-accent btn-sm"
              onClick={handleCompare}
              disabled={!compareA || !compareB || comparisonLoading}
            >
              {comparisonLoading ? 'Loading…' : 'Compare'}
            </button>
          </div>

          {/* Comparison results */}
          {renderComparisonTable()}

          {!comparison && !comparisonLoading && (
            <div className="empty-state">
              <div className="empty-state-title">Head-to-Head</div>
              <p className="empty-state-desc">
                Select two {compareType === 'players' ? 'players' : 'teams'} above and click Compare to see a side-by-side breakdown of all metrics.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── Leaderboard results (individuals/teams) ─── */}
      {viewMode !== 'compare' && (
        <>
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
        </>
      )}
    </div>
  );
}
