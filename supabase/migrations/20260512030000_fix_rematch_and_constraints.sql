-- ============================================================
-- 1. Fix vote_rematch: remove all next_short_code references
--    that were left over from the reverted Route 1 approach.
--    The column was dropped in 20260512020000; this function
--    still lives in the DB referencing it and throws on call.
-- ============================================================
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

  UPDATE public.games
     SET rematch_votes = v_new_votes
   WHERE id = p_game_id;

  RETURN jsonb_build_object('success', true, 'both_agreed', v_both_agreed);
END;
$$;

-- ============================================================
-- 2. Expand the games status check constraint to include all
--    valid statuses. The original inline constraint from
--    initial_setup.sql only covered ('waiting','playing','finished').
--    Later statuses (final_turn, reveal_pending, abandoned) were
--    added by migrations that assumed the constraint was already
--    named games_status_check — but if the original auto-name
--    differed, both constraints coexisted and the restrictive
--    original still fired. We drop both defensively and add one
--    authoritative constraint.
-- ============================================================

-- Drop by the name we know the connected_players migration used
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_status_check;

-- Drop any remaining inline constraint that may have a different
-- auto-generated name (Postgres names inline column checks as
-- {table}_{column}_check, but older versions may vary)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.games'::regclass
      AND contype = 'c'
      AND conname != 'games_status_check'  -- already dropped above
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.games DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.games
  ADD CONSTRAINT games_status_check
  CHECK (status IN ('waiting', 'playing', 'final_turn', 'reveal_pending', 'finished', 'abandoned'));
