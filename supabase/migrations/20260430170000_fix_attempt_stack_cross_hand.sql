-- Allow stacking cards from ANY player's hand, not just the caller's own hand.
-- Rules: the card is removed from whoever holds it (owner); on failure the
-- CALLER (p_player_id) receives the penalty card, not the card owner.
-- Preserves null-slot semantics and the non-null cap check from migration 160000.
CREATE OR REPLACE FUNCTION attempt_stack(
  p_game_id              uuid,
  p_player_id            uuid,
  p_hand_card_id         text,
  p_target_discard_card_id text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_game           record;
  v_players        jsonb;
  v_deck           jsonb;
  v_discard_pile   jsonb;
  v_top_discard    jsonb;
  -- card owner (the player whose hand contains p_hand_card_id)
  v_owner_key      text;
  v_owner          jsonb;
  v_owner_hand     jsonb;
  v_hand_card      jsonb;
  v_hand_card_index int;
  -- stacker (the caller – always receives the penalty on failure)
  v_stacker        jsonb;
  v_stacker_hand   jsonb;
  v_non_null_count int;
  v_empty_slot     int;
  v_penalty_card   jsonb;
  v_shuffled_deck  jsonb;
  v_new_action     jsonb;
  -- loop vars
  v_player_key     text;
  v_candidate_hand jsonb;
  i                int;
BEGIN
  SELECT * INTO v_game
  FROM games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  IF v_game.status NOT IN ('playing', 'final_turn') THEN
    RAISE EXCEPTION 'Game is not in playing state';
  END IF;

  IF NOT (v_game.players ? p_player_id::text) THEN
    RAISE EXCEPTION 'Player not in game';
  END IF;

  v_players      := v_game.players;
  v_deck         := v_game.deck;
  v_discard_pile := v_game.discard_pile;

  -- ── Race-condition checks (set v_new_action to failed if stale) ─────────
  IF jsonb_array_length(v_discard_pile) = 0 THEN
    v_new_action := '{"actionType":"stack_failed","description":"Stack failed: Discard pile is empty!","metadata":{}}'::jsonb;
  ELSE
    v_top_discard := v_discard_pile -> (jsonb_array_length(v_discard_pile) - 1);
    IF v_top_discard->>'id' != p_target_discard_card_id THEN
      v_new_action := '{"actionType":"stack_failed","description":"Stack failed: Too late!","metadata":{}}'::jsonb;
    END IF;
  END IF;

  -- ── Find the card in ANY player's hand ──────────────────────────────────
  v_owner_key       := NULL;
  v_hand_card_index := -1;

  <<find_card>>
  FOR v_player_key IN SELECT jsonb_object_keys(v_players) LOOP
    v_candidate_hand := v_players -> v_player_key -> 'hand';
    FOR i IN 0 .. jsonb_array_length(v_candidate_hand) - 1 LOOP
      IF (v_candidate_hand -> i ->> 'id') = p_hand_card_id THEN
        v_owner_key       := v_player_key;
        v_owner_hand      := v_candidate_hand;
        v_hand_card       := v_candidate_hand -> i;
        v_hand_card_index := i;
        EXIT find_card;   -- break both loops
      END IF;
    END LOOP;
  END LOOP;

  IF v_hand_card_index = -1 THEN
    RAISE EXCEPTION 'Card not found in any player hand';
  END IF;

  v_owner   := v_players -> v_owner_key;
  v_stacker := v_players -> p_player_id::text;
  v_stacker_hand := v_stacker -> 'hand';

  -- ── Rank check / success path ────────────────────────────────────────────
  IF v_new_action IS NULL THEN
    IF v_hand_card->>'rank' != v_top_discard->>'rank' THEN
      v_new_action := '{"actionType":"stack_failed","description":"Stack failed: Wrong card!","metadata":{}}'::jsonb;
    ELSE
      -- Null out the slot in the OWNER's hand (preserves positional memory)
      v_owner_hand  := jsonb_set(v_owner_hand, ARRAY[v_hand_card_index::text], 'null'::jsonb);
      v_hand_card   := jsonb_set(v_hand_card, '{isFaceUp}', 'true'::jsonb);
      v_discard_pile := v_discard_pile || v_hand_card;

      v_owner   := jsonb_set(v_owner,   '{hand}', v_owner_hand);
      v_players := jsonb_set(v_players, ARRAY[v_owner_key], v_owner);

      v_new_action := jsonb_build_object(
        'playerId',   p_player_id,
        'actionType', 'stack_success',
        'description','Successfully stacked a card!',
        'metadata',   jsonb_build_object('highlightedCardIds', jsonb_build_array(p_hand_card_id))
      );

      UPDATE games
      SET players          = v_players,
          discard_pile     = v_discard_pile,
          last_action_at   = now(),
          last_game_action = v_new_action
      WHERE id = p_game_id;

      RETURN jsonb_build_object('success', true, 'action', v_new_action);
    END IF;
  END IF;

  -- ── Penalty path: CALLER (p_player_id) always receives the penalty ───────
  -- Reshuffle deck from discard if empty
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

      v_deck         := COALESCE(v_shuffled_deck, '[]'::jsonb);
      v_discard_pile := jsonb_build_array(v_top_discard);
    END IF;
  END IF;

  IF jsonb_array_length(v_deck) > 0 THEN
    -- Count non-null cards in the STACKER's hand for the 12-card cap
    v_non_null_count := 0;
    FOR i IN 0 .. jsonb_array_length(v_stacker_hand) - 1 LOOP
      IF jsonb_typeof(v_stacker_hand -> i) != 'null' THEN
        v_non_null_count := v_non_null_count + 1;
      END IF;
    END LOOP;

    IF v_non_null_count < 12 THEN
      v_penalty_card := v_deck -> (jsonb_array_length(v_deck) - 1);
      v_deck         := v_deck - (jsonb_array_length(v_deck) - 1);
      v_penalty_card := jsonb_set(v_penalty_card, '{isFaceUp}', 'false'::jsonb);
      v_penalty_card := v_penalty_card - 'knownBy';

      -- Fill the first null slot in the stacker's hand before appending
      v_empty_slot := -1;
      FOR i IN 0 .. jsonb_array_length(v_stacker_hand) - 1 LOOP
        IF jsonb_typeof(v_stacker_hand -> i) = 'null' THEN
          v_empty_slot := i;
          EXIT;
        END IF;
      END LOOP;

      IF v_empty_slot != -1 THEN
        v_stacker_hand := jsonb_set(v_stacker_hand, ARRAY[v_empty_slot::text], v_penalty_card);
      ELSE
        v_stacker_hand := v_stacker_hand || v_penalty_card;
      END IF;

      v_stacker := jsonb_set(v_stacker, '{hand}', v_stacker_hand);
      v_players := jsonb_set(v_players, ARRAY[p_player_id::text], v_stacker);
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
