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
  → Session saved to Supabase (metrics JSON, thresholds, profile snapshot, splits)
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
- **Database**: Supabase PostgreSQL with RLS. Three `SECURITY DEFINER` helper functions break RLS recursion on `team_members` (see RLS section).
- **Storage**: Supabase Storage `avatars` bucket (public) for profile pictures.
- **Metric computation stays client-side** — heavy GPS/IMU processing runs in the browser.

### Routing & State

- **React Router v7** — `src/App.jsx` defines all routes
- **Public routes**: `/` (landing), `/login`, `/register`
- **Protected routes** (behind `ProtectedRoute`): `/app/upload`, `/app/dashboard`, `/app/profile`, `/app/teams`, `/app/teams/:teamId`, `/app/sessions`, `/app/sessions/team/:teamSessionId`
- **AuthContext** (`src/contexts/AuthContext.jsx`) — user, profile, signUp/signIn/signOut/refreshProfile
- **SessionContext** (`src/contexts/SessionContext.jsx`) — processedData, thresholds, splits, athlete profile (localStorage), activeSport
- **AppLayout** wraps protected routes with `Navbar` + `<Outlet />`

### Role Model

- Two account roles: `user` (default) and `admin` (set in DB only, no UI)
- Team roles are per-team flags on `team_members`:
  - `is_manager` (boolean) — can create/edit/delete team sessions, transfer manager role, remove members. Team creator gets `is_manager = true` automatically.
  - `is_player` (boolean, default true) — whether the member is also a player (as opposed to manager-only). Set on join/create.
- Manager role is transferable to another member (current manager loses it on transfer).
- No global coach/player distinction at the account level.

### Teams & Sessions Model

- **Teams**: name, sport, 8-char invite code. Any user can create (becomes manager) or join via invite code.
- **Team Sessions**: Named events (e.g. "Bats vs Rats 12 Mar") created by team managers. Stored in `team_sessions`.
- **Sessions**: Individual uploads. Always private to the owner. Optionally linked to a team session via `team_session_id` — managers can then see all linked sessions for a team event.
- Sessions store `metrics`, `thresholds`, `profile_snapshot`, and `splits` as JSONB.
- Sessions are paginated (PAGE_SIZE = 20) in `useSessions`.

### Upload Flow

1. User selects file (UploadBox) or downloads via BLE
2. File parsed → rows extracted → **Session Details** form shown (date/time from data, sport selector, session type, optional team session link)
3. On confirm: `processSession()` → `computeMetrics()` → saved to Supabase → navigate to dashboard

### Key Directories

- `src/lib/` — Supabase client singleton
- `src/contexts/` — AuthContext, SessionContext (React context providers)
- `src/hooks/` — `useTeams`, `useTeamSessions`, `useTeamSessionDetail`, `useSessions` (Supabase CRUD hooks)
- `src/utils/` — Core logic: parsers, processing, metrics, BLE protocol, exporters, constants, format
- `src/components/` — UI components (Navbar, AppLayout, ProtectedRoute, Charts, HeatMap, MetricsGrid, SplitsPanel, SpeedZones, ThresholdsPanel, ExportMenu, ProfileCard, TeamSessionTag, UploadBox, BLECard, Brand)
- `src/pages/` — LandingPage, LoginPage, RegisterPage, UploadPage, DashboardPage, ProfilePage, TeamsPage, TeamDetailPage, SessionHistoryPage, TeamSessionDetailPage
- `src/styles/global.css` — All styling; dark theme with CSS custom properties (`--accent: #00e5a0`)

### Page Summaries

| Page | Route | Purpose |
|------|-------|---------|
| LandingPage | `/` | Public landing |
| LoginPage | `/login` | Auth: login |
| RegisterPage | `/register` | Auth: registration |
| UploadPage | `/app/upload` | File upload + BLE download |
| DashboardPage | `/app/dashboard` | Session metrics (charts, heatmaps, grids, splits) |
| ProfilePage | `/app/profile` | User profile & athlete settings |
| TeamsPage | `/app/teams` | Create/join teams; filtered by activeSport |
| TeamDetailPage | `/app/teams/:teamId` | Members list, manager transfer, invite code |
| SessionHistoryPage | `/app/sessions` | Dual view: individual sessions + team sessions; link/unlink; manager CRUD for team sessions |
| TeamSessionDetailPage | `/app/sessions/team/:teamSessionId` | Player comparison table for a team event; manager can edit/delete |

### Hook Summaries

