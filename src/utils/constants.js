export const SPORTS = [
  { value: 'rugby', label: 'Rugby' },
  { value: 'football', label: 'Football / Soccer' },
  { value: 'hockey', label: 'Hockey' },
  { value: 'athletics', label: 'Athletics / Track' },
  { value: 'general', label: 'General / Other' },
];

export const SESSION_TYPES = [
  { value: 'practice', label: 'Practice' },
  { value: 'game', label: 'Game' },
];

export const LEADERBOARD_METRICS = [
  { value: 'maxSpeedMs',  label: 'Top Speed',    unit: 'm/s',  fmt: v => v?.toFixed(2) },
  { value: 'avgSpeed',    label: 'Avg Speed',     unit: 'm/s',  fmt: v => v?.toFixed(2) },
  { value: 'totalDist',   label: 'Distance',      unit: 'km',   fmt: v => (v / 1000).toFixed(2) },
  { value: 'sprints',     label: 'Sprints',       unit: '',     fmt: v => String(Math.round(v)) },
  { value: 'impacts',     label: 'Impacts',       unit: '',     fmt: v => String(Math.round(v)) },
  { value: 'playerLoad',  label: 'Player Load',   unit: 'au',   fmt: v => v?.toFixed(0) },
  { value: 'peakPower',   label: 'Peak Power',    unit: 'W',    fmt: v => v?.toFixed(0) },
  { value: 'totalCal',    label: 'Calories',      unit: 'kcal', fmt: v => v?.toFixed(0) },
  { value: 'plPerMin',    label: 'Load / Min',    unit: 'au',   fmt: v => v?.toFixed(2) },
];

export const TEAM_LEADERBOARD_METRICS = [
  { value: 'totalDist',   label: 'Team Distance',    unit: 'km',  agg: 'sum', fmt: v => (v / 1000).toFixed(1) },
  { value: 'avgSpeed',    label: 'Avg Team Speed',    unit: 'm/s', agg: 'avg', fmt: v => v?.toFixed(2) },
  { value: 'maxSpeedMs',  label: 'Top Speed',         unit: 'm/s', agg: 'max', fmt: v => v?.toFixed(2) },
  { value: 'sprints',     label: 'Total Sprints',     unit: '',    agg: 'sum', fmt: v => String(Math.round(v)) },
  { value: 'impacts',     label: 'Total Impacts',     unit: '',    agg: 'sum', fmt: v => String(Math.round(v)) },
  { value: 'playerLoad',  label: 'Avg Player Load',   unit: 'au',  agg: 'avg', fmt: v => v?.toFixed(0) },
  { value: 'peakPower',   label: 'Avg Peak Power',    unit: 'W',   agg: 'avg', fmt: v => v?.toFixed(0) },
];

export const AGGREGATION_MODES = [
  { value: 'best',    label: 'Best Session' },
  { value: 'average', label: 'Average' },
];

export const PLAYER_COMPARISON_ROWS = [
  { label: 'Sessions',      key: 'session_count',     fmt: v => String(v ?? 0) },
  { label: 'Top Speed',     bestKey: 'best_maxspeedms',  avgKey: 'avg_maxspeedms',  unit: 'm/s',  fmt: v => v?.toFixed(2) },
  { label: 'Avg Speed',     bestKey: 'best_avgspeed',    avgKey: 'avg_avgspeed',    unit: 'm/s',  fmt: v => v?.toFixed(2) },
  { label: 'Distance',      bestKey: 'best_totaldist',   avgKey: 'avg_totaldist',   unit: 'km',   fmt: v => (v / 1000).toFixed(2) },
  { label: 'Sprints',       totalKey: 'total_sprints',   avgKey: 'avg_sprints',     unit: '',     fmt: v => String(Math.round(v ?? 0)) },
  { label: 'Impacts',       totalKey: 'total_impacts',   avgKey: 'avg_impacts',     unit: '',     fmt: v => String(Math.round(v ?? 0)) },
  { label: 'Player Load',   bestKey: 'best_playerload',  avgKey: 'avg_playerload',  unit: 'au',   fmt: v => v?.toFixed(0) },
  { label: 'Peak Power',    bestKey: 'best_peakpower',   avgKey: 'avg_peakpower',   unit: 'W',    fmt: v => v?.toFixed(0) },
  { label: 'Calories',      totalKey: 'total_totalcal',  avgKey: 'avg_totalcal',    unit: 'kcal', fmt: v => v?.toFixed(0) },
  { label: 'Load / Min',    avgKey: 'avg_plpermin',      unit: 'au',               fmt: v => v?.toFixed(2) },
];

