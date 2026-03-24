import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useSessions() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    if (!user) { setSessions([]); setLoading(false); return; }
    const { data } = await supabase
      .from('sessions')
      .select('*, team_sessions(id, name, team_id, teams(name))')
      .eq('user_id', user.id)
      .order('session_date', { ascending: false });

    setSessions((data || []).map(s => ({
      ...s,
      team_session_name: s.team_sessions?.name || null,
      team_session_id: s.team_sessions?.id || null,
      team_id: s.team_sessions?.team_id || null,
      team_name: s.team_sessions?.teams?.name || null,
    })));
    setLoading(false);
  }, [user]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const saveSession = useCallback(async (sessionData) => {
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await supabase
      .from('sessions')
      .insert({ user_id: user.id, ...sessionData })
      .select()
      .single();
    if (error) return { error: error.message };
    await fetchSessions();
    return { data };
  }, [user, fetchSessions]);

  const linkToTeamSession = useCallback(async (sessionId, teamSessionId) => {
    await supabase
      .from('sessions')
      .update({ team_session_id: teamSessionId })
      .eq('id', sessionId);
    await fetchSessions();
  }, [fetchSessions]);

  const unlinkFromTeamSession = useCallback(async (sessionId) => {
    await supabase
      .from('sessions')
      .update({ team_session_id: null })
      .eq('id', sessionId);
    await fetchSessions();
  }, [fetchSessions]);

  const updateSessionSplits = useCallback(async (sessionId, splits) => {
    const { error } = await supabase
      .from('sessions')
      .update({ splits })
      .eq('id', sessionId);
    return error ? { error: error.message } : { ok: true };
  }, []);

  const updateSessionThresholds = useCallback(async (sessionId, thresholds) => {
    const { error } = await supabase
      .from('sessions')
      .update({ thresholds })
      .eq('id', sessionId);
    return error ? { error: error.message } : { ok: true };
  }, []);

  const deleteSession = useCallback(async (sessionId) => {
    // Delete associated storage file if present
    const session = sessions.find(s => s.id === sessionId);
    if (session?.file_path) {
      await supabase.storage.from('session-files').remove([session.file_path]);
    }
    await supabase.from('sessions').delete().eq('id', sessionId);
    await fetchSessions();
  }, [fetchSessions, sessions]);

  return {
    sessions, loading, saveSession,
    linkToTeamSession, unlinkFromTeamSession, deleteSession,
    updateSessionSplits, updateSessionThresholds,
    refreshSessions: fetchSessions,
  };
}
