-- ============================================================
-- Combined migration:
--   1. is_coach → is_manager (column already renamed, skip ALTER)
--   2. Add is_player column
--   3. Rename get_my_coach_team_ids → get_my_manager_team_ids
--   4. Recreate all dependent RLS policies
-- ============================================================

-- 1. is_coach column was already renamed to is_manager — nothing to do.

-- 2. Add is_player (existing members are all considered players by default)
ALTER TABLE team_members ADD COLUMN is_player boolean NOT NULL DEFAULT true;

-- 3a. Create the new helper function
CREATE OR REPLACE FUNCTION get_my_manager_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT team_id FROM team_members
  WHERE user_id = auth.uid() AND is_manager = true;
$$;

-- 3b. Drop all policies that depend on get_my_coach_team_ids()
DROP POLICY IF EXISTS "Coach can update team"                 ON teams;
DROP POLICY IF EXISTS "Coach can delete team"                 ON teams;
DROP POLICY IF EXISTS "Coach can update"                      ON team_members;
DROP POLICY IF EXISTS "Coach or self can leave"               ON team_members;
DROP POLICY IF EXISTS "Coach can create"                      ON team_sessions;
DROP POLICY IF EXISTS "Coach can update"                      ON team_sessions;
DROP POLICY IF EXISTS "Coach can delete"                      ON team_sessions;
DROP POLICY IF EXISTS "Coach sees linked"                     ON sessions;
DROP POLICY IF EXISTS "Coaches can view team member sessions" ON sessions;

-- 3c. Now safe to drop the old function
DROP FUNCTION IF EXISTS get_my_coach_team_ids();

-- 4. Recreate all policies using get_my_manager_team_ids()

-- teams
CREATE POLICY "Manager can update team"
  ON teams FOR UPDATE TO authenticated
  USING (id IN (SELECT get_my_manager_team_ids()));

CREATE POLICY "Manager can delete team"
  ON teams FOR DELETE TO authenticated
  USING (id IN (SELECT get_my_manager_team_ids()));

-- team_members
CREATE POLICY "Manager can update"
  ON team_members FOR UPDATE TO authenticated
  USING (team_id IN (SELECT get_my_manager_team_ids()));

CREATE POLICY "Manager or self can leave"
  ON team_members FOR DELETE TO authenticated
  USING ((user_id = auth.uid()) OR (team_id IN (SELECT get_my_manager_team_ids())));

-- team_sessions
CREATE POLICY "Manager can create"
  ON team_sessions FOR INSERT TO authenticated
  WITH CHECK (team_id IN (SELECT get_my_manager_team_ids()));

CREATE POLICY "Manager can update"
  ON team_sessions FOR UPDATE TO authenticated
  USING (team_id IN (SELECT get_my_manager_team_ids()));

CREATE POLICY "Manager can delete"
  ON team_sessions FOR DELETE TO authenticated
  USING (team_id IN (SELECT get_my_manager_team_ids()));

-- sessions (two old coach SELECT policies merged into one)
CREATE POLICY "Manager sees linked"
  ON sessions FOR SELECT TO authenticated
  USING (
    (team_session_id IS NOT NULL)
    AND (team_session_id IN (
      SELECT id FROM team_sessions
      WHERE team_id IN (SELECT get_my_manager_team_ids())
    ))
  );