export const TEAM_COMPARISON_ROWS = [
  { label: 'Players',       key: 'player_count',      fmt: v => String(v ?? 0) },
  { label: 'Sessions',      key: 'session_count',     fmt: v => String(v ?? 0) },
  { label: 'Max Speed',     key: 'max_maxspeedms',    unit: 'm/s',  fmt: v => v?.toFixed(2) },
  { label: 'Avg Speed',     key: 'avg_avgspeed',      unit: 'm/s',  fmt: v => v?.toFixed(2) },
  { label: 'Total Distance', key: 'sum_totaldist',    unit: 'km',   fmt: v => (v / 1000).toFixed(1) },
  { label: 'Avg Distance',  key: 'avg_totaldist',     unit: 'km',   fmt: v => (v / 1000).toFixed(2) },
  { label: 'Total Sprints', key: 'sum_sprints',       unit: '',     fmt: v => String(Math.round(v ?? 0)) },
  { label: 'Total Impacts', key: 'sum_impacts',       unit: '',     fmt: v => String(Math.round(v ?? 0)) },
  { label: 'Avg Player Load', key: 'avg_playerload',  unit: 'au',   fmt: v => v?.toFixed(0) },
  { label: 'Avg Peak Power', key: 'avg_peakpower',    unit: 'W',    fmt: v => v?.toFixed(0) },
  { label: 'Total Calories', key: 'sum_totalcal',     unit: 'kcal', fmt: v => v?.toFixed(0) },
  { label: 'Avg Load / Min', key: 'avg_plpermin',     unit: 'au',   fmt: v => v?.toFixed(2) },
];

export const COUNTRIES = [
  {
    value: 'South Africa',
    label: 'South Africa',
    provinces: [
      'Eastern Cape',
      'Free State',
      'Gauteng',
      'KwaZulu-Natal',
      'Limpopo',
      'Mpumalanga',
      'North West',
      'Northern Cape',
      'Western Cape',
    ],
  },
];

export const POSITIONS_BY_SPORT = {
  rugby: [
    'Loosehead Prop', 'Hooker', 'Tighthead Prop',
    'Lock', 'Blindside Flanker', 'Openside Flanker', 'Number 8',
    'Scrumhalf', 'Flyhalf', 'Inside Centre', 'Outside Centre',
    'Left Wing', 'Right Wing', 'Fullback',
  ],
  football: [
    'Goalkeeper', 'Centre Back', 'Left Back', 'Right Back',
    'Defensive Midfielder', 'Central Midfielder', 'Attacking Midfielder',
    'Left Midfielder', 'Right Midfielder',
    'Left Winger', 'Right Winger', 'Striker',
  ],
  hockey: [
    'Goalkeeper', 'Centre Back', 'Left Back', 'Right Back', 'Sweeper',
    'Left Half', 'Centre Half', 'Right Half',
    'Inside Left', 'Inside Right',
    'Left Wing', 'Right Wing', 'Centre Forward',
  ],
  athletics: [
    'Sprinter', 'Middle Distance', 'Long Distance', 'Hurdler',
    'High Jump', 'Long Jump', 'Triple Jump', 'Pole Vault',
    'Shot Put', 'Discus', 'Javelin', 'Hammer Throw',
    'Decathlete', 'Heptathlete',
  ],
  general: [],
};
