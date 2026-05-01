CREATE OR REPLACE FUNCTION _apply_stack_penalty(
  p_game_id uuid,
  p_player_id uuid,
  v_game record
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_deck JSONB := v_game.deck;
    v_discard_pile JSONB := v_game.discard_pile;
    v_players JSONB := v_game.players;
    v_penalty_card JSONB;
    v_player_hand JSONB;
    v_empty_slot_idx INT;
    i INT;
BEGIN
    IF jsonb_array_length(v_deck) = 0 THEN
        -- Keep top discard, shuffle rest into deck
        v_deck := v_discard_pile - (jsonb_array_length(v_discard_pile) - 1);
        v_discard_pile := jsonb_build_array(v_discard_pile -> (jsonb_array_length(v_discard_pile) - 1));
        
        SELECT COALESCE(jsonb_agg(x ORDER BY random()), '[]'::jsonb) INTO v_deck
        FROM jsonb_array_elements(v_deck) x;
    END IF;

    IF jsonb_array_length(v_deck) > 0 THEN
        v_penalty_card := v_deck -> (jsonb_array_length(v_deck) - 1);
        v_deck := v_deck - (jsonb_array_length(v_deck) - 1);
        v_penalty_card := jsonb_set(v_penalty_card, '{isFaceUp}', 'false'::jsonb);

        v_player_hand := v_players -> p_player_id::text -> 'hand';
        
        v_empty_slot_idx := -1;
        FOR i IN 0 .. jsonb_array_length(v_player_hand) - 1 LOOP
            IF jsonb_typeof(v_player_hand -> i) = 'null' THEN
                v_empty_slot_idx := i;
                EXIT;
            END IF;
        END LOOP;

        IF v_empty_slot_idx != -1 THEN
            v_player_hand := jsonb_set(v_player_hand, ARRAY[v_empty_slot_idx::text], v_penalty_card);
        ELSE
            v_player_hand := v_player_hand || v_penalty_card;
        END IF;

        v_players := jsonb_set(v_players, ARRAY[p_player_id::text, 'hand'], v_player_hand);
    END IF;

    UPDATE games
    SET deck = v_deck,
        discard_pile = v_discard_pile,
        players = v_players,
        last_action_at = now(),
        last_game_action = jsonb_build_object(
            'playerId', p_player_id,
            'actionType', 'stack_failed',
            'description', 'Stack failed! (+1 Penalty)',
            'metadata', CASE WHEN v_penalty_card IS NOT NULL THEN jsonb_build_object('highlightedCardIds', jsonb_build_array(v_penalty_card->>'id')) ELSE '{}'::jsonb END
        )
    WHERE id = p_game_id;
END;
$$;

CREATE OR REPLACE FUNCTION attempt_stack(
  p_game_id uuid,
  p_player_id uuid,
  p_hand_card_id text,
  p_target_discard_card_id text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_game RECORD;
    v_target_discard JSONB;
    v_discard_pile JSONB;
    v_players JSONB;
    v_owner_id TEXT := NULL;
    v_hand_card JSONB := NULL;
    v_hand_card_index INT := -1;
    v_pid TEXT;
    v_player_hand JSONB;
    v_card JSONB;
    v_non_null_count INT := 0;
    i INT;
BEGIN
    -- Lock the row for update
    SELECT * INTO v_game
    FROM games
    WHERE id = p_game_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'action', jsonb_build_object('description', 'Game not found'));
    END IF;

    v_players := v_game.players;
    
    -- Hand size cap check
    v_player_hand := v_players -> p_player_id::text -> 'hand';
    FOR i IN 0 .. jsonb_array_length(v_player_hand) - 1 LOOP
        IF jsonb_typeof(v_player_hand -> i) != 'null' THEN
            v_non_null_count := v_non_null_count + 1;
        END IF;
    END LOOP;

    IF v_non_null_count >= 6 THEN
        RETURN jsonb_build_object('success', false, 'action', jsonb_build_object('description', 'Hand is full (Max 6 cards). Cannot stack!'));
    END IF;

    -- Validate target discard card (Late Stack check)
    v_discard_pile := v_game.discard_pile;
    IF jsonb_array_length(v_discard_pile) = 0 THEN
        RETURN jsonb_build_object('success', false, 'action', jsonb_build_object('description', 'Discard pile is empty!'));
    END IF;

    v_target_discard := v_discard_pile -> (jsonb_array_length(v_discard_pile) - 1);

    IF (v_target_discard->>'id') != p_target_discard_card_id THEN
        -- LATE STACK! The discard pile changed before this request processed.
        PERFORM _apply_stack_penalty(p_game_id, p_player_id, v_game);
        RETURN jsonb_build_object('success', false, 'action', jsonb_build_object('description', 'Too late! Someone else stacked or drew. (+1 Penalty)'));
    END IF;
    
    -- Find the hand card in ALL players' hands
    FOR v_pid IN SELECT jsonb_object_keys(v_players)
    LOOP
        v_player_hand := v_players -> v_pid -> 'hand';
        FOR i IN 0 .. jsonb_array_length(v_player_hand) - 1
        LOOP
            v_card := v_player_hand -> i;
            IF v_card IS NOT NULL AND jsonb_typeof(v_card) = 'object' AND (v_card->>'id') = p_hand_card_id THEN
                v_owner_id := v_pid;
                v_hand_card := v_card;
                v_hand_card_index := i;
                EXIT;
            END IF;
        END LOOP;
        IF v_owner_id IS NOT NULL THEN
            EXIT;
        END IF;
    END LOOP;

    IF v_owner_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'action', jsonb_build_object('description', 'Card not found in any hand.'));
    END IF;

    -- Validate Rank matches
    IF (v_hand_card->>'rank') != (v_target_discard->>'rank') THEN
        -- WRONG STACK! Rank doesn't match.
        PERFORM _apply_stack_penalty(p_game_id, p_player_id, v_game);
        RETURN jsonb_build_object('success', false, 'action', jsonb_build_object('description', 'Wrong rank! (+1 Penalty)'));
    END IF;

    -- SUCCESSFUL STACK!
    -- Remove card from owner's hand by setting it to null (preserving array length and indices)
    v_player_hand := jsonb_set(v_players -> v_owner_id -> 'hand', ARRAY[v_hand_card_index::text], 'null'::jsonb);
    v_players := jsonb_set(v_players, ARRAY[v_owner_id, 'hand'], v_player_hand);

    -- Add card to discard pile face up
    v_hand_card := jsonb_set(v_hand_card, '{isFaceUp}', 'true'::jsonb);
    v_discard_pile := v_discard_pile || v_hand_card;

    -- Update database
    UPDATE games
    SET players = v_players,
        discard_pile = v_discard_pile,
        last_action_at = now(),
        last_game_action = jsonb_build_object(
            'playerId', p_player_id,
            'actionType', 'stack_success',
            'description', CASE WHEN v_owner_id = p_player_id::text THEN 'Stacked successfully!' ELSE 'Stacked opponent card!' END,
            'metadata', jsonb_build_object('highlightedCardIds', jsonb_build_array(v_hand_card->>'id'))
        ),
        pending_stack_transfer = CASE 
            WHEN v_owner_id != p_player_id::text THEN 
                jsonb_build_object('playerId', p_player_id, 'targetPlayerId', v_owner_id, 'slotIndex', v_hand_card_index)
            ELSE NULL
        END
    WHERE id = p_game_id;

    RETURN jsonb_build_object('success', true, 'action', jsonb_build_object('description', 'Stack successful!'));
END;
$$;
