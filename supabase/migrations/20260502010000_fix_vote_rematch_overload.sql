-- Drop all known overloads to clear the PGRST203 ambiguity
DROP FUNCTION IF EXISTS public.vote_rematch(uuid, uuid);
DROP FUNCTION IF EXISTS public.vote_rematch(uuid, text);

-- Canonical vote_rematch: p_player_id as text (matches client call site)
CREATE FUNCTION public.vote_rematch(
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

  v_votes := COALESCE(v_votes, '[]'::jsonb);

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
