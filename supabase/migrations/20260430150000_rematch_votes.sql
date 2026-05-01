-- Track per-player rematch consent on the games row
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS rematch_votes jsonb DEFAULT '[]'::jsonb;

-- RPC: vote_rematch
-- Atomically records a player's vote. Returns {success, both_agreed}.
-- When both_agreed=true the calling client triggers a new-game init.
CREATE OR REPLACE FUNCTION vote_rematch(
  p_game_id   uuid,
  p_player_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_game         record;
  v_votes        jsonb;
  v_player_count int;
BEGIN
  SELECT * INTO v_game
  FROM games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  IF v_game.status != 'finished' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game is not finished');
  END IF;

  IF NOT (v_game.players ? p_player_id::text) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player not in game');
  END IF;

  v_votes := COALESCE(v_game.rematch_votes, '[]'::jsonb);

  -- Idempotent: only append if player hasn't already voted
  IF NOT (v_votes @> to_jsonb(p_player_id::text)) THEN
    v_votes := v_votes || to_jsonb(p_player_id::text);
  END IF;

  SELECT count(*) INTO v_player_count
  FROM jsonb_object_keys(v_game.players);

  UPDATE games
  SET rematch_votes = v_votes,
      last_action_at = now()
  WHERE id = p_game_id;

  RETURN jsonb_build_object(
    'success',     true,
    'votes',       v_votes,
    'both_agreed', jsonb_array_length(v_votes) >= v_player_count
  );
END;
$$;
