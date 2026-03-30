-- 1. Add is_public column to teams (default true = visible on leaderboard)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

-- 2. Drop existing functions whose return types are changing
DROP FUNCTION IF EXISTS get_individual_leaderboard(text,text,uuid,text,text,date,date,integer,integer,text[],text,text,integer,integer);
DROP FUNCTION IF EXISTS get_team_leaderboard(text,text,text,text,date,date,integer,integer);

-- 3. Recreate get_individual_leaderboard with privacy filter
CREATE OR REPLACE FUNCTION get_individual_leaderboard(
  p_metric     text,
  p_aggregation text DEFAULT 'best',
  p_team_id    uuid DEFAULT NULL,
  p_sport      text DEFAULT NULL,
  p_session_type text DEFAULT NULL,
  p_date_from  date DEFAULT NULL,
  p_date_to    date DEFAULT NULL,
  p_age_min    int  DEFAULT NULL,
  p_age_max    int  DEFAULT NULL,
  p_positions  text[] DEFAULT NULL,
  p_province   text DEFAULT NULL,
  p_country    text DEFAULT NULL,
  p_limit      int  DEFAULT 50,
  p_offset     int  DEFAULT 0
)
RETURNS TABLE(
  user_id       uuid,
  display_name  text,
  avatar_url    text,
  metric_value  double precision,
  session_count bigint,
  rank          bigint
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH filtered_sessions AS (
    SELECT
      s.user_id,
      (s.metrics->>p_metric)::double precision AS val
    FROM sessions s
    JOIN profiles p ON p.id = s.user_id
    WHERE (s.metrics->>p_metric) IS NOT NULL
      AND (s.metrics->>p_metric)::double precision > 0
      -- Privacy filter: exclude profiles where is_public is explicitly false
      AND COALESCE((p.athlete_profile->>'is_public')::boolean, true) = true
      AND (p_sport IS NULL OR s.sport = p_sport)
      AND (p_session_type IS NULL OR s.session_type = p_session_type)
      AND (p_date_from IS NULL OR s.session_date >= p_date_from)
      AND (p_date_to IS NULL OR s.session_date <= (p_date_to + interval '1 day'))
      AND (p_team_id IS NULL OR s.team_session_id IN (
        SELECT ts.id FROM team_sessions ts WHERE ts.team_id = p_team_id
      ))
      AND (p_age_min IS NULL OR (p.athlete_profile->>'age')::int >= p_age_min)
      AND (p_age_max IS NULL OR (p.athlete_profile->>'age')::int <= p_age_max)
      AND (p_positions IS NULL OR EXISTS (
        SELECT 1 FROM jsonb_each(COALESCE(p.athlete_profile->'positionsBySport', '{}'::jsonb)) AS sp(sport_key, pos_arr)
        WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(pos_arr) AS pos
          WHERE pos = ANY(p_positions)
        )
      ))
      AND (p_province IS NULL OR (p.athlete_profile->>'province') = p_province)
      AND (p_country IS NULL OR (p.athlete_profile->>'country') = p_country)
  ),
  aggregated AS (
    SELECT
      fs.user_id,
      CASE p_aggregation
        WHEN 'average' THEN AVG(fs.val)
        ELSE MAX(fs.val)
      END AS metric_value,
      COUNT(*) AS session_count
    FROM filtered_sessions fs
    GROUP BY fs.user_id
  )
  SELECT
    a.user_id,
    p.display_name,
    p.avatar_url,
    a.metric_value,
    a.session_count,
    ROW_NUMBER() OVER (ORDER BY a.metric_value DESC) AS rank
  FROM aggregated a
  JOIN profiles p ON p.id = a.user_id
  ORDER BY a.metric_value DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 4. Recreate get_team_leaderboard with privacy filter
