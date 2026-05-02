-- ============================================================
-- Migration: Private beta whitelist + vote_rematch RPC
-- ============================================================

-- 1. Allowed emails table for private beta gating
CREATE TABLE IF NOT EXISTS public.allowed_emails (
  email TEXT PRIMARY KEY
);

INSERT INTO public.allowed_emails (email) VALUES
  ('krishanpatel00@gmail.com'),
  ('jskmeta@gmail.com')
ON CONFLICT DO NOTHING;

-- 2. vote_rematch RPC
--    Appends p_player_id to the game's rematch_votes array (idempotent).
--    Returns { success, both_agreed } where both_agreed is true once 2 votes exist.
CREATE OR REPLACE FUNCTION public.vote_rematch(
  p_game_id   uuid,
  p_player_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_votes       jsonb;
  v_new_votes   jsonb;
  v_both_agreed bool := false;
BEGIN
  SELECT rematch_votes
    INTO v_votes
    FROM public.games
   WHERE id = p_game_id AND status = 'finished'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not found or not finished');
  END IF;

  IF v_votes IS NULL THEN
    v_votes := '[]'::jsonb;
  END IF;

  -- Idempotent: only add if not already present
  IF v_votes @> to_jsonb(p_player_id) THEN
    v_new_votes := v_votes;
  ELSE
    v_new_votes := v_votes || to_jsonb(p_player_id);
  END IF;

  v_both_agreed := jsonb_array_length(v_new_votes) >= 2;

  UPDATE public.games
     SET rematch_votes = v_new_votes
   WHERE id = p_game_id;

  RETURN jsonb_build_object('success', true, 'both_agreed', v_both_agreed);
END;
$$;
