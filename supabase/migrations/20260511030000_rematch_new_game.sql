-- When both players agree to a rematch, vote_rematch now creates a brand-new
-- game row (cards dealt inline) instead of overwriting the existing one.
-- next_short_code on the finished row is the realtime signal both clients use
-- to navigate to the new game URL.

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS next_short_code varchar(6);

CREATE OR REPLACE FUNCTION public.vote_rematch(
  p_game_id   uuid,
  p_player_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_game        record;
  v_votes       jsonb;
  v_new_votes   jsonb;
  v_both_agreed bool := false;
  v_new_game_id uuid;
  v_new_sc      varchar(6);
  v_players     jsonb;
  v_keys        text[];
  v_p1_id       text;
  v_p2_id       text;
  v_p1_hand     jsonb;
  v_p2_hand     jsonb;
  v_deck        jsonb;
  v_first_turn  text;
BEGIN
  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id AND status = 'finished'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not found or not finished');
  END IF;

  v_votes := COALESCE(v_game.rematch_votes, '[]'::jsonb);

  IF v_votes @> to_jsonb(p_player_id) THEN
    v_new_votes := v_votes;
  ELSE
    v_new_votes := v_votes || to_jsonb(p_player_id);
  END IF;

  v_both_agreed := jsonb_array_length(v_new_votes) >= 2;

  -- Idempotent: new game already created by a concurrent caller that held the lock first
  IF v_both_agreed AND v_game.next_short_code IS NOT NULL THEN
    UPDATE public.games SET rematch_votes = v_new_votes WHERE id = p_game_id;
    RETURN jsonb_build_object('success', true, 'both_agreed', true, 'next_short_code', v_game.next_short_code);
  END IF;

  IF v_both_agreed THEN
    v_players := COALESCE(v_game.players, '{}'::jsonb);
    v_keys    := ARRAY(SELECT jsonb_object_keys(v_players) ORDER BY 1);

    IF array_length(v_keys, 1) IS DISTINCT FROM 2 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Expected exactly 2 players');
    END IF;

    v_p1_id := v_keys[1];
    v_p2_id := v_keys[2];

    -- Winner of the just-finished game goes first in the rematch
    IF v_game.winner_id IS NOT NULL AND v_game.winner_id::text = ANY(v_keys) THEN
      v_first_turn := v_game.winner_id::text;
    ELSE
      v_first_turn := v_keys[1 + (floor(random() * 2))::int];
    END IF;

    -- Deal a fresh 54-card deck (identical logic to start_game)
    WITH
    suits AS (SELECT unnest(ARRAY['spades','hearts','diamonds','clubs']) AS suit),
    ranks AS (SELECT unnest(ARRAY['A','2','3','4','5','6','7','8','9','10','J','Q','K']) AS rank),
    standard_cards AS (
      SELECT
        gen_random_uuid()::text AS id, s.suit, r.rank,
        CASE
          WHEN r.rank = 'A'  THEN 1
          WHEN r.rank = 'J'  THEN 11
          WHEN r.rank = 'Q'  THEN 12
          WHEN r.rank = 'K' AND s.suit IN ('hearts','diamonds') THEN -2
          WHEN r.rank = 'K'  THEN 13
          ELSE r.rank::int
        END AS value
      FROM suits s CROSS JOIN ranks r
    ),
    jokers AS (
      SELECT gen_random_uuid()::text AS id, 'joker'::text AS suit, 'Joker'::text AS rank, 0 AS value
      FROM generate_series(1, 2)
    ),
    all_cards AS (SELECT id, suit, rank, value FROM standard_cards UNION ALL SELECT id, suit, rank, value FROM jokers),
    shuffled  AS (SELECT id, suit, rank, value, (row_number() OVER (ORDER BY random())) - 1 AS pos FROM all_cards)
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object('id',id,'suit',suit,'rank',rank,'value',value,'isFaceUp',false,'knownBy','[]'::jsonb) ORDER BY pos) FILTER (WHERE pos % 2 = 0 AND pos < 8), '[]'::jsonb),
      COALESCE(jsonb_agg(jsonb_build_object('id',id,'suit',suit,'rank',rank,'value',value,'isFaceUp',false,'knownBy','[]'::jsonb) ORDER BY pos) FILTER (WHERE pos % 2 = 1 AND pos < 8), '[]'::jsonb),
      COALESCE(jsonb_agg(jsonb_build_object('id',id,'suit',suit,'rank',rank,'value',value,'isFaceUp',false,'knownBy','[]'::jsonb) ORDER BY pos) FILTER (WHERE pos >= 8), '[]'::jsonb)
    INTO v_p1_hand, v_p2_hand, v_deck
    FROM shuffled;

    v_players := jsonb_build_object(
      v_p1_id, jsonb_build_object('id', v_p1_id, 'username', v_players->v_p1_id->>'username', 'avatar_url', v_players->v_p1_id->>'avatar_url', 'hand', v_p1_hand, 'isReady', false, 'hasCalledReds', false, 'roundsWon', 0),
      v_p2_id, jsonb_build_object('id', v_p2_id, 'username', v_players->v_p2_id->>'username', 'avatar_url', v_players->v_p2_id->>'avatar_url', 'hand', v_p2_hand, 'isReady', false, 'hasCalledReds', false, 'roundsWon', 0)
    );

    -- Insert new game row; the set_game_short_code trigger auto-assigns short_code
    INSERT INTO public.games (
      status, players, deck, discard_pile,
      current_turn_player_id, turn_phase, last_action_at,
      rematch_votes, reveal_votes
    ) VALUES (
      'playing', v_players, v_deck, '[]'::jsonb,
      v_first_turn::uuid, 'peek', now(),
      '[]'::jsonb, '[]'::jsonb
    )
    RETURNING id, short_code INTO v_new_game_id, v_new_sc;

    -- Stamp the finished row so both players' realtime subscriptions see where to go
    UPDATE public.games
       SET rematch_votes   = v_new_votes,
           next_short_code = v_new_sc
     WHERE id = p_game_id;

    RETURN jsonb_build_object(
      'success',         true,
      'both_agreed',     true,
      'next_short_code', v_new_sc
    );
  END IF;

  -- Single-vote case
  UPDATE public.games SET rematch_votes = v_new_votes WHERE id = p_game_id;
  RETURN jsonb_build_object('success', true, 'both_agreed', false);
END;
$$;
