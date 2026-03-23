# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # Production build to /dist
npm run lint      # ESLint (flat config, v9+)
npm run preview   # Preview production build locally
```

No test framework is configured.

## Architecture

**Metric Arena** is a Vite + React (v19) sports performance analytics platform for MetricAthlete hardware sensors. It parses binary IMU/GPS sensor data and CSV files, computes 30+ athletic metrics, and visualizes results with canvas-based charts and Leaflet heatmaps. The platform layer (auth, teams, sessions) is powered by Supabase.

### Data Pipeline

```
File upload / BLE download
  → parsers.js (binary v0/v1 or CSV)
  → processing.js (gravity correction, IMU processing, GPS distance via Haversine)
  → metrics.js (sprints, impacts, zones, power, player load, etc.)
  → Session saved to Supabase (metrics JSON, thresholds, profile snapshot)
  → DashboardPage.jsx (charts, grids, maps, splits)
```

### Platform Architecture

```
Browser (metric computation + React UI)
    ↕ supabase-js client
Supabase (Auth + PostgreSQL + Storage)
    → profiles, teams, team_members, team_sessions, sessions
```

- **Auth**: Supabase Auth (email/password). Client singleton in `src/lib/supabase.js`.
- **Database**: Supabase PostgreSQL with RLS. Two `SECURITY DEFINER` helper functions (`get_my_team_ids()`, `get_my_coach_team_ids()`) break RLS recursion on `team_members`.
- **Storage**: Supabase Storage `avatars` bucket (public) for profile pictures.
- **Metric computation stays client-side** — heavy GPS/IMU processing runs in the browser.

### Routing & State

- **React Router v7** — `src/App.jsx` defines all routes
- **Public routes**: `/` (landing), `/login`, `/register`
- **Protected routes** (behind `ProtectedRoute`): `/app/upload`, `/app/dashboard`, `/app/profile`, `/app/teams`, `/app/teams/:teamId`, `/app/sessions`
- **AuthContext** (`src/contexts/AuthContext.jsx`) — user, profile, signUp/signIn/signOut/refreshProfile
- **SessionContext** (`src/contexts/SessionContext.jsx`) — processedData, thresholds, athlete profile (localStorage)
- **AppLayout** wraps protected routes with `Navbar` + `<Outlet />`

### Role Model

- Two roles: `user` (default) and `admin` (set in DB only, no UI)
- Team creator automatically gets `is_coach = true` on `team_members` row
- Coach permission is per-team, transferable to another member
- No player/coach distinction at the account level

### Teams & Sessions Model

- **Teams**: name, sport, 8-char invite code. Any user can create (becomes coach) or join.
- **Team Sessions**: Named events (e.g. "Bats vs Rats 12 Mar") created by team coach.
- **Sessions**: Individual uploads. Always private. Optionally linked to a team session (coach can see linked sessions). Stored as metrics JSON in Supabase `sessions` table.

### Upload Flow

1. User selects file (UploadBox) or downloads via BLE
2. File parsed → rows extracted → **Session Details** form shown (date/time from data, sport selector, optional team session link)
3. On confirm: `processSession()` → `computeMetrics()` → saved to Supabase → navigate to dashboard

### Key Directories

- `src/lib/` — Supabase client singleton
- `src/contexts/` — AuthContext, SessionContext (React context providers)
- `src/hooks/` — `useTeams`, `useTeamSessions`, `useSessions` (Supabase CRUD hooks)
- `src/utils/` — Core logic: parsers, processing, metrics, BLE protocol, exporters, constants
- `src/components/` — UI components (Navbar, AppLayout, ProtectedRoute, Charts, HeatMap, TeamSessionTag, etc.)
- `src/pages/` — LandingPage, LoginPage, RegisterPage, UploadPage, DashboardPage, ProfilePage, TeamsPage, TeamDetailPage, SessionHistoryPage
- `src/styles/global.css` — All styling; dark theme with CSS custom properties (`--accent: #00e5a0`)

### Supabase RLS Pattern

RLS policies on `team_members`, `team_sessions`, `teams`, and `sessions` use two `SECURITY DEFINER` helper functions to avoid infinite recursion:
- `get_my_team_ids()` — returns team IDs where the current user is a member
- `get_my_coach_team_ids()` — returns team IDs where the current user is coach

All policies that need to check team membership call these functions instead of subquerying `team_members` directly.

### Binary File Formats

- **v0**: 61 bytes/record — float32 speed, full IMU floats
- **v1**: 47 bytes/record — uint16 speed ÷ 10, int16 IMU values with scale factors

### BLE Integration

`src/utils/ble.js` — Custom BLE protocol manager class handling device connection, file listing, and chunked file downloads with caching.

## Code Conventions

- Plain JavaScript (no TypeScript)
- Functional components only, heavy use of `useMemo`/`useCallback`
- Canvas-based charts (no charting library)
- ESLint: unused vars with pattern `^[A-Z_]` are allowed (components, constants)
- Shared constants (e.g. `SPORTS` array) in `src/utils/constants.js`
- Supabase data-fetching hooks use `useEffect` with `eslint-disable` for `react-hooks/set-state-in-effect` (standard fetch-on-mount pattern)
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in `.env` (gitignored)
