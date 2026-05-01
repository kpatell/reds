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
    v_non_null_count INT := 0;
    i INT;
BEGIN
    v_player_hand := v_players -> p_player_id::text -> 'hand';
    
    FOR i IN 0 .. jsonb_array_length(v_player_hand) - 1 LOOP
        IF jsonb_typeof(v_player_hand -> i) != 'null' THEN
            v_non_null_count := v_non_null_count + 1;
        END IF;
    END LOOP;

    -- ONLY apply penalty if hand is under 12 cards
    IF v_non_null_count < 12 THEN
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
    END IF;

    UPDATE games
    SET deck = v_deck,
        discard_pile = v_discard_pile,
        players = v_players,
        last_action_at = now(),
        last_game_action = jsonb_build_object(
            'playerId', p_player_id,
            'actionType', 'stack_failed',
            'description', CASE WHEN v_non_null_count >= 12 THEN 'Stack failed! (Hand full, no penalty)' ELSE 'Stack failed! (+1 Penalty)' END,
            'metadata', CASE WHEN v_penalty_card IS NOT NULL THEN jsonb_build_object('highlightedCardIds', jsonb_build_array(v_penalty_card->>'id')) ELSE '{}'::jsonb END
        )
    WHERE id = p_game_id;
END;
$$;
