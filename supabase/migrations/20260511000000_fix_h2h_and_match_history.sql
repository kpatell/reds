-- Fix get_match_history and get_head_to_head to recover historical games where
-- the players JSONB was wiped by the old leave_game RPC. Falls back to
-- reveal_votes then rematch_votes to determine player participation.

CREATE OR REPLACE FUNCTION public.get_match_history(p_player_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'game_id',             g.id,
      'created_at',          g.created_at,
      'won',                 g.winner_id = p_player_id,
      'opponent_id',         opp.opp_id,
      'opponent_username',   p.username,
      'opponent_avatar_url', p.avatar_url
    )
    ORDER BY g.created_at DESC
  )
  INTO v_result
  FROM games g
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      -- Primary: players JSONB object keys
      (
        SELECT key::uuid
        FROM jsonb_object_keys(COALESCE(g.players, '{}'::jsonb)) AS key
        WHERE key::uuid <> p_player_id
        LIMIT 1
      ),
      -- Fallback 1: reveal_votes array (preserved even when players was wiped)
      (
        SELECT elem::uuid
        FROM jsonb_array_elements_text(COALESCE(g.reveal_votes, '[]'::jsonb)) AS elem
        WHERE elem::uuid <> p_player_id
        LIMIT 1
      ),
      -- Fallback 2: rematch_votes array
      (
        SELECT elem::uuid
        FROM jsonb_array_elements_text(COALESCE(g.rematch_votes, '[]'::jsonb)) AS elem
        WHERE elem::uuid <> p_player_id
        LIMIT 1
      )
    ) AS opp_id
  ) opp
  LEFT JOIN profiles p ON p.id = opp.opp_id
  WHERE g.status    = 'finished'
    AND g.winner_id IS NOT NULL
    AND (
      (g.players ? p_player_id::text)
      OR (g.reveal_votes  @> jsonb_build_array(p_player_id::text))
      OR (g.rematch_votes @> jsonb_build_array(p_player_id::text))
    );

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_head_to_head(
  p_player_id   uuid,
  p_opponent_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_wins   integer := 0;
  v_losses integer := 0;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE winner_id = p_player_id),
    COUNT(*) FILTER (WHERE winner_id = p_opponent_id)
  INTO v_wins, v_losses
  FROM games
  WHERE status    = 'finished'
    AND winner_id IS NOT NULL
    AND (
      (players ? p_player_id::text)
      OR (reveal_votes  @> jsonb_build_array(p_player_id::text))
      OR (rematch_votes @> jsonb_build_array(p_player_id::text))
    )
    AND (
      (players ? p_opponent_id::text)
      OR (reveal_votes  @> jsonb_build_array(p_opponent_id::text))
      OR (rematch_votes @> jsonb_build_array(p_opponent_id::text))
    );

  RETURN jsonb_build_object('wins', v_wins, 'losses', v_losses);
END;
$$;
