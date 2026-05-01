-- Expand status constraint to allow 'final_turn'
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_status_check;
ALTER TABLE games ADD CONSTRAINT games_status_check
  CHECK (status IN ('waiting', 'playing', 'final_turn', 'finished'));

-- Add end-game tracking columns
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS winner_id uuid REFERENCES auth.users,
  ADD COLUMN IF NOT EXISTS caller_id uuid REFERENCES auth.users;

-- Update attempt_stack: allow stacking during 'final_turn' as well
CREATE OR REPLACE FUNCTION attempt_stack(
  p_game_id uuid,
  p_player_id uuid,
  p_hand_card_id text,
  p_target_discard_card_id text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_game record;
  v_players jsonb;
  v_deck jsonb;
  v_discard_pile jsonb;
  v_player jsonb;
  v_hand jsonb;
  v_hand_card jsonb;
  v_hand_card_index int;
  v_top_discard jsonb;
  v_penalty_card jsonb;
  v_new_action jsonb;
  v_shuffled_deck jsonb;
BEGIN
  SELECT * INTO v_game
  FROM games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  -- Stacking allowed during both 'playing' and 'final_turn'
  IF v_game.status NOT IN ('playing', 'final_turn') THEN
    RAISE EXCEPTION 'Game is not in playing state';
  END IF;

  v_players := v_game.players;
  v_deck := v_game.deck;
  v_discard_pile := v_game.discard_pile;

  IF jsonb_array_length(v_discard_pile) = 0 THEN
    v_new_action := '{"actionType": "stack_failed", "description": "Stack failed: Discard pile is empty!", "metadata": {}}'::jsonb;
  ELSE
    v_top_discard := v_discard_pile -> (jsonb_array_length(v_discard_pile) - 1);
    IF v_top_discard->>'id' != p_target_discard_card_id THEN
      v_new_action := '{"actionType": "stack_failed", "description": "Stack failed: Too late!", "metadata": {}}'::jsonb;
    END IF;
  END IF;

  IF NOT v_players ? p_player_id::text THEN
    RAISE EXCEPTION 'Player not in game';
  END IF;

  v_player := v_players -> p_player_id::text;
  v_hand := v_player -> 'hand';

  v_hand_card_index := -1;
  FOR i IN 0 .. jsonb_array_length(v_hand) - 1 LOOP
    IF (v_hand -> i ->> 'id') = p_hand_card_id THEN
      v_hand_card := v_hand -> i;
      v_hand_card_index := i;
      EXIT;
    END IF;
  END LOOP;

  IF v_hand_card_index = -1 THEN
    RAISE EXCEPTION 'Card not found in player hand';
  END IF;

  IF v_new_action IS NULL THEN
    IF v_hand_card->>'rank' != v_top_discard->>'rank' THEN
      v_new_action := '{"actionType": "stack_failed", "description": "Stack failed: Wrong card!", "metadata": {}}'::jsonb;
    ELSE
      -- Null out the slot so other cards stay in their memorized positions
      v_hand := jsonb_set(v_hand, ARRAY[v_hand_card_index::text], 'null'::jsonb);
      v_hand_card := jsonb_set(v_hand_card, '{isFaceUp}', 'true'::jsonb);
      v_discard_pile := v_discard_pile || v_hand_card;

      v_player := jsonb_set(v_player, '{hand}', v_hand);
      v_players := jsonb_set(v_players, ARRAY[p_player_id::text], v_player);

      v_new_action := jsonb_build_object(
        'playerId',    p_player_id,
        'actionType',  'stack_success',
        'description', 'Successfully stacked a card!',
        'metadata',    jsonb_build_object('highlightedCardIds', jsonb_build_array(p_hand_card_id))
      );

      UPDATE games
      SET players        = v_players,
          discard_pile   = v_discard_pile,
          last_action_at = now(),
          last_game_action = v_new_action
      WHERE id = p_game_id;

      RETURN jsonb_build_object('success', true, 'action', v_new_action);
    END IF;
  END IF;

  -- Penalty path
  IF jsonb_array_length(v_deck) = 0 THEN
    IF jsonb_array_length(v_discard_pile) > 1 THEN
      v_top_discard := v_discard_pile -> (jsonb_array_length(v_discard_pile) - 1);

      SELECT jsonb_agg(elem) INTO v_shuffled_deck
      FROM (
        SELECT value AS elem
        FROM jsonb_array_elements(v_discard_pile) WITH ORDINALITY arr(value, idx)
        WHERE idx < jsonb_array_length(v_discard_pile)
        ORDER BY random()
      ) s;

      v_deck := COALESCE(v_shuffled_deck, '[]'::jsonb);
      v_discard_pile := jsonb_build_array(v_top_discard);
    END IF;
  END IF;

  IF jsonb_array_length(v_deck) > 0 THEN
    IF jsonb_array_length(v_hand) < 12 THEN
      v_penalty_card := v_deck -> (jsonb_array_length(v_deck) - 1);
      v_deck := v_deck - (jsonb_array_length(v_deck) - 1);
      v_penalty_card := jsonb_set(v_penalty_card, '{isFaceUp}', 'false'::jsonb);
      v_penalty_card := v_penalty_card - 'knownBy';

      v_hand := v_hand || v_penalty_card;
      v_player := jsonb_set(v_player, '{hand}', v_hand);
      v_players := jsonb_set(v_players, ARRAY[p_player_id::text], v_player);
    END IF;
  END IF;

  v_new_action := jsonb_set(v_new_action, '{playerId}', to_jsonb(p_player_id));

  UPDATE games
  SET players          = v_players,
      deck             = v_deck,
      discard_pile     = v_discard_pile,
      last_action_at   = now(),
      last_game_action = v_new_action
  WHERE id = p_game_id;

  RETURN jsonb_build_object('success', false, 'action', v_new_action);
END;
$$;

-- RPC: call_reds
-- Atomically validates the caller's turn and transitions game to 'final_turn'.
-- Opponent receives exactly one last turn.
CREATE OR REPLACE FUNCTION call_reds(
  p_game_id uuid,
  p_player_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_game        record;
  v_player_ids  text[];
  v_current_idx int;
  v_next_id     uuid;
BEGIN
  SELECT * INTO v_game
  FROM games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  IF v_game.status != 'playing' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game is not in playing state');
  END IF;

  IF v_game.current_turn_player_id != p_player_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your turn');
  END IF;

  IF v_game.turn_phase != 'draw' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only call REDS before drawing');
  END IF;

  -- Sort player IDs alphabetically — matches TypeScript Object.keys().sort()
  SELECT ARRAY(
    SELECT key FROM jsonb_object_keys(v_game.players) AS key ORDER BY key
  ) INTO v_player_ids;

  -- 0-based current index
  SELECT idx - 1 INTO v_current_idx
  FROM unnest(v_player_ids) WITH ORDINALITY t(id, idx)
  WHERE id = p_player_id::text;

  -- PG arrays are 1-indexed; mod gives next 0-based index, then +1 for PG
  v_next_id := (v_player_ids[((v_current_idx + 1) % array_length(v_player_ids, 1)) + 1])::uuid;

  -- Explicitly re-write deck and discard_pile so that Supabase Realtime
  -- includes them in the WAL diff payload. Without this, unchanged JSONB
  -- columns are omitted from payload.new, causing clients to see deck = 0.
  UPDATE games
  SET status                 = 'final_turn',
      caller_id              = p_player_id,
      current_turn_player_id = v_next_id,
      turn_phase             = 'draw',
      deck                   = v_game.deck,
      discard_pile           = v_game.discard_pile,
      last_action_at         = now(),
      last_game_action       = jsonb_build_object(
        'playerId',    p_player_id,
        'actionType',  'call_reds',
        'description', 'Called REDS! Opponent gets one last turn.'
      )
  WHERE id = p_game_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
