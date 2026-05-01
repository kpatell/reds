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

    -- ONLY ENFORCE CAP IF STACKING OPPONENT'S CARD
    IF v_non_null_count >= 12 AND v_owner_id != p_player_id::text THEN
        RETURN jsonb_build_object('success', false, 'action', jsonb_build_object('description', 'Hand is full (Max 12 cards). Cannot stack opponent cards!'));
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
        deck = v_game.deck, -- EXPLICITLY INCLUDE DECK TO PREVENT TOAST OMISSION
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
