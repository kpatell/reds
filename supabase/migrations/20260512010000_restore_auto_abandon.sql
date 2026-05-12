-- Restore auto-abandonment: when the last connected player leaves,
-- set status = 'abandoned' on any active game. This fires the
-- record_match_result trigger which writes an 'abandoned' row to
-- match_results (no winner, excluded from W/L ratio).
--
-- The browser-refresh concern that prompted the earlier removal
-- (20260506000000) does not apply here: player_disconnected is
-- only called by explicit Leave actions and by the presence
-- 'leave' handler for the *opponent* — never for the local player
-- on a transient reconnect, so a refresh cannot self-abandon.
CREATE OR REPLACE FUNCTION public.player_disconnected(p_game_id uuid, p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining jsonb;
BEGIN
  UPDATE games
  SET connected_players = (
    SELECT COALESCE(jsonb_agg(t.val), '[]'::jsonb)
    FROM jsonb_array_elements_text(COALESCE(connected_players, '[]'::jsonb)) AS t(val)
    WHERE t.val != p_player_id::text
  ),
  last_action_at = now()
  WHERE id = p_game_id
  RETURNING connected_players INTO v_remaining;

  -- Abandon active games that now have no connected players.
  -- 'waiting' is excluded: the host may still be sharing the code.
  -- 'finished' / 'abandoned' are excluded: already terminal.
  IF v_remaining IS NOT NULL
    AND jsonb_array_length(COALESCE(v_remaining, '[]'::jsonb)) = 0
  THEN
    UPDATE games
    SET status = 'abandoned'
    WHERE id = p_game_id
      AND status IN ('playing', 'final_turn', 'reveal_pending');
  END IF;
END;
$$;
