import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Fetches all sessions linked to a team session, enriched with player profiles.
 * Managers see all players' sessions (requires the "Coaches can view team member sessions" RLS policy).
 * Players only see their own.
 */
export function useTeamSessionDetail(teamSessionId) {
  const { user } = useAuth();
  const [playerSessions, setPlayerSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(async () => {
    if (!teamSessionId || !user) { setPlayerSessions([]); setLoading(false); return; }

    const { data: sessionsData } = await supabase
      .from('sessions')
      .select('*')
      .eq('team_session_id', teamSessionId)
      .order('session_date', { ascending: false });

    if (!sessionsData?.length) { setPlayerSessions([]); setLoading(false); return; }

    const userIds = [...new Set(sessionsData.map(s => s.user_id))];
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', userIds);

    const profileMap = {};
    (profilesData || []).forEach(p => { profileMap[p.id] = p; });

    setPlayerSessions(sessionsData.map(s => ({
      ...s,
      playerProfile: profileMap[s.user_id] || { display_name: 'Unknown', avatar_url: null },
    })));
    setLoading(false);
  }, [teamSessionId, user]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  return { playerSessions, loading, refresh: fetchDetail };
}
