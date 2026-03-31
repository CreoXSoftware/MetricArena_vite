import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 20;

export function useAdmin() {
  const [players, setPlayers] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(false);

  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsHasMore, setSessionsHasMore] = useState(false);

  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);

  // ── Players ──────────────────────────────────────────────────────────────

  const fetchPlayers = useCallback(async (query = '') => {
    setPlayersLoading(true);
    let q = supabase
      .from('profiles')
      .select('id, display_name, avatar_url, is_verified, role, created_at')
      .order('display_name', { ascending: true })
      .limit(50);
    if (query.trim().length >= 1) {
      q = q.ilike('display_name', `%${query.trim()}%`);
    }
    const { data, error } = await q;
    if (!error) setPlayers(data || []);
    setPlayersLoading(false);
  }, []);

  const setPlayerVerified = useCallback(async (userId, verified) => {
    setPlayers(prev => prev.map(p => p.id === userId ? { ...p, is_verified: verified } : p));
    const { error } = await supabase
      .from('profiles')
      .update({ is_verified: verified })
      .eq('id', userId);
    if (error) {
      setPlayers(prev => prev.map(p => p.id === userId ? { ...p, is_verified: !verified } : p));
      console.error('Failed to update player verification:', error);
      return false;
    }
    return true;
  }, []);

  // ── Sessions ─────────────────────────────────────────────────────────────

  const fetchSessions = useCallback(async (filters = {}, reset = true) => {
    if (reset) { setSessionsLoading(true); setSessions([]); }

    const offset = reset ? 0 : sessions.length;

    let q = supabase
      .from('sessions')
      .select(`
        id, user_id, sport, session_type, session_date, duration, is_verified, metrics,
        profiles!sessions_user_id_fkey(display_name, avatar_url)
      `)
      .order('session_date', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (filters.sport && filters.sport !== 'all') q = q.eq('sport', filters.sport);
    if (filters.sessionType && filters.sessionType !== 'all') q = q.eq('session_type', filters.sessionType);
    if (filters.dateFrom) q = q.gte('session_date', filters.dateFrom);
    if (filters.dateTo) q = q.lte('session_date', filters.dateTo);
    if (filters.verifiedOnly) q = q.eq('is_verified', true);

    const { data, error } = await q;
    if (!error) {
      const rows = (data || []).map(s => ({
        ...s,
        playerProfile: s.profiles || { display_name: 'Unknown', avatar_url: null },
      }));
      if (reset) setSessions(rows);
      else setSessions(prev => [...prev, ...rows]);
      setSessionsHasMore((data || []).length >= PAGE_SIZE);
    }
    setSessionsLoading(false);
  }, [sessions.length]);

  const setSessionVerified = useCallback(async (sessionId, verified) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, is_verified: verified } : s));
    const { error } = await supabase
      .from('sessions')
      .update({ is_verified: verified })
      .eq('id', sessionId);
    if (error) {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, is_verified: !verified } : s));
      console.error('Failed to update session verification:', error);
      return false;
    }
    return true;
  }, []);

  // ── Teams ────────────────────────────────────────────────────────────────

  const fetchTeams = useCallback(async (query = '') => {
    setTeamsLoading(true);
    let q = supabase
      .from('teams')
      .select('id, name, sport, is_public, is_verified, created_at, created_by')
      .order('name', { ascending: true })
      .limit(50);
    if (query.trim().length >= 1) {
      q = q.ilike('name', `%${query.trim()}%`);
    }
    const { data, error } = await q;
    if (!error) {
      // Fetch member counts for each team
      const teamIds = (data || []).map(t => t.id);
      let memberCounts = {};
      if (teamIds.length > 0) {
        const { data: members } = await supabase
          .from('team_members')
          .select('team_id')
          .in('team_id', teamIds);
        if (members) {
          members.forEach(m => {
            memberCounts[m.team_id] = (memberCounts[m.team_id] || 0) + 1;
          });
        }
      }
      setTeams((data || []).map(t => ({ ...t, member_count: memberCounts[t.id] || 0 })));
    }
    setTeamsLoading(false);
  }, []);

  const setTeamVerified = useCallback(async (teamId, verified) => {
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, is_verified: verified } : t));
    const { error } = await supabase
      .from('teams')
      .update({ is_verified: verified })
      .eq('id', teamId);
    if (error) {
      setTeams(prev => prev.map(t => t.id === teamId ? { ...t, is_verified: !verified } : t));
      console.error('Failed to update team verification:', error);
      return false;
    }
    return true;
  }, []);

  return {
    players, playersLoading, fetchPlayers, setPlayerVerified,
    sessions, sessionsLoading, sessionsHasMore, fetchSessions, setSessionVerified,
    teams, teamsLoading, fetchTeams, setTeamVerified,
  };
}
