import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 50;

export function useLeaderboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const fetchIndividual = useCallback(async (params, reset = true) => {
    if (reset) { setLoading(true); setEntries([]); }
    else setLoadingMore(true);

    const offset = reset ? 0 : undefined;

    const { data, error } = await supabase.rpc('get_individual_leaderboard', {
      p_metric: params.metric,
      p_aggregation: params.aggregation || 'best',
      p_team_id: params.teamId || null,
      p_sport: params.sport === 'all' ? null : (params.sport || null),
      p_session_type: params.sessionType === 'all' ? null : (params.sessionType || null),
      p_date_from: params.dateFrom || null,
      p_date_to: params.dateTo || null,
      p_age_min: params.ageMin || null,
      p_age_max: params.ageMax || null,
      p_positions: params.positions || null,
      p_province: params.province || null,
      p_country: params.country || null,
      p_limit: PAGE_SIZE,
      p_offset: offset ?? 0,
    });

    if (error) {
      console.error('Leaderboard RPC error:', error);
      if (reset) setEntries([]);
    } else {
      const rows = data || [];
      if (reset) setEntries(rows);
      else setEntries(prev => [...prev, ...rows]);
      setHasMore(rows.length >= PAGE_SIZE);
    }

    setLoading(false);
    setLoadingMore(false);
  }, []);

  const fetchTeam = useCallback(async (params, reset = true) => {
    if (reset) { setLoading(true); setEntries([]); }
    else setLoadingMore(true);

    const offset = reset ? 0 : undefined;

    const { data, error } = await supabase.rpc('get_team_leaderboard', {
      p_metric: params.metric,
      p_agg_type: params.aggType || 'avg',
      p_sport: params.sport === 'all' ? null : (params.sport || null),
      p_session_type: params.sessionType === 'all' ? null : (params.sessionType || null),
      p_date_from: params.dateFrom || null,
      p_date_to: params.dateTo || null,
      p_limit: PAGE_SIZE,
      p_offset: offset ?? 0,
    });

    if (error) {
      console.error('Team leaderboard RPC error:', error);
      if (reset) setEntries([]);
    } else {
      const rows = data || [];
      if (reset) setEntries(rows);
      else setEntries(prev => [...prev, ...rows]);
      setHasMore(rows.length >= PAGE_SIZE);
    }

    setLoading(false);
    setLoadingMore(false);
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
    setLoading(true);
    setHasMore(false);
  }, []);

  return { entries, loading, loadingMore, hasMore, fetchIndividual, fetchTeam, clear };
}
