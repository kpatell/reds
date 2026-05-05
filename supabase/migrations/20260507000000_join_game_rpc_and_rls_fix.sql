-- ============================================================
-- Migration: Secure games UPDATE policy + join_game RPC
--
-- Problem: the original UPDATE policy allowed any authenticated
-- user to write any column on a 'waiting' game (the
-- `status = 'waiting'` branch). This is replaced by a strict
-- "players only" policy; all joins now go through a
-- SECURITY DEFINER RPC that atomically adds the caller.
-- ============================================================

-- 1. Replace the overly-permissive UPDATE policy
DROP POLICY IF EXISTS "Players can update games they are in." ON games;

CREATE POLICY "Players in the game can update game state."
  ON games FOR UPDATE
  USING (auth.uid()::text = ANY (SELECT jsonb_object_keys(players)));

-- 2. RPC: join_game
--    Atomically adds the authenticated caller to a waiting game's
--    players map. Returns:
--      { success, player_count, already_joined? }  on success
--      { success: false, error }                   on failure
CREATE OR REPLACE FUNCTION public.join_game(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller_id  uuid := auth.uid();
  v_player_key text;
  v_game       record;
  v_profile    record;
  v_players    jsonb;
  v_count      int;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_player_key := v_caller_id::text;

  -- Lock the row to prevent two simultaneous joins from both seeing count=1
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not found');
  END IF;

  IF v_game.status <> 'waiting' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game is not accepting players');
  END IF;

  v_players := COALESCE(v_game.players, '{}'::jsonb);

  -- Idempotent: caller is already seated
  IF v_players ? v_player_key THEN
    SELECT count(*) INTO v_count FROM jsonb_object_keys(v_players);
    RETURN jsonb_build_object('success', true, 'already_joined', true, 'player_count', v_count);
  END IF;

  SELECT count(*) INTO v_count FROM jsonb_object_keys(v_players);
  IF v_count >= 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game is full');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = v_caller_id;

  v_players := v_players || jsonb_build_object(
    v_player_key,
    jsonb_build_object(
      'id',            v_player_key,
      'username',      COALESCE(v_profile.username, 'Guest'),
      'avatar_url',    v_profile.avatar_url,
      'hand',          '[]'::jsonb,
      'isReady',       false,
      'hasCalledReds', false,
      'roundsWon',     0
    )
  );

  UPDATE games
     SET players       = v_players,
         last_action_at = now()
   WHERE id = p_game_id;

  SELECT count(*) INTO v_count FROM jsonb_object_keys(v_players);

  RETURN jsonb_build_object(
    'success',      true,
    'already_joined', false,
    'player_count', v_count
  );
END;
$$;
