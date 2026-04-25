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
  -- 1. Lock the row to prevent race conditions
  SELECT * INTO v_game
  FROM games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  IF v_game.status != 'playing' THEN
    RAISE EXCEPTION 'Game is not in playing state';
  END IF;

  v_players := v_game.players;
  v_deck := v_game.deck;
  v_discard_pile := v_game.discard_pile;

  -- 2. Verify target discard card (Late Stack check)
  IF jsonb_array_length(v_discard_pile) = 0 THEN
    -- Penalty: Late stack (discard empty somehow)
    v_new_action := '{"actionType": "stack_failed", "description": "Stack failed: Discard pile is empty!", "metadata": {}}'::jsonb;
  ELSE
    v_top_discard := v_discard_pile -> (jsonb_array_length(v_discard_pile) - 1);
    IF v_top_discard->>'id' != p_target_discard_card_id THEN
      -- Penalty: Late stack
      v_new_action := '{"actionType": "stack_failed", "description": "Stack failed: Too late!", "metadata": {}}'::jsonb;
    END IF;
  END IF;

  -- 3. Verify player hand card
  IF NOT v_players ? p_player_id::text THEN
    RAISE EXCEPTION 'Player not in game';
  END IF;

  v_player := v_players -> p_player_id::text;
  v_hand := v_player -> 'hand';
  
  -- Find card in hand
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

  -- 4. Proceed based on checks
  IF v_new_action IS NULL THEN
    -- Check rank match (Wrong Stack)
    IF v_hand_card->>'rank' != v_top_discard->>'rank' THEN
       v_new_action := '{"actionType": "stack_failed", "description": "Stack failed: Wrong card!", "metadata": {}}'::jsonb;
    ELSE
       -- Success!
       -- Remove card from hand
       v_hand := v_hand - v_hand_card_index;
       -- Mark face up
       v_hand_card := jsonb_set(v_hand_card, '{isFaceUp}', 'true'::jsonb);
       -- Add to discard pile
       v_discard_pile := v_discard_pile || v_hand_card;
       
       v_player := jsonb_set(v_player, '{hand}', v_hand);
       v_players := jsonb_set(v_players, ARRAY[p_player_id::text], v_player);

       v_new_action := jsonb_build_object(
           'playerId', p_player_id,
           'actionType', 'stack_success',
           'description', 'Successfully stacked a card!',
           'metadata', jsonb_build_object('highlightedCardIds', jsonb_build_array(p_hand_card_id))
       );

       UPDATE games 
       SET players = v_players,
           discard_pile = v_discard_pile,
           last_action_at = now(),
           last_game_action = v_new_action
       WHERE id = p_game_id;

       RETURN jsonb_build_object('success', true, 'action', v_new_action);
    END IF;
  END IF;

  -- 5. Handle Penalty (if v_new_action is set but not success)
  -- Take 1 card from deck. 
  -- If deck is empty, must shuffle discard pile first (excluding top card).
  IF jsonb_array_length(v_deck) = 0 THEN
    IF jsonb_array_length(v_discard_pile) > 1 THEN
      -- keep top card, shuffle the rest into deck
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
     v_penalty_card := v_deck -> (jsonb_array_length(v_deck) - 1);
     v_deck := v_deck - (jsonb_array_length(v_deck) - 1);
     -- Reset faceup and knowledge
     v_penalty_card := jsonb_set(v_penalty_card, '{isFaceUp}', 'false'::jsonb);
     v_penalty_card := v_penalty_card - 'knownBy'; -- Remove knownBy key entirely
     
     -- Add to hand
     v_hand := v_hand || v_penalty_card;
     v_player := jsonb_set(v_player, '{hand}', v_hand);
     v_players := jsonb_set(v_players, ARRAY[p_player_id::text], v_player);
  END IF;

  -- Add playerId to action
  v_new_action := jsonb_set(v_new_action, '{playerId}', to_jsonb(p_player_id));

  UPDATE games
  SET players = v_players,
      deck = v_deck,
      discard_pile = v_discard_pile,
      last_action_at = now(),
      last_game_action = v_new_action
  WHERE id = p_game_id;

  RETURN jsonb_build_object('success', false, 'action', v_new_action);
END;
$$;