CREATE OR REPLACE FUNCTION get_team_leaderboard(
  p_metric       text,
  p_agg_type     text DEFAULT 'avg',
  p_sport        text DEFAULT NULL,
  p_session_type text DEFAULT NULL,
  p_date_from    date DEFAULT NULL,
  p_date_to      date DEFAULT NULL,
  p_limit        int  DEFAULT 50,
  p_offset       int  DEFAULT 0
)
RETURNS TABLE(
  team_id         uuid,
  team_name       text,
  team_avatar_url text,
  metric_value    double precision,
  session_count   bigint,
  player_count    bigint,
  rank            bigint
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH team_sessions_filtered AS (
    SELECT
      ts.team_id,
      s.user_id,
      (s.metrics->>p_metric)::double precision AS val
    FROM sessions s
    JOIN team_sessions ts ON ts.id = s.team_session_id
    JOIN teams t ON t.id = ts.team_id
    WHERE s.team_session_id IS NOT NULL
      AND (s.metrics->>p_metric) IS NOT NULL
      AND (s.metrics->>p_metric)::double precision > 0
      -- Privacy filter: exclude private teams
      AND t.is_public = true
      AND (p_sport IS NULL OR t.sport = p_sport)
      AND (p_session_type IS NULL OR s.session_type = p_session_type)
      AND (p_date_from IS NULL OR s.session_date >= p_date_from)
      AND (p_date_to IS NULL OR s.session_date <= (p_date_to + interval '1 day'))
  ),
  aggregated AS (
    SELECT
      tsf.team_id,
      CASE p_agg_type
        WHEN 'sum' THEN SUM(tsf.val)
        WHEN 'max' THEN MAX(tsf.val)
        ELSE AVG(tsf.val)
      END AS metric_value,
      COUNT(*) AS session_count,
      COUNT(DISTINCT tsf.user_id) AS player_count
    FROM team_sessions_filtered tsf
    GROUP BY tsf.team_id
  )
  SELECT
    a.team_id,
    t.name AS team_name,
    t.avatar_url AS team_avatar_url,
    a.metric_value,
    a.session_count,
    a.player_count,
    ROW_NUMBER() OVER (ORDER BY a.metric_value DESC) AS rank
  FROM aggregated a
  JOIN teams t ON t.id = a.team_id
  ORDER BY a.metric_value DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 5. RPC for player comparison: returns metrics for two specific players
CREATE OR REPLACE FUNCTION get_player_comparison(
  p_user_ids   uuid[],
  p_sport      text DEFAULT NULL,
  p_session_type text DEFAULT NULL,
  p_date_from  date DEFAULT NULL,
  p_date_to    date DEFAULT NULL
)
RETURNS TABLE(
  user_id        uuid,
  display_name   text,
  avatar_url     text,
  session_count  bigint,
  best_maxSpeedMs   double precision,
  avg_maxSpeedMs    double precision,
  best_avgSpeed     double precision,
  avg_avgSpeed      double precision,
  best_totalDist    double precision,
  avg_totalDist     double precision,
  total_sprints     bigint,
  avg_sprints       double precision,
  total_impacts     bigint,
  avg_impacts       double precision,
  best_playerLoad   double precision,
  avg_playerLoad    double precision,
  best_peakPower    double precision,
  avg_peakPower     double precision,
  total_totalCal    double precision,
  avg_totalCal      double precision,
  avg_plPerMin      double precision
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.user_id,
    p.display_name,
    p.avatar_url,
    COUNT(*)::bigint AS session_count,
    MAX((s.metrics->>'maxSpeedMs')::double precision)   AS best_maxSpeedMs,
    AVG((s.metrics->>'maxSpeedMs')::double precision)   AS avg_maxSpeedMs,
    MAX((s.metrics->>'avgSpeed')::double precision)     AS best_avgSpeed,
    AVG((s.metrics->>'avgSpeed')::double precision)     AS avg_avgSpeed,
    MAX((s.metrics->>'totalDist')::double precision)    AS best_totalDist,
    AVG((s.metrics->>'totalDist')::double precision)    AS avg_totalDist,
    SUM((s.metrics->>'sprints')::bigint)::bigint          AS total_sprints,
    AVG((s.metrics->>'sprints')::double precision)      AS avg_sprints,
    SUM((s.metrics->>'impacts')::bigint)::bigint        AS total_impacts,
    AVG((s.metrics->>'impacts')::double precision)      AS avg_impacts,
    MAX((s.metrics->>'playerLoad')::double precision)   AS best_playerLoad,
    AVG((s.metrics->>'playerLoad')::double precision)   AS avg_playerLoad,
    MAX((s.metrics->>'peakPower')::double precision)    AS best_peakPower,
    AVG((s.metrics->>'peakPower')::double precision)    AS avg_peakPower,
    SUM((s.metrics->>'totalCal')::double precision)     AS total_totalCal,
    AVG((s.metrics->>'totalCal')::double precision)     AS avg_totalCal,
    AVG((s.metrics->>'plPerMin')::double precision)     AS avg_plPerMin
  FROM sessions s
  JOIN profiles p ON p.id = s.user_id
  WHERE s.user_id = ANY(p_user_ids)
    AND (p_sport IS NULL OR s.sport = p_sport)
    AND (p_session_type IS NULL OR s.session_type = p_session_type)
    AND (p_date_from IS NULL OR s.session_date >= p_date_from)
    AND (p_date_to IS NULL OR s.session_date <= (p_date_to + interval '1 day'))
  GROUP BY s.user_id, p.display_name, p.avatar_url;
END;
$$;

-- 6. RPC for team comparison: returns metrics for two specific teams
CREATE OR REPLACE FUNCTION get_team_comparison(
  p_team_ids     uuid[],
  p_sport        text DEFAULT NULL,
  p_session_type text DEFAULT NULL,
  p_date_from    date DEFAULT NULL,
  p_date_to      date DEFAULT NULL
)
RETURNS TABLE(
  team_id           uuid,
  team_name         text,
  team_avatar_url   text,
  player_count      bigint,
  session_count     bigint,
  avg_maxSpeedMs    double precision,
  max_maxSpeedMs    double precision,
  avg_avgSpeed      double precision,
  sum_totalDist     double precision,
  avg_totalDist     double precision,
  sum_sprints       bigint,
  avg_sprints       double precision,
  sum_impacts       bigint,
  avg_impacts       double precision,
  avg_playerLoad    double precision,
  avg_peakPower     double precision,
  sum_totalCal      double precision,
  avg_plPerMin      double precision
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id AS team_id,
    t.name AS team_name,
    t.avatar_url AS team_avatar_url,
    COUNT(DISTINCT s.user_id)::bigint AS player_count,
    COUNT(*)::bigint AS session_count,
    AVG((s.metrics->>'maxSpeedMs')::double precision) AS avg_maxSpeedMs,
    MAX((s.metrics->>'maxSpeedMs')::double precision) AS max_maxSpeedMs,
    AVG((s.metrics->>'avgSpeed')::double precision)   AS avg_avgSpeed,
    SUM((s.metrics->>'totalDist')::double precision)  AS sum_totalDist,
    AVG((s.metrics->>'totalDist')::double precision)  AS avg_totalDist,
    SUM((s.metrics->>'sprints')::bigint)::bigint      AS sum_sprints,
    AVG((s.metrics->>'sprints')::double precision)    AS avg_sprints,
    SUM((s.metrics->>'impacts')::bigint)::bigint      AS sum_impacts,
    AVG((s.metrics->>'impacts')::double precision)    AS avg_impacts,
    AVG((s.metrics->>'playerLoad')::double precision) AS avg_playerLoad,
    AVG((s.metrics->>'peakPower')::double precision)  AS avg_peakPower,
    SUM((s.metrics->>'totalCal')::double precision)   AS sum_totalCal,
    AVG((s.metrics->>'plPerMin')::double precision)   AS avg_plPerMin
  FROM teams t
  JOIN team_sessions ts ON ts.team_id = t.id
  JOIN sessions s ON s.team_session_id = ts.id
  WHERE t.id = ANY(p_team_ids)
    AND (p_sport IS NULL OR t.sport = p_sport)
    AND (p_session_type IS NULL OR s.session_type = p_session_type)
    AND (p_date_from IS NULL OR s.session_date >= p_date_from)
    AND (p_date_to IS NULL OR s.session_date <= (p_date_to + interval '1 day'))
  GROUP BY t.id, t.name, t.avatar_url;
END;
$$;
