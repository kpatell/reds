-- ============================================================
-- Migration: reveal_pending phase
-- After the final turn, the game enters 'reveal_pending' instead
-- of jumping straight to 'finished'. During this phase, stacking
-- is still allowed. Both players must call vote_reveal to trigger
-- the final scoring and transition to 'finished'.
-- ============================================================

-- 1. Expand status constraint
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_status_check;
ALTER TABLE games ADD CONSTRAINT games_status_check
  CHECK (status IN ('waiting', 'playing', 'final_turn', 'reveal_pending', 'finished'));

-- 2. Tracking column for reveal votes
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS reveal_votes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. Scoring helpers (used by vote_reveal to mirror TypeScript determineWinner)
CREATE OR REPLACE FUNCTION _card_score(v_card jsonb) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN v_card->>'rank' = 'Joker' THEN 0
    WHEN v_card->>'rank' = 'A'     THEN 1
    WHEN v_card->>'rank' = 'J'     THEN 11
    WHEN v_card->>'rank' = 'Q'     THEN 12
    WHEN v_card->>'rank' = 'K' AND v_card->>'suit' IN ('hearts', 'diamonds') THEN -2
    WHEN v_card->>'rank' = 'K'     THEN 13
    ELSE (v_card->>'rank')::int
  END
$$;

CREATE OR REPLACE FUNCTION _hand_score(v_hand jsonb) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(SUM(_card_score(elem)), 0)::int
  FROM jsonb_array_elements(v_hand) AS elem
  WHERE jsonb_typeof(elem) != 'null'
$$;

-- 4. Update attempt_stack to permit stacking during reveal_pending
--    (replaces the version from 20260503100000_fix_cross_hand_stack_transfer)
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
  v_owner_key      text;
  v_owner          jsonb;
  v_owner_hand     jsonb;
  v_hand_card      jsonb;
  v_hand_card_index int;
  v_stacker        jsonb;
  v_stacker_hand   jsonb;
  v_non_null_count int;
  v_empty_slot     int;
  v_penalty_card   jsonb;
  v_shuffled_deck  jsonb;
  v_new_action     jsonb;
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

  IF v_game.status NOT IN ('playing', 'final_turn', 'reveal_pending') THEN
    RAISE EXCEPTION 'Game is not in playing state';
  END IF;

  IF NOT (v_game.players ? p_player_id::text) THEN
    RAISE EXCEPTION 'Player not in game';
  END IF;

  v_players      := v_game.players;
  v_deck         := v_game.deck;
  v_discard_pile := v_game.discard_pile;

  -- Race-condition checks
  IF jsonb_array_length(v_discard_pile) = 0 THEN
    v_new_action := '{"actionType":"stack_failed","description":"Stack failed: Discard pile is empty!","metadata":{}}'::jsonb;
  ELSE
    v_top_discard := v_discard_pile -> (jsonb_array_length(v_discard_pile) - 1);
    IF v_top_discard->>'id' != p_target_discard_card_id THEN
      v_new_action := '{"actionType":"stack_failed","description":"Stack failed: Too late!","metadata":{}}'::jsonb;
    END IF;
  END IF;

  -- Find the card in ANY player's hand
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
        EXIT find_card;
      END IF;
    END LOOP;
  END LOOP;

  IF v_hand_card_index = -1 THEN
    RAISE EXCEPTION 'Card not found in any player hand';
  END IF;

  v_owner        := v_players -> v_owner_key;
  v_stacker      := v_players -> p_player_id::text;
  v_stacker_hand := v_stacker -> 'hand';

  -- Rank check / success path
  IF v_new_action IS NULL THEN
    IF v_hand_card->>'rank' != v_top_discard->>'rank' THEN
      v_new_action := '{"actionType":"stack_failed","description":"Stack failed: Wrong card!","metadata":{}}'::jsonb;
    ELSE
      v_owner_hand   := jsonb_set(v_owner_hand, ARRAY[v_hand_card_index::text], 'null'::jsonb);
      v_hand_card    := jsonb_set(v_hand_card, '{isFaceUp}', 'true'::jsonb);
      v_discard_pile := v_discard_pile || v_hand_card;

      v_owner   := jsonb_set(v_owner,   '{hand}', v_owner_hand);
      v_players := jsonb_set(v_players, ARRAY[v_owner_key], v_owner);

      v_new_action := jsonb_build_object(
        'playerId',   p_player_id,
        'actionType', 'stack_success',
        'description', CASE
          WHEN v_owner_key = p_player_id::text THEN 'Successfully stacked a card!'
          ELSE 'Stacked opponent''s card! Now give them one of yours.'
        END,
        'metadata', jsonb_build_object('highlightedCardIds', jsonb_build_array(p_hand_card_id))
      );

      UPDATE games
      SET players                = v_players,
          discard_pile           = v_discard_pile,
          pending_stack_transfer = CASE
            WHEN v_owner_key != p_player_id::text THEN jsonb_build_object(
              'playerId',       p_player_id,
              'targetPlayerId', v_owner_key,
              'slotIndex',      v_hand_card_index
            )
            ELSE NULL
          END,
          last_action_at         = now(),
          last_game_action       = v_new_action
      WHERE id = p_game_id;

      RETURN jsonb_build_object('success', true, 'action', v_new_action);
    END IF;
  END IF;

  -- Penalty path: CALLER (p_player_id) always receives the penalty card
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
  SET players                = v_players,
      deck                   = v_deck,
      discard_pile           = v_discard_pile,
      pending_stack_transfer = NULL,
      last_action_at         = now(),
      last_game_action       = v_new_action
  WHERE id = p_game_id;

  RETURN jsonb_build_object('success', false, 'action', v_new_action);
END;
$$;

-- 5. vote_reveal RPC
--    Appends p_player_id to reveal_votes. When both players have voted,
--    calculates the winner (mirroring TypeScript determineWinner) and
--    transitions status to 'finished'.
CREATE OR REPLACE FUNCTION vote_reveal(
  p_game_id   uuid,
  p_player_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_game         record;
  v_votes        jsonb;
  v_player_ids   text[];
  v_opp_id       text;
  v_caller_score int;
  v_opp_score    int;
  v_winner_id    uuid;
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  IF v_game.status != 'reveal_pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game is not in reveal_pending state');
  END IF;

  v_votes := COALESCE(v_game.reveal_votes, '[]'::jsonb);

  -- Idempotent: only add if not already present
  IF NOT (v_votes @> to_jsonb(p_player_id)) THEN
    v_votes := v_votes || to_jsonb(p_player_id);
  END IF;

  SELECT ARRAY(SELECT key FROM jsonb_object_keys(v_game.players) AS key ORDER BY key)
  INTO v_player_ids;

  IF jsonb_array_length(v_votes) >= array_length(v_player_ids, 1) THEN
    -- Both voted: calculate winner, mirroring TypeScript determineWinner.
    -- Caller wins only if strictly less; ties go to the non-caller.
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
