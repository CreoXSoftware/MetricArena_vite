# CLAUDE.md

## Commands
```bash
npm run dev     # Vite dev + HMR
npm run build   # prod → /dist
npm run lint    # ESLint flat config v9+
npm run preview # preview prod build
```
No tests.

## Stack
Vite + React 19 + Supabase (auth/DB/storage). Plain JS, no TypeScript. Functional components, `useMemo`/`useCallback` heavy. Canvas charts (no lib). CSS custom props, dark theme, `--accent: #00e5a0`.

## Key Dirs
- `src/lib/` — Supabase singleton
- `src/contexts/` — AuthContext, SessionContext
- `src/hooks/` — useTeams, useTeamSessions, useTeamSessionDetail, useSessions, useLeaderboard
- `src/utils/` — parsers, processing, metrics, ble, exporters, constants, format
- `src/components/` — UI
- `src/pages/` — pages
- `src/styles/global.css` — styles

## Roles
- Account: `user` (default) | `admin` (DB-only, access `/app/admin`)
- Team: `is_manager` + `is_player` flags on `team_members`
- Privacy: `athlete_profile.is_public` (profiles), `teams.is_public`

## DB Schema

### `profiles`
`id` uuid PK, `display_name` text, `avatar_url` text?, `role` text=`'user'`, `is_verified` bool=false, `athlete_profile` jsonb?, `default_thresholds` jsonb?, `created_at`, `updated_at`

### `teams`
`id` uuid PK, `name` text, `sport` text=`'general'`, `invite_code` text, `is_public` bool=true, `is_verified` bool=false, `created_by` uuid→profiles

### `team_members`
`id` uuid PK, `team_id`→teams, `user_id`→profiles, `is_manager` bool=false, `is_player` bool=true, `joined_at`

### `team_sessions`
`id` uuid PK, `team_id`→teams, `name` text, `session_date` date, `created_by`→profiles

### `sessions`
`id` uuid PK, `user_id`→profiles, `sport` text=`'general'`, `session_date` timestamptz, `session_type` text=`'practice'`, `duration` real, `metrics` jsonb, `thresholds` jsonb, `profile_snapshot` jsonb, `splits` jsonb?, `team_session_id`→team_sessions?, `is_verified` bool=false, `file_name` text?, `file_path` text?

## RLS Helpers (SECURITY DEFINER)
- `get_my_team_ids()` — user's member teams
- `get_my_manager_team_ids()` — user's manager teams

## RLS Policies
| Table | Who can what |
|-------|-------------|
| profiles | all SELECT; own UPDATE; admin verify |
| teams | all SELECT; own INSERT; manager UPDATE/DELETE; admin verify |
| team_members | members SELECT; self INSERT; manager UPDATE; self/manager DELETE |
| team_sessions | members SELECT; manager INSERT/UPDATE/DELETE |
| sessions | own CRUD; manager sees/inserts/updates linked; admin reads all + verifies |

## Conventions
- ESLint: unused vars matching `^[A-Z_]` allowed (components/constants)
- Manager check: `myTeams.filter(t => t.is_manager)` — never hardcode
- Supabase hooks: `useEffect` fetch-on-mount with `eslint-disable react-hooks/set-state-in-effect`
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in `.env` (gitignored)
- Shared constants in `src/utils/constants.js`

Update on DB schema or RLS change.
