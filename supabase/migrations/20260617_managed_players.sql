-- =====================================================================
-- Managed Players
-- Coach-owned "ghost" profiles (no auth.users link) that live in one team,
-- managed by any manager of that team, hidden from public surfaces, and
-- mergeable into a real account later.
-- Apply via Supabase SQL editor, `mcp__supabase__apply_migration`, or `supabase db push`.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- A.1  Relax the profiles.id -> auth.users FK, add managed columns
-- The signup trigger (handle_new_user) inserts profiles.id = NEW.id
-- explicitly, so dropping the FK does NOT affect real signups; it only
-- lets us insert rows whose id has no matching auth.users row.
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();

alter table public.profiles
  add column if not exists managed_by uuid references public.profiles(id) on delete set null;
alter table public.profiles
  add column if not exists is_managed boolean not null default false;

create index if not exists idx_profiles_managed_by on public.profiles (managed_by);
create index if not exists idx_profiles_is_managed on public.profiles (is_managed) where is_managed = true;

-- ---------------------------------------------------------------------
-- A.2  Keystone helper: managed-player ids in my manager teams.
-- SECURITY DEFINER + reuse of the (also DEFINER) get_my_manager_team_ids()
-- means no RLS recursion, matching the existing helper pattern.
-- ---------------------------------------------------------------------
create or replace function public.get_my_managed_player_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select tm.user_id
  from team_members tm
  join profiles p on p.id = tm.user_id
  where p.is_managed = true
    and tm.team_id in (select get_my_manager_team_ids());
$$;
grant execute on function public.get_my_managed_player_ids() to authenticated;

-- ---------------------------------------------------------------------
-- A.3  RLS policies (additive; existing policies are untouched / OR-combined)
-- ---------------------------------------------------------------------

-- profiles: any manager of the player's team can edit/delete managed players.
-- (Existing "all SELECT (true)" already covers reads; INSERT goes via the RPC.)
drop policy if exists "Manager can update managed player" on public.profiles;
create policy "Manager can update managed player"
  on public.profiles for update to authenticated
  using ( id in (select public.get_my_managed_player_ids()) )
  with check ( id in (select public.get_my_managed_player_ids()) );

drop policy if exists "Manager can delete managed player" on public.profiles;
create policy "Manager can delete managed player"
  on public.profiles for delete to authenticated
  using ( id in (select public.get_my_managed_player_ids()) );

-- sessions: managers can CRUD a managed player's sessions regardless of
-- team_session_id (this is what enables standalone managed-player uploads).
drop policy if exists "Manager reads managed player sessions" on public.sessions;
create policy "Manager reads managed player sessions"
  on public.sessions for select to authenticated
  using ( user_id in (select public.get_my_managed_player_ids()) );

drop policy if exists "Manager inserts managed player sessions" on public.sessions;
create policy "Manager inserts managed player sessions"
  on public.sessions for insert to authenticated
  with check ( user_id in (select public.get_my_managed_player_ids()) );

drop policy if exists "Manager updates managed player sessions" on public.sessions;
create policy "Manager updates managed player sessions"
  on public.sessions for update to authenticated
  using ( user_id in (select public.get_my_managed_player_ids()) )
  with check ( user_id in (select public.get_my_managed_player_ids()) );

drop policy if exists "Manager deletes managed player sessions" on public.sessions;
create policy "Manager deletes managed player sessions"
  on public.sessions for delete to authenticated
  using ( user_id in (select public.get_my_managed_player_ids()) );

-- ---------------------------------------------------------------------
-- A.4  RPCs (SECURITY DEFINER, follow the manager_unlink_session precedent)
-- ---------------------------------------------------------------------

