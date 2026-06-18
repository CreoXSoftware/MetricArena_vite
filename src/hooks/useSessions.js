import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const PAGE_SIZE = 20;

export function useSessions() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const offsetRef = useRef(0);

  const fetchSessions = useCallback(async (reset = true) => {
    if (!user) { setSessions([]); setLoading(false); return; }

    if (reset) {
      offsetRef.current = 0;
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    const from = offsetRef.current;
    const to = from + PAGE_SIZE - 1;

    // Own sessions plus any I uploaded on behalf of someone else (managed or
    // real players). `uploaded_by` is set to the uploader at insert time.
    const { data, count } = await supabase
      .from('sessions')
      .select('*, team_sessions(id, name, team_id, teams(name)), owner:profiles!sessions_user_id_fkey(display_name, is_managed)', { count: 'exact' })
      .or(`user_id.eq.${user.id},uploaded_by.eq.${user.id}`)
      .order('session_date', { ascending: false })
      .range(from, to);

    const mapped = (data || []).map(s => ({
      ...s,
      team_session_name: s.team_sessions?.name || null,
      team_session_id: s.team_sessions?.id || null,
      team_id: s.team_sessions?.team_id || null,
      team_name: s.team_sessions?.teams?.name || null,
      owner_name: s.owner?.display_name || null,
      owner_is_managed: s.owner?.is_managed || false,
      // Uploaded by me for someone else — surfaced as a "managed" row in my list.
      is_on_behalf: s.uploaded_by === user.id && s.user_id !== user.id,
    }));

    setSessions(prev => reset ? mapped : [...prev, ...mapped]);
    offsetRef.current = from + mapped.length;
    setHasMore(offsetRef.current < (count || 0));

    if (reset) setLoading(false);
    else setLoadingMore(false);
  }, [user]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const loadMoreSessions = useCallback(() => {
    if (!loadingMore && hasMore) fetchSessions(false);
  }, [fetchSessions, loadingMore, hasMore]);

  /** Save a new session. Pass onBehalfOfUserId to create a session owned by another user (manager feature). */
  const saveSession = useCallback(async (sessionData, onBehalfOfUserId = null) => {
    if (!user) return { error: 'Not authenticated' };
    const targetUserId = onBehalfOfUserId || user.id;
    const { data, error } = await supabase
      .from('sessions')
      .insert({ user_id: targetUserId, uploaded_by: user.id, ...sessionData })
      .select()
      .single();
    if (error) return { error: error.message };
    await fetchSessions(true);
    return { data };
  }, [user, fetchSessions]);

  const linkToTeamSession = useCallback(async (sessionId, teamSessionId) => {
    await supabase
      .from('sessions')
      .update({ team_session_id: teamSessionId })
      .eq('id', sessionId);
    await fetchSessions(true);
  }, [fetchSessions]);

  /**
   * Reassign an on-behalf session to a different owner (a managed player I
   * manage, or myself). Pass clearLink=true to also drop the team-session link
   * (used when the new owner is in a different team, or is myself).
   */
  const reassignSession = useCallback(async (sessionId, newUserId, clearLink = false) => {
    const updates = { user_id: newUserId };
    if (clearLink) updates.team_session_id = null;
    const { error } = await supabase
      .from('sessions')
      .update(updates)
      .eq('id', sessionId);
    if (error) return { error: error.message };
    await fetchSessions(true);
    return { ok: true };
  }, [fetchSessions]);

  const unlinkFromTeamSession = useCallback(async (sessionId) => {
    await supabase
      .from('sessions')
      .update({ team_session_id: null })
      .eq('id', sessionId);
    await fetchSessions(true);
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
    const session = sessions.find(s => s.id === sessionId);
    if (session?.file_path) {
      await supabase.storage.from('session-files').remove([session.file_path]);
    }
    await supabase.from('sessions').delete().eq('id', sessionId);
    await fetchSessions(true);
  }, [fetchSessions, sessions]);

  return {
    sessions, loading, loadingMore, hasMore,
    loadMoreSessions, saveSession,
    linkToTeamSession, unlinkFromTeamSession, reassignSession, deleteSession,
    updateSessionSplits, updateSessionThresholds,
    refreshSessions: fetchSessions,
  };
}
