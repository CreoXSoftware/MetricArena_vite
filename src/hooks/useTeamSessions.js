import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useTeamSessions(teamId = null) {
  const { user } = useAuth();
  const [teamSessions, setTeamSessions] = useState([]);
  const [myAvailableTeamSessions, setMyAvailableTeamSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch sessions for a specific team
  const fetchTeamSessions = useCallback(async () => {
    if (!teamId) { setTeamSessions([]); return; }
    const { data } = await supabase
      .from('team_sessions')
      .select('*')
      .eq('team_id', teamId)
      .order('session_date', { ascending: false });
    setTeamSessions(data || []);
  }, [teamId]);

  // Fetch all team sessions across all user's teams (for upload dropdown)
  const fetchMyAvailableTeamSessions = useCallback(async () => {
    if (!user) { setMyAvailableTeamSessions([]); setLoading(false); return; }

    // Get all team IDs the user belongs to
    const { data: memberships } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id);

    if (!memberships?.length) {
      setMyAvailableTeamSessions([]);
      setLoading(false);
      return;
    }

    const teamIds = memberships.map(m => m.team_id);

    const { data } = await supabase
      .from('team_sessions')
      .select('*, teams(name)')
      .in('team_id', teamIds)
      .order('session_date', { ascending: false });

    setMyAvailableTeamSessions((data || []).map(ts => ({
      ...ts,
      team_name: ts.teams?.name || '',
    })));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchTeamSessions(); // eslint-disable-line react-hooks/set-state-in-effect
    fetchMyAvailableTeamSessions();
  }, [fetchTeamSessions, fetchMyAvailableTeamSessions]);

  const createTeamSession = useCallback(async (tId, name, sessionDate) => {
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await supabase
      .from('team_sessions')
      .insert({ team_id: tId, name, session_date: sessionDate, created_by: user.id })
      .select()
      .single();
    if (error) return { error: error.message };
    await fetchTeamSessions();
    await fetchMyAvailableTeamSessions();
    return { data };
  }, [user, fetchTeamSessions, fetchMyAvailableTeamSessions]);

  const deleteTeamSession = useCallback(async (id) => {
    await supabase.from('team_sessions').delete().eq('id', id);
    await fetchTeamSessions();
    await fetchMyAvailableTeamSessions();
  }, [fetchTeamSessions, fetchMyAvailableTeamSessions]);

  return {
    teamSessions, myAvailableTeamSessions, loading,
    createTeamSession, deleteTeamSession,
    refreshTeamSessions: fetchTeamSessions,
    refreshAvailable: fetchMyAvailableTeamSessions,
  };
}
