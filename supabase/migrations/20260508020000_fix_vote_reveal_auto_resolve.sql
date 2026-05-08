-- Fix: vote_reveal auto-resolves when the opponent is disconnected.
-- Previously both players had to click reveal; if one disconnected,
-- the game was stuck in 'reveal_pending' forever and never appeared
-- in get_match_history (which filters for status = 'finished').
CREATE OR REPLACE FUNCTION vote_reveal(
  p_game_id   uuid,
  p_player_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_game           record;
  v_votes          jsonb;
  v_player_ids     text[];
  v_opp_id         text;
  v_caller_score   int;
  v_opp_score      int;
  v_winner_id      uuid;
  v_connected      jsonb;
  v_should_resolve boolean;
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  IF v_game.status != 'reveal_pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game is not in reveal_pending state');
  END IF;

  v_votes     := COALESCE(v_game.reveal_votes, '[]'::jsonb);
  v_connected := COALESCE(v_game.connected_players, '[]'::jsonb);

  IF NOT (v_votes @> to_jsonb(p_player_id)) THEN
    v_votes := v_votes || to_jsonb(p_player_id);
  END IF;

  SELECT ARRAY(SELECT key FROM jsonb_object_keys(v_game.players) AS key ORDER BY key)
  INTO v_player_ids;

  -- Resolve if every player has voted, OR every non-voter is disconnected.
  v_should_resolve := jsonb_array_length(v_votes) >= array_length(v_player_ids, 1);

  IF NOT v_should_resolve THEN
    v_should_resolve := NOT EXISTS (
      SELECT 1
      FROM unnest(v_player_ids) AS pid
      WHERE pid != p_player_id
        AND v_connected @> to_jsonb(pid)
    );
  END IF;

  IF v_should_resolve THEN
    v_caller_score := _hand_score(v_game.players -> v_game.caller_id::text -> 'hand');

    SELECT t.key INTO v_opp_id
    FROM unnest(v_player_ids) AS t(key)
    WHERE t.key != v_game.caller_id::text
    LIMIT 1;

    v_opp_score := _hand_score(v_game.players -> v_opp_id -> 'hand');

    v_winner_id := CASE
      WHEN v_caller_score < v_opp_score THEN v_game.caller_id
      ELSE v_opp_id::uuid
    END;

    UPDATE games
    SET status         = 'finished',
        reveal_votes   = v_votes,
        winner_id      = v_winner_id,
        last_action_at = now()
    WHERE id = p_game_id;

    RETURN jsonb_build_object('success', true, 'both_voted', true);
  ELSE
    UPDATE games
    SET reveal_votes   = v_votes,
        last_action_at = now()
    WHERE id = p_game_id;

    RETURN jsonb_build_object('success', true, 'both_voted', false);
  END IF;
END;
$$;
