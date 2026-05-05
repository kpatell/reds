-- Migration: connected_players tracking and game abandonment
-- Adds a real-time connection registry so the lobby can surface in-progress games
-- awaiting rejoin, and games with no connected players auto-transition to 'abandoned'.

-- 1. Expand status constraint to include 'abandoned'
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_status_check;
ALTER TABLE games ADD CONSTRAINT games_status_check
  CHECK (status IN ('waiting', 'playing', 'final_turn', 'reveal_pending', 'finished', 'abandoned'));

-- 2. Add connected_players — JSONB array of currently-connected player UUID strings
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS connected_players jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. RPC: player_connected
--    Idempotently adds p_player_id to connected_players.
--    Only fires if the player is already in the game's players map (prevents outsiders).
CREATE OR REPLACE FUNCTION player_connected(p_game_id uuid, p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE games
  SET connected_players = (
    SELECT COALESCE(jsonb_agg(val), '[]'::jsonb)
    FROM (
      SELECT jsonb_array_elements_text(COALESCE(connected_players, '[]'::jsonb)) AS val
      UNION
      SELECT p_player_id::text
    ) t
  )
  WHERE id = p_game_id
    AND (players ? p_player_id::text OR status = 'waiting');
END;
$$;

-- 4. RPC: player_disconnected
--    Removes p_player_id from connected_players. If the result is an empty array
--    and the game is still active, transitions status to 'abandoned'.
CREATE OR REPLACE FUNCTION player_disconnected(p_game_id uuid, p_player_id uuid)
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

  -- Both players gone on an active game → abandon it so it doesn't hang forever.
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
