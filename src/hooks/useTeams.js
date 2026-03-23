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
      .select('team_id, is_coach')
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
      .select('id, name, sport, invite_code, created_at')
      .in('id', teamIds);



    if (teams) {
      const coachMap = Object.fromEntries(memberships.map(m => [m.team_id, m.is_coach]));
      setMyTeams(teams.map(t => ({ ...t, is_coach: coachMap[t.id] || false })));
    }
    setLoading(false);
  }, [user]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  const createTeam = useCallback(async (name, sport) => {
    if (!user) return { error: 'Not authenticated' };
    const invite_code = generateInviteCode();
    const { data: team, error } = await supabase
      .from('teams')
      .insert({ name, sport, invite_code, created_by: user.id })
      .select()
      .single();

    if (error) return { error: error.message };

    // Add creator as coach
    const { error: memberErr } = await supabase
      .from('team_members')
      .insert({ team_id: team.id, user_id: user.id, is_coach: true });

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

  const transferCoach = useCallback(async (teamId, newCoachUserId) => {
    if (!user) return { error: 'Not authenticated' };
    // Remove coach from self
    await supabase
      .from('team_members')
      .update({ is_coach: false })
      .eq('team_id', teamId)
      .eq('user_id', user.id);
    // Set new coach
    await supabase
      .from('team_members')
      .update({ is_coach: true })
      .eq('team_id', teamId)
      .eq('user_id', newCoachUserId);
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
      .select('user_id, is_coach, joined_at, profiles(id, display_name, avatar_url)')
      .eq('team_id', teamId);
    return (data || []).map(m => ({
      ...m.profiles,
      is_coach: m.is_coach,
      joined_at: m.joined_at,
    }));
  }, []);

  return {
    myTeams, loading, createTeam, joinTeam, leaveTeam,
    removeMember, transferCoach, searchUsers, getTeamMembers, refreshTeams: fetchTeams,
  };
}
