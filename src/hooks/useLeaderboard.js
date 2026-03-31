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
      p_verified_only: params.verifiedOnly || false,
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
      p_verified_only: params.verifiedOnly || false,
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

  // --- Comparison ---
  const [comparison, setComparison] = useState(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  const fetchPlayerComparison = useCallback(async (userIds, filters = {}) => {
    setComparisonLoading(true);
    setComparison(null);
    const { data, error } = await supabase.rpc('get_player_comparison', {
      p_user_ids: userIds,
      p_sport: filters.sport === 'all' ? null : (filters.sport || null),
      p_session_type: filters.sessionType === 'all' ? null : (filters.sessionType || null),
      p_date_from: filters.dateFrom || null,
      p_date_to: filters.dateTo || null,
    });
    if (error) console.error('Player comparison RPC error:', error);
    setComparison(data || []);
    setComparisonLoading(false);
  }, []);

  const fetchTeamComparison = useCallback(async (teamIds, filters = {}) => {
    setComparisonLoading(true);
    setComparison(null);
    const { data, error } = await supabase.rpc('get_team_comparison', {
      p_team_ids: teamIds,
      p_sport: filters.sport === 'all' ? null : (filters.sport || null),
      p_session_type: filters.sessionType === 'all' ? null : (filters.sessionType || null),
      p_date_from: filters.dateFrom || null,
      p_date_to: filters.dateTo || null,
    });
    if (error) console.error('Team comparison RPC error:', error);
    setComparison(data || []);
    setComparisonLoading(false);
  }, []);

  const clearComparison = useCallback(() => {
    setComparison(null);
    setComparisonLoading(false);
  }, []);

  // --- Search for comparison targets ---
  const searchPlayers = useCallback(async (query) => {
    if (!query || query.length < 2) return [];
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, is_verified')
      .ilike('display_name', `%${query}%`)
      .limit(10);
    return data || [];
  }, []);

  const searchTeams = useCallback(async (query) => {
    if (!query || query.length < 2) return [];
    const { data } = await supabase
      .from('teams')
      .select('id, name, avatar_url, sport, is_verified')
      .ilike('name', `%${query}%`)
      .limit(10);
    return data || [];
  }, []);

  return {
    entries, loading, loadingMore, hasMore, fetchIndividual, fetchTeam, clear,
    comparison, comparisonLoading, fetchPlayerComparison, fetchTeamComparison, clearComparison,
    searchPlayers, searchTeams,
  };
}
