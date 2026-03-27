-- ============================================================
-- Leaderboard RPC functions
-- Run in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. Individual leaderboard
-- ============================================================
CREATE OR REPLACE FUNCTION get_individual_leaderboard(
  p_metric       text,
  p_aggregation  text    DEFAULT 'best',      -- 'best' | 'average'
  p_team_id      uuid    DEFAULT NULL,
  p_sport        text    DEFAULT NULL,
  p_session_type text    DEFAULT NULL,         -- 'game' | 'practice' | NULL for all
  p_date_from    date    DEFAULT NULL,
  p_date_to      date    DEFAULT NULL,
  p_age_min      int     DEFAULT NULL,
  p_age_max      int     DEFAULT NULL,
  p_positions    text[]  DEFAULT NULL,
  p_province     text    DEFAULT NULL,
  p_country      text    DEFAULT NULL,
  p_limit        int     DEFAULT 50,
  p_offset       int     DEFAULT 0
)
RETURNS TABLE(
  rank           bigint,
  user_id        uuid,
  display_name   text,
  avatar_url     text,
  metric_value   numeric,
  session_count  bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH session_metrics AS (
    SELECT
      s.user_id,
      -- Prefer the combined split's metric, fall back to full-session metric
      COALESCE(
        (SELECT (elem->'metrics'->>p_metric)::numeric
         FROM jsonb_array_elements(s.splits) elem
         WHERE (elem->>'isCombined')::boolean = true
         LIMIT 1),
        (s.metrics->>p_metric)::numeric
      ) AS val
    FROM sessions s
    WHERE
      -- At least one source must have the metric
      (
        (s.metrics->>p_metric) IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(s.splits) elem
          WHERE (elem->>'isCombined')::boolean = true
            AND (elem->'metrics'->>p_metric) IS NOT NULL
        )
      )
      AND (p_sport IS NULL OR s.sport = p_sport)
      AND (p_session_type IS NULL OR s.session_type = p_session_type)
      AND (p_date_from IS NULL OR s.session_date::date >= p_date_from)
      AND (p_date_to IS NULL OR s.session_date::date <= p_date_to)
      AND (p_team_id IS NULL OR s.user_id IN (
        SELECT tm.user_id FROM team_members tm WHERE tm.team_id = p_team_id
      ))
  ),
  aggregated AS (
    SELECT
      sm.user_id,
      CASE p_aggregation
        WHEN 'average' THEN AVG(sm.val)
        ELSE MAX(sm.val)     -- 'best' or any other value
      END AS agg_val,
      COUNT(*) AS sess_count
    FROM session_metrics sm
    WHERE sm.val IS NOT NULL
    GROUP BY sm.user_id
  ),
  filtered AS (
    SELECT
      a.user_id,
      a.agg_val,
      a.sess_count,
      p.display_name,
      p.avatar_url
    FROM aggregated a
    JOIN profiles p ON p.id = a.user_id
    WHERE
      (p_age_min IS NULL OR (p.athlete_profile->>'age')::int >= p_age_min)
      AND (p_age_max IS NULL OR (p.athlete_profile->>'age')::int <= p_age_max)
      AND (p_positions IS NULL OR EXISTS (
        SELECT 1 FROM jsonb_each(COALESCE(p.athlete_profile->'positionsBySport', '{}'::jsonb)) sport_entry,
             jsonb_array_elements_text(sport_entry.value) pos
        WHERE LOWER(pos) = ANY(SELECT LOWER(unnest(p_positions)))
      ))
      AND (p_province IS NULL OR LOWER(p.athlete_profile->>'province') = LOWER(p_province))
      AND (p_country IS NULL OR LOWER(p.athlete_profile->>'country') = LOWER(p_country))
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY f.agg_val DESC) AS rank,
    f.user_id,
    f.display_name,
    f.avatar_url,
    ROUND(f.agg_val, 4) AS metric_value,
    f.sess_count AS session_count
  FROM filtered f
  ORDER BY f.agg_val DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


-- ============================================================
-- 2. Team leaderboard
-- ============================================================
CREATE OR REPLACE FUNCTION get_team_leaderboard(
  p_metric       text,
  p_agg_type     text    DEFAULT 'avg',        -- how to combine players: 'sum' | 'avg' | 'max'
  p_sport        text    DEFAULT NULL,
  p_session_type text    DEFAULT NULL,
  p_date_from    date    DEFAULT NULL,
  p_date_to      date    DEFAULT NULL,
  p_limit        int     DEFAULT 50,
  p_offset       int     DEFAULT 0
)
RETURNS TABLE(
  rank           bigint,
  team_id        uuid,
  team_name      text,
  team_avatar_url text,
  metric_value   numeric,
  session_count  bigint,
  player_count   bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH team_session_player_metrics AS (
    -- For each team session, extract per-player metric values
    SELECT
      ts.team_id,
      ts.id AS ts_id,
      s.user_id,
      COALESCE(
        (SELECT (elem->'metrics'->>p_metric)::numeric
         FROM jsonb_array_elements(s.splits) elem
         WHERE (elem->>'isCombined')::boolean = true
         LIMIT 1),
        (s.metrics->>p_metric)::numeric
      ) AS val
    FROM team_sessions ts
    JOIN sessions s ON s.team_session_id = ts.id
    WHERE
      (
        (s.metrics->>p_metric) IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(s.splits) elem
          WHERE (elem->>'isCombined')::boolean = true
            AND (elem->'metrics'->>p_metric) IS NOT NULL
        )
      )
      AND (p_sport IS NULL OR ts.team_id IN (
        SELECT t.id FROM teams t WHERE t.sport = p_sport
      ))
      AND (p_session_type IS NULL OR s.session_type = p_session_type)
      AND (p_date_from IS NULL OR ts.session_date >= p_date_from)
      AND (p_date_to IS NULL OR ts.session_date <= p_date_to)
  ),
  per_team_session AS (
    -- Aggregate players within each team session
    SELECT
      m.team_id,
      m.ts_id,
      CASE p_agg_type
        WHEN 'sum' THEN SUM(m.val)
        WHEN 'max' THEN MAX(m.val)
        ELSE AVG(m.val)
      END AS session_val,
      COUNT(DISTINCT m.user_id) AS players
    FROM team_session_player_metrics m
    WHERE m.val IS NOT NULL
    GROUP BY m.team_id, m.ts_id
  ),
  per_team AS (
    -- Average across all team sessions for each team
    SELECT
      pts.team_id,
      AVG(pts.session_val) AS team_val,
      COUNT(*) AS sess_count,
      MAX(pts.players) AS max_players
    FROM per_team_session pts
    GROUP BY pts.team_id
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY pt.team_val DESC) AS rank,
    pt.team_id,
    t.name AS team_name,
    t.avatar_url AS team_avatar_url,
    ROUND(pt.team_val, 4) AS metric_value,
    pt.sess_count AS session_count,
    pt.max_players AS player_count
  FROM per_team pt
  JOIN teams t ON t.id = pt.team_id
  ORDER BY pt.team_val DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
