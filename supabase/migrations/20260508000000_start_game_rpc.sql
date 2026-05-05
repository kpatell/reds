-- ============================================================
-- Migration: start_game RPC + call_reds SECURITY DEFINER fix
-- ============================================================

-- 1. start_game — server-side deck generation/shuffle/deal.
--    Called by the second player after join_game returns player_count=2,
--    and by either player to trigger a rematch once the game finishes.
--    Using SECURITY DEFINER so the function runs as the table owner,
--    allowing it to write game state without relying on the client
--    UPDATE RLS policy (which would allow arbitrary column writes).
CREATE OR REPLACE FUNCTION public.start_game(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid    := auth.uid();
  v_game        record;
  v_players     jsonb;
  v_player_keys text[];
  v_p1_id       text;
  v_p2_id       text;
  v_p1_hand     jsonb;
  v_p2_hand     jsonb;
  v_deck        jsonb;
  v_first_turn  text;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not found');
  END IF;

  IF v_game.status NOT IN ('waiting', 'finished') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game cannot be started in current status');
  END IF;

  v_players     := COALESCE(v_game.players, '{}'::jsonb);
  v_player_keys := ARRAY(SELECT jsonb_object_keys(v_players) ORDER BY 1);

  IF array_length(v_player_keys, 1) IS DISTINCT FROM 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Need exactly 2 players to start');
  END IF;

  IF NOT (v_caller_id::text = ANY(v_player_keys)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not in this game');
  END IF;

  v_p1_id := v_player_keys[1];
  v_p2_id := v_player_keys[2];

  -- Winner of the previous round goes first; otherwise pick randomly
  IF v_game.winner_id IS NOT NULL AND v_game.winner_id::text = ANY(v_player_keys) THEN
    v_first_turn := v_game.winner_id::text;
  ELSE
    v_first_turn := v_player_keys[1 + (floor(random() * 2))::int];
  END IF;

  -- Generate a shuffled 54-card deck (52 standard + 2 jokers) and deal
  -- 4 cards to each player in round-robin order (positions 0,2,4,6 → P1;
  -- 1,3,5,7 → P2; 8-53 → remaining deck). Discard pile starts empty.
  WITH
  suits AS (SELECT unnest(ARRAY['spades','hearts','diamonds','clubs']) AS suit),
  ranks AS (SELECT unnest(ARRAY['A','2','3','4','5','6','7','8','9','10','J','Q','K']) AS rank),
  standard_cards AS (
    SELECT
      gen_random_uuid()::text AS id,
      s.suit                  AS suit,
      r.rank                  AS rank,
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
    SELECT gen_random_uuid()::text AS id,
           'joker'::text            AS suit,
           'Joker'::text            AS rank,
           0                        AS value
    FROM generate_series(1, 2)
  ),
  all_cards AS (
    SELECT id, suit, rank, value FROM standard_cards
    UNION ALL
    SELECT id, suit, rank, value FROM jokers
  ),
  shuffled AS (
    SELECT id, suit, rank, value,
           (row_number() OVER (ORDER BY random())) - 1 AS pos
    FROM all_cards
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object('id',id,'suit',suit,'rank',rank,'value',value,'isFaceUp',false,'knownBy','[]'::jsonb)
      ORDER BY pos
    ) FILTER (WHERE pos % 2 = 0 AND pos < 8), '[]'::jsonb),
    COALESCE(jsonb_agg(
      jsonb_build_object('id',id,'suit',suit,'rank',rank,'value',value,'isFaceUp',false,'knownBy','[]'::jsonb)
      ORDER BY pos
    ) FILTER (WHERE pos % 2 = 1 AND pos < 8), '[]'::jsonb),
    COALESCE(jsonb_agg(
      jsonb_build_object('id',id,'suit',suit,'rank',rank,'value',value,'isFaceUp',false,'knownBy','[]'::jsonb)
      ORDER BY pos
    ) FILTER (WHERE pos >= 8), '[]'::jsonb)
  INTO v_p1_hand, v_p2_hand, v_deck
  FROM shuffled;

  -- Preserve username/avatar from existing player rows; reset all game fields
  v_players := jsonb_build_object(
    v_p1_id, jsonb_build_object(
      'id',           v_p1_id,
      'username',     v_players->v_p1_id->>'username',
      'avatar_url',   v_players->v_p1_id->>'avatar_url',
      'hand',         v_p1_hand,
      'isReady',      false,
      'hasCalledReds',false,
      'roundsWon',    0
    ),
    v_p2_id, jsonb_build_object(
      'id',           v_p2_id,
      'username',     v_players->v_p2_id->>'username',
      'avatar_url',   v_players->v_p2_id->>'avatar_url',
      'hand',         v_p2_hand,
      'isReady',      false,
      'hasCalledReds',false,
      'roundsWon',    0
    )
  );

  UPDATE games SET
    status                 = 'playing',
    deck                   = v_deck,
    discard_pile           = '[]'::jsonb,
    players                = v_players,
    current_turn_player_id = v_first_turn::uuid,
    turn_phase             = 'peek',
    drawn_card             = NULL,
    last_action_at         = now(),
    last_game_action       = NULL,
    winner_id              = NULL,
    caller_id              = NULL,
    pending_stack_transfer = NULL,
    rematch_votes          = '[]'::jsonb,
    reveal_votes           = '[]'::jsonb
  WHERE id = p_game_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- 2. Fix call_reds: add SECURITY DEFINER + auth.uid() validation.
--    The original function accepted p_player_id from the client without
--    verifying auth.uid() = p_player_id. A player in the game could
--    pass the opponent's ID to call Reds on their behalf.
CREATE OR REPLACE FUNCTION public.call_reds(
  p_game_id   uuid,
  p_player_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_game        record;
  v_player_ids  text[];
  v_current_idx int;
  v_next_id     uuid;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_player_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;

  IF NOT (p_player_id::text = ANY(ARRAY(SELECT jsonb_object_keys(v_game.players)))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not in this game');
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

  SELECT ARRAY(
    SELECT key FROM jsonb_object_keys(v_game.players) AS key ORDER BY key
  ) INTO v_player_ids;

  SELECT idx - 1 INTO v_current_idx
  FROM unnest(v_player_ids) WITH ORDINALITY t(id, idx)
  WHERE id = p_player_id::text;

  v_next_id := (v_player_ids[((v_current_idx + 1) % array_length(v_player_ids, 1)) + 1])::uuid;

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
