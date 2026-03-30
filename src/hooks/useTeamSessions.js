import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const PAGE_SIZE = 20;

function getBestMetrics(session) {
  const splits = session.splits || [];
  const combined = splits.find(s => s.isCombined && s.metrics);
  if (combined) return combined.metrics;
  const firstSplit = splits.find(s => !s.isCombined && s.metrics);
  if (firstSplit) return firstSplit.metrics;
  return session.metrics || null;
}

export function computeTeamAggregate(sessions) {
  const metricsList = sessions.map(getBestMetrics).filter(Boolean);
  if (!metricsList.length) return null;

  const sum = (key) => metricsList.reduce((acc, m) => acc + (m[key] ?? 0), 0);
  const avg = (key) => {
    const valid = metricsList.filter(m => m[key] != null);
    return valid.length ? valid.reduce((acc, m) => acc + m[key], 0) / valid.length : null;
  };

  // Normalize max speed to m/s (maxSpeedMs is m/s, maxSpeed is km/h legacy)
  const speedsMs = metricsList
    .map(m => m.maxSpeedMs ?? (m.maxSpeed != null ? m.maxSpeed / 3.6 : null))
    .filter(v => v != null);

  return {
    playerCount: metricsList.length,
    totalDist: sum('totalDist'),
    avgSpeed: avg('avgSpeed'),
    maxSpeedMs: speedsMs.length ? Math.max(...speedsMs) : null,
    totalSprints: sum('sprints'),
    totalImpacts: sum('impacts'),
    avgPlayerLoad: avg('playerLoad'),
    totalCal: sum('totalCal'),
    avgDuration: avg('duration'),
    totalHighSpeedDist: sum('highSpeedDist'),
    totalSprintDist: sum('sprintDist'),
    avgPeakPower: avg('peakPower'),
    avgAvgPower: avg('avgPower'),
    totalWork: sum('work'),
    avgMetabolicPower: avg('metabolicPower'),
    avgMaxAccel: avg('maxAccel'),
    avgMaxDecel: avg('maxDecel'),
  };
}

async function enrichWithAggregates(teamSessionList) {
  if (!teamSessionList.length) return teamSessionList;
  const tsIds = teamSessionList.map(ts => ts.id);
  const { data: linked } = await supabase
    .from('sessions')
    .select('team_session_id, metrics, splits')
    .in('team_session_id', tsIds);

  const grouped = {};
  (linked || []).forEach(s => {
    if (!grouped[s.team_session_id]) grouped[s.team_session_id] = [];
    grouped[s.team_session_id].push(s);
  });

  return teamSessionList.map(ts => ({
    ...ts,
    aggregateMetrics: computeTeamAggregate(grouped[ts.id] || []),
  }));
}

export function useTeamSessions(teamId = null) {
  const { user } = useAuth();

  // Per-team sessions (used in TeamDetailPage — teams are small, no pagination needed)
  const [teamSessions, setTeamSessions] = useState([]);

  // All sessions across user's teams (paginated)
  const [myAvailableTeamSessions, setMyAvailableTeamSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const offsetRef = useRef(0);

  const fetchTeamSessions = useCallback(async () => {
    if (!teamId) { setTeamSessions([]); return; }
    const { data } = await supabase
      .from('team_sessions')
      .select('*')
      .eq('team_id', teamId)
      .order('session_date', { ascending: false });
    setTeamSessions(data || []);
  }, [teamId]);

  const fetchMyAvailableTeamSessions = useCallback(async (reset = true) => {
    if (!user) { setMyAvailableTeamSessions([]); setLoading(false); return; }

    if (reset) {
      offsetRef.current = 0;
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    const from = offsetRef.current;
    const to = from + PAGE_SIZE - 1;

    // RLS policy (team_id IN get_my_team_ids()) filters to only the user's teams,
    // so no pre-fetch of memberships is needed.
    const { data, count } = await supabase
      .from('team_sessions')
      .select('*, teams(name)', { count: 'exact' })
      .order('session_date', { ascending: false })
      .range(from, to);

    const mapped = (data || []).map(ts => ({
      ...ts,
      team_name: ts.teams?.name || '',
    }));

    const enriched = await enrichWithAggregates(mapped);

    setMyAvailableTeamSessions(prev => reset ? enriched : [...prev, ...enriched]);
    offsetRef.current = from + mapped.length;
    setHasMore(offsetRef.current < (count || 0));

    if (reset) setLoading(false);
    else setLoadingMore(false);
  }, [user]);

  useEffect(() => {
    fetchTeamSessions(); // eslint-disable-line react-hooks/set-state-in-effect
    fetchMyAvailableTeamSessions();
  }, [fetchTeamSessions, fetchMyAvailableTeamSessions]);

  const loadMoreTeamSessions = useCallback(() => {
    if (!loadingMore && hasMore) fetchMyAvailableTeamSessions(false);
  }, [fetchMyAvailableTeamSessions, loadingMore, hasMore]);

  const createTeamSession = useCallback(async (tId, name, sessionDate) => {
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await supabase
      .from('team_sessions')
      .insert({ team_id: tId, name, session_date: sessionDate, created_by: user.id })
      .select()
      .single();
    if (error) return { error: error.message };
    await fetchTeamSessions();
    await fetchMyAvailableTeamSessions(true);
    return { data };
  }, [user, fetchTeamSessions, fetchMyAvailableTeamSessions]);

  const updateTeamSession = useCallback(async (id, { name, session_date, team_id }) => {
    const { error } = await supabase
      .from('team_sessions')
      .update({ name, session_date, team_id })
      .eq('id', id);
    if (error) return { error: error.message };
    await fetchTeamSessions();
    await fetchMyAvailableTeamSessions(true);
    return { ok: true };
  }, [fetchTeamSessions, fetchMyAvailableTeamSessions]);

  const deleteTeamSession = useCallback(async (id) => {
    await supabase.from('team_sessions').delete().eq('id', id);
    await fetchTeamSessions();
    await fetchMyAvailableTeamSessions(true);
  }, [fetchTeamSessions, fetchMyAvailableTeamSessions]);

  return {
    teamSessions, myAvailableTeamSessions,
    loading, loadingMore, hasMore,
    loadMoreTeamSessions, createTeamSession, updateTeamSession, deleteTeamSession,
    refreshTeamSessions: fetchTeamSessions,
    refreshAvailable: () => fetchMyAvailableTeamSessions(true),
  };
}
