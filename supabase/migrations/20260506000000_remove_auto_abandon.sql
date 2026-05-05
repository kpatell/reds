-- Remove auto-abandonment on empty connected_players so a browser refresh
-- (which briefly drops the count to 0) does not destroy an active game.
-- Games now persist until both players explicitly leave or the stale-threshold
-- TTL in the lobby query (6 h) expires.
CREATE OR REPLACE FUNCTION player_disconnected(p_game_id uuid, p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE games
  SET connected_players = (
    SELECT COALESCE(jsonb_agg(t.val), '[]'::jsonb)
    FROM jsonb_array_elements_text(COALESCE(connected_players, '[]'::jsonb)) AS t(val)
    WHERE t.val != p_player_id::text
  ),
  last_action_at = now()
  WHERE id = p_game_id;
END;
$$;
