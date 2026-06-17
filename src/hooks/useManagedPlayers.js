import { useCallback } from 'react';
import { supabase } from '../lib/supabase';

const STORAGE_BUCKET = 'session-files';

/**
 * Managed players = "ghost" profiles (no auth.users link) owned by a coach and
 * living in exactly one team. Authority follows team managership; all writes are
 * gated server-side by the get_my_managed_player_ids() RLS helper / RPCs.
 */
export function useManagedPlayers() {
  /** Managed players across the given manager team ids, annotated with their team. */
  const listMyManagedPlayers = useCallback(async (teamIds) => {
    if (!teamIds || teamIds.length === 0) return [];
    const { data, error } = await supabase
      .from('team_members')
      .select('team_id, teams(name), profiles!inner(id, display_name, athlete_profile, default_thresholds, is_managed)')
      .in('team_id', teamIds)
      .eq('profiles.is_managed', true);
    if (error) { console.error('listMyManagedPlayers error:', error.message); return []; }
    return (data || []).map(r => ({
      id: r.profiles.id,
      display_name: r.profiles.display_name,
      athlete_profile: r.profiles.athlete_profile,
      default_thresholds: r.profiles.default_thresholds,
      team_id: r.team_id,
      team_name: r.teams?.name || '',
    }));
  }, []);

  /** Create a managed player + its single team membership atomically (RPC). */
  const createManagedPlayer = useCallback(async (teamId, { display_name, athlete_profile, default_thresholds }) => {
    const { data, error } = await supabase.rpc('create_managed_player', {
      p_team_id: teamId,
      p_display_name: display_name,
      p_athlete_profile: athlete_profile ?? null,
      p_default_thresholds: default_thresholds ?? null,
    });
    if (error) return { error: error.message };
    return { data };
  }, []);

  /** Edit a managed player's name / athlete profile / thresholds (RLS-gated UPDATE). */
  const updateManagedPlayer = useCallback(async (playerId, fields) => {
    const { error } = await supabase
      .from('profiles')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', playerId);
    return error ? { error: error.message } : { ok: true };
  }, []);

  /** Cascade-delete a managed player: storage files (client) + sessions/membership/profile (RPC). */
  const deleteManagedPlayer = useCallback(async (playerId) => {
    const { data: sess } = await supabase
      .from('sessions')
      .select('file_path')
      .eq('user_id', playerId);
    const paths = (sess || []).map(s => s.file_path).filter(Boolean);
    if (paths.length) {
      await supabase.storage.from(STORAGE_BUCKET).remove(paths);
    }
    const { error } = await supabase.rpc('delete_managed_player', { p_id: playerId });
    return error ? { error: error.message } : { ok: true };
  }, []);

  /** Merge a managed player into a real account that already joined the team (RPC). */
  const linkManagedPlayer = useCallback(async (ghostId, realId, teamId) => {
    const { error } = await supabase.rpc('merge_managed_player', {
      p_ghost_id: ghostId,
      p_real_id: realId,
      p_team_id: teamId,
    });
    return error ? { error: error.message } : { ok: true };
  }, []);

  /** Number of sessions owned by a managed player (for the delete confirmation). */
  const getManagedPlayerSessionCount = useCallback(async (playerId) => {
    const { count } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', playerId);
    return count || 0;
  }, []);

  return {
    listMyManagedPlayers,
    createManagedPlayer,
    updateManagedPlayer,
    deleteManagedPlayer,
    linkManagedPlayer,
    getManagedPlayerSessionCount,
  };
}