- **`useTeams`** — fetch user's teams (with `is_manager`/`is_player` flags), `createTeam`, `joinTeam`, `leaveTeam`, `removeMember`, `transferManager`, `searchUsers`, `getTeamMembers`
- **`useTeamSessions`** — dual state: `teamSessions` (per-team, used in TeamDetailPage) and `myAvailableTeamSessions` (paginated across all user's teams, used in linking UI). `createTeamSession`, `updateTeamSession`, `deleteTeamSession`
- **`useTeamSessionDetail`** — fetch all sessions linked to a specific team session, enriched with player profiles (`display_name`, `avatar_url`). Managers see all players' sessions.
- **`useSessions`** — paginated fetch, `saveSession`, `linkToTeamSession`, `unlinkFromTeamSession`, `updateSessionSplits`, `updateSessionThresholds`, `deleteSession`

### Supabase Database Schema

#### `profiles`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | — |
| display_name | text | NO | `''` |
| avatar_url | text | YES | — |
| role | text | NO | `'user'` |
| athlete_profile | jsonb | YES | — |
| default_thresholds | jsonb | YES | — |
| created_at | timestamptz | NO | `now()` |
| updated_at | timestamptz | NO | `now()` |

#### `teams`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | `gen_random_uuid()` |
| name | text | NO | — |
| sport | text | NO | `'general'` |
| invite_code | text | NO | — |
| created_by | uuid | NO | — |
| created_at | timestamptz | YES | `now()` |

#### `team_members`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | `gen_random_uuid()` |
| team_id | uuid | NO | — |
| user_id | uuid | NO | — |
| is_manager | boolean | YES | `false` |
| is_player | boolean | NO | `true` |
| joined_at | timestamptz | YES | `now()` |

#### `team_sessions`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | `gen_random_uuid()` |
| team_id | uuid | NO | — |
| name | text | NO | — |
| session_date | date | NO | — |
| created_by | uuid | NO | — |
| created_at | timestamptz | YES | `now()` |

#### `sessions`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | `gen_random_uuid()` |
| user_id | uuid | NO | — |
| sport | text | NO | `'general'` |
| session_date | timestamptz | NO | — |
| session_type | text | NO | `'practice'` |
| duration | real | NO | `0` |
| metrics | jsonb | NO | `{}` |
| thresholds | jsonb | NO | `{}` |
| profile_snapshot | jsonb | NO | `{}` |
| splits | jsonb | YES | `[]` |
| team_session_id | uuid | YES | — |
| file_name | text | YES | — |
| file_path | text | YES | — |
| created_at | timestamptz | YES | `now()` |

#### Foreign Keys
- `sessions.user_id` → `profiles.id`
- `sessions.team_session_id` → `team_sessions.id`
- `teams.created_by` → `profiles.id`
- `team_members.team_id` → `teams.id`
- `team_members.user_id` → `profiles.id`
- `team_sessions.team_id` → `teams.id`
- `team_sessions.created_by` → `profiles.id`

### Supabase RLS Pattern

RLS uses three `SECURITY DEFINER` helper functions to avoid infinite recursion on `team_members`:
- `get_my_team_ids()` — returns team IDs where current user is a member (used for member-level read access)
- `get_my_manager_team_ids()` — returns team IDs where current user is manager (used for manager write operations)

> Note: an older `get_my_coach_team_ids()` function may exist in the DB but is no longer referenced — all manager logic uses `get_my_manager_team_ids()`.

#### RLS Policies Summary

| Table | Policy | Command | Rule |
|-------|--------|---------|------|
| profiles | Profiles are viewable by everyone | SELECT | `true` |
| profiles | Users can update own profile | UPDATE | `auth.uid() = id` |
| teams | Anyone can read teams | SELECT | `true` |
| teams | Users can create teams | INSERT | `auth.uid() = created_by` |
| teams | Manager can update team | UPDATE | `id IN get_my_manager_team_ids()` |
| teams | Manager can delete team | DELETE | `id IN get_my_manager_team_ids()` |
| team_members | Members can view | SELECT | `team_id IN get_my_team_ids()` |
| team_members | Users can join | INSERT | `auth.uid() = user_id` |
| team_members | Manager can update | UPDATE | `team_id IN get_my_manager_team_ids()` |
| team_members | Manager or self can leave | DELETE | `user_id = auth.uid() OR team_id IN get_my_manager_team_ids()` |
| team_sessions | Members can view | SELECT | `team_id IN get_my_team_ids()` |
| team_sessions | Manager can create | INSERT | `team_id IN get_my_manager_team_ids()` |
| team_sessions | Manager can update | UPDATE | `team_id IN get_my_manager_team_ids()` |
| team_sessions | Manager can delete | DELETE | `team_id IN get_my_manager_team_ids()` |
| sessions | Own sessions | SELECT | `user_id = auth.uid()` |
| sessions | Manager sees linked | SELECT | `team_session_id IN (team sessions from manager's teams)` |
| sessions | Insert own | INSERT | `user_id = auth.uid()` |
| sessions | Update own | UPDATE | `user_id = auth.uid()` |
| sessions | Delete own | DELETE | `user_id = auth.uid()` |

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
- Shared constants (e.g. `SPORTS`, `SESSION_TYPES` array) in `src/utils/constants.js`
- Supabase data-fetching hooks use `useEffect` with `eslint-disable` for `react-hooks/set-state-in-effect` (standard fetch-on-mount pattern)
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in `.env` (gitignored)
- Manager checks in components: `const managerTeams = myTeams.filter(t => t.is_manager)` — always filter from the teams list, never hardcode

## Notes
- Always update CLAUDE.md when you make changes to the db structures or policies