-- Create a managed player + its single team membership atomically.
create or replace function public.create_managed_player(
  p_team_id uuid,
  p_display_name text,
  p_athlete_profile jsonb default null,
  p_default_thresholds jsonb default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new public.profiles;
begin
  if coalesce(btrim(p_display_name), '') = '' then
    raise exception 'Display name is required';
  end if;
  if not exists (
    select 1 from team_members
    where team_id = p_team_id and user_id = auth.uid() and is_manager = true
  ) then
    raise exception 'Not authorized: not a manager of this team';
  end if;

  insert into profiles (id, display_name, is_managed, managed_by, athlete_profile, default_thresholds)
  values (gen_random_uuid(), btrim(p_display_name), true, auth.uid(), p_athlete_profile, p_default_thresholds)
  returning * into v_new;

  insert into team_members (team_id, user_id, is_manager, is_player)
  values (p_team_id, v_new.id, false, true);

  return v_new;
end;
$$;
grant execute on function public.create_managed_player(uuid, text, jsonb, jsonb) to authenticated;

-- Merge a managed player into a real account (coach-driven consolidation).
create or replace function public.merge_managed_player(
  p_ghost_id uuid,
  p_real_id uuid,
  p_team_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_manager boolean;
  v_ghost_managed boolean;
begin
  select exists (
    select 1 from team_members
    where team_id = p_team_id and user_id = auth.uid() and is_manager = true
  ) into v_is_manager;
  if not v_is_manager then
    raise exception 'Not authorized: not a manager of this team';
  end if;

  if p_real_id = p_ghost_id then
    raise exception 'Cannot merge a player into itself';
  end if;

  select p.is_managed into v_ghost_managed from profiles p where p.id = p_ghost_id;
  if v_ghost_managed is distinct from true then
    raise exception 'Source is not a managed player';
  end if;

  if not exists (select 1 from team_members where team_id = p_team_id and user_id = p_ghost_id) then
    raise exception 'Managed player is not a member of this team';
  end if;
  if not exists (select 1 from team_members where team_id = p_team_id and user_id = p_real_id) then
    raise exception 'Target account must already belong to the team';
  end if;

  -- Reassign all of the ghost's sessions to the real account.
  -- profile_snapshot on each session is left intact (history preserved).
  update sessions set user_id = p_real_id where user_id = p_ghost_id;

  -- Real account already has a membership row, so drop the ghost's row
  -- (avoids the (team_id, user_id) unique collision).
  delete from team_members where user_id = p_ghost_id and team_id = p_team_id;

  -- Delete the ghost profile. The real account's own athlete_profile /
  -- default_thresholds are NOT touched.
  delete from profiles where id = p_ghost_id;
end;
$$;
grant execute on function public.merge_managed_player(uuid, uuid, uuid) to authenticated;

-- Cascade-delete a managed player (sessions + membership + profile).
-- NOTE: storage objects (session-files) must be removed client-side first;
-- SQL cannot delete storage objects.
create or replace function public.delete_managed_player(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = p_id and is_managed = true) then
    raise exception 'Not a managed player';
  end if;
  if p_id not in (select public.get_my_managed_player_ids()) then
    raise exception 'Not authorized to delete this player';
  end if;

  delete from sessions where user_id = p_id;
  delete from team_members where user_id = p_id;
  delete from profiles where id = p_id;
end;
$$;
grant execute on function public.delete_managed_player(uuid) to authenticated;

commit;

-- =====================================================================
-- A.5  Public-surface exclusion (Decision 6) -- MANUAL FOLLOW-UP
-- ---------------------------------------------------------------------
-- These functions are NOT in the repo, so patch their bodies in place.
-- Add  `and p.is_managed = false`  next to the existing `is_public` filter,
-- ONLY on the global branch (leave it out when p_team_id is provided so a
-- coach can still rank their own roster):
--
--   * get_individual_leaderboard   (join to profiles p on p.id = user_id)
--   * get_player_comparison
--   * get_team_leaderboard / get_team_comparison
--       -> join profiles and exclude is_managed = true sessions so a ghost's
--          sessions don't inflate public team aggregates.
--
-- Belt-and-suspenders: the client creates managed players with
-- athlete_profile.is_public = false, so they are already excluded from any
-- RPC that filters on is_public even before the above edits land.
-- =====================================================================
