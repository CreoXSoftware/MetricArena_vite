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
  { value: 'avgSpeed',    label: 'Avg Speed',     unit: 'm/s',  fmt: v => (v / 3.6).toFixed(2) },
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
  { value: 'avgSpeed',    label: 'Avg Team Speed',    unit: 'm/s', agg: 'avg', fmt: v => (v / 3.6).toFixed(2) },
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
