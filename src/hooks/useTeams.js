import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function useTeams() {
  const { user } = useAuth();
  const [myTeams, setMyTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTeams = useCallback(async () => {
    if (!user) { setMyTeams([]); setLoading(false); return; }

    // First get memberships
    const { data: memberships, error: memErr } = await supabase
      .from('team_members')
      .select('team_id, is_manager')
      .eq('user_id', user.id);



    if (memErr || !memberships?.length) {
      setMyTeams([]);
      setLoading(false);
      return;
    }

    // Then fetch the team details
    const teamIds = memberships.map(m => m.team_id);
    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('id, name, sport, invite_code, created_at, avatar_url')
      .in('id', teamIds);



    if (teams) {
      const managerMap = Object.fromEntries(memberships.map(m => [m.team_id, m.is_manager]));
      setMyTeams(teams.map(t => ({ ...t, is_manager: managerMap[t.id] || false })));
    }
    setLoading(false);
  }, [user]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  const createTeam = useCallback(async (name, sport, isPlayer = true) => {
    if (!user) return { error: 'Not authenticated' };
    const invite_code = generateInviteCode();
    const { data: team, error } = await supabase
      .from('teams')
      .insert({ name, sport, invite_code, created_by: user.id })
      .select()
      .single();

    if (error) return { error: error.message };

    // Add creator as manager
    const { error: memberErr } = await supabase
      .from('team_members')
      .insert({ team_id: team.id, user_id: user.id, is_manager: true, is_player: isPlayer });

    if (memberErr) return { error: memberErr.message };

    await fetchTeams();
    return { data: team };
  }, [user, fetchTeams]);

  const joinTeam = useCallback(async (inviteCode) => {
    if (!user) return { error: 'Not authenticated' };
    // Look up team by invite code — need to query without RLS filtering (user isn't a member yet)
    // Use a direct query — the insert RLS allows self-insert
    const { data: teams, error: lookupErr } = await supabase
      .from('teams')
      .select('id')
      .eq('invite_code', inviteCode.toUpperCase().trim());

    // If RLS blocks this (user not a member), we need a workaround
    if (lookupErr || !teams?.length) return { error: 'Invalid invite code' };

    const { error } = await supabase
      .from('team_members')
      .insert({ team_id: teams[0].id, user_id: user.id });
    if (error) {
      if (error.code === '23505') return { error: 'You are already a member of this team' };
      return { error: error.message };
    }
    await fetchTeams();
    return { data: true };
  }, [user, fetchTeams]);

  const leaveTeam = useCallback(async (teamId) => {
    if (!user) return;
    await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', user.id);
    await fetchTeams();
  }, [user, fetchTeams]);

  const removeMember = useCallback(async (teamId, userId) => {
    await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', userId);
  }, []);

  const transferManager = useCallback(async (teamId, newManagerUserId) => {
    if (!user) return { error: 'Not authenticated' };
    // Remove manager from self
    await supabase
      .from('team_members')
      .update({ is_manager: false })
      .eq('team_id', teamId)
      .eq('user_id', user.id);
    // Set new manager
    await supabase
      .from('team_members')
      .update({ is_manager: true })
      .eq('team_id', teamId)
      .eq('user_id', newManagerUserId);
    await fetchTeams();
  }, [user, fetchTeams]);

  const searchUsers = useCallback(async (query) => {
    if (!query || query.length < 2) return [];
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .ilike('display_name', `%${query}%`)
      .limit(10);
    return data || [];
  }, []);

  const getTeamMembers = useCallback(async (teamId) => {
    const { data } = await supabase
      .from('team_members')
      .select('user_id, is_manager, is_player, joined_at, profiles(id, display_name, avatar_url)')
      .eq('team_id', teamId);
    return (data || []).map(m => ({
      ...m.profiles,
      is_manager: m.is_manager,
      is_player: m.is_player,
      joined_at: m.joined_at,
    }));
  }, []);

  const updateTeamAvatar = useCallback(async (teamId, url) => {
    const { error } = await supabase
      .from('teams')
      .update({ avatar_url: url })
      .eq('id', teamId);
    if (error) { console.error('Team avatar update error:', error.message); return; }
    await fetchTeams();
  }, [fetchTeams]);

  return {
    myTeams, loading, createTeam, joinTeam, leaveTeam,
    removeMember, transferManager, searchUsers, getTeamMembers,
    refreshTeams: fetchTeams, updateTeamAvatar,
  };
}
