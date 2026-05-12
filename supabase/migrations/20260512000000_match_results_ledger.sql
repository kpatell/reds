-- ============================================================
-- match_results: permanent ledger of every completed game.
-- Inserted by trigger whenever a games row transitions to
-- 'finished' (with winner) or 'abandoned' (no winner).
-- This decouples history queries from the mutable games row,
-- so rematches that reuse the same game_id each produce their
-- own immutable record here.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.match_results (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    uuid        NOT NULL REFERENCES public.games(id),
  p1_id      uuid        NOT NULL,
  p2_id      uuid        NOT NULL,
  winner_id  uuid,                          -- NULL for abandoned games
  status     text        NOT NULL CHECK (status IN ('finished', 'abandoned')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can read their own match results"
  ON public.match_results FOR SELECT
  USING (p1_id = auth.uid() OR p2_id = auth.uid());

-- ============================================================
-- Trigger: record_match_result
-- Fires AFTER each UPDATE on games when status transitions
-- into 'finished' (winner required) or 'abandoned'.
-- Safe to replay: each rematches produces a new row because
-- game_id is not unique here.
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_match_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_keys text[];
BEGIN
  -- Only on status transitions into the terminal states we care about
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('finished', 'abandoned') THEN RETURN NEW; END IF;

  -- 'finished' must have a winner; guard against partial writes
  IF NEW.status = 'finished' AND NEW.winner_id IS NULL THEN RETURN NEW; END IF;

  v_keys := ARRAY(SELECT jsonb_object_keys(COALESCE(NEW.players, '{}'::jsonb)) ORDER BY 1);

  -- Require exactly 2 players; single-player or wiped rows are skipped
  IF array_length(v_keys, 1) IS DISTINCT FROM 2 THEN RETURN NEW; END IF;

  INSERT INTO public.match_results (game_id, p1_id, p2_id, winner_id, status)
  VALUES (NEW.id, v_keys[1]::uuid, v_keys[2]::uuid, NEW.winner_id, NEW.status);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_game_result ON public.games;
CREATE TRIGGER on_game_result
  AFTER UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.record_match_result();

-- ============================================================
-- get_match_history: rewritten to query match_results.
-- Returns all finished + abandoned games for a player,
-- newest first. The 'id' field is match_results.id (UUID) —
-- use it as the React list key, not game_id, because rematches
-- produce multiple rows with the same game_id.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_match_history(p_player_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                  mr.id,
      'game_id',             mr.game_id,
      'created_at',          mr.created_at,
      'won',                 CASE WHEN mr.status = 'abandoned' THEN false
                                  ELSE mr.winner_id = p_player_id END,
      'abandoned',           (mr.status = 'abandoned'),
      'opponent_id',         opp.id,
      'opponent_username',   p.username,
      'opponent_avatar_url', p.avatar_url
    )
    ORDER BY mr.created_at DESC
  )
  INTO v_result
  FROM public.match_results mr
  CROSS JOIN LATERAL (
    SELECT CASE WHEN mr.p1_id = p_player_id THEN mr.p2_id ELSE mr.p1_id END AS id
  ) opp
  LEFT JOIN public.profiles p ON p.id = opp.id
  WHERE mr.p1_id = p_player_id OR mr.p2_id = p_player_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ============================================================
-- get_head_to_head: rewritten to query match_results.
-- Abandoned games are excluded from win/loss counts.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_head_to_head(
  p_player_id   uuid,
  p_opponent_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_wins   integer := 0;
  v_losses integer := 0;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE winner_id = p_player_id),
    COUNT(*) FILTER (WHERE winner_id = p_opponent_id)
  INTO v_wins, v_losses
  FROM public.match_results
  WHERE status = 'finished'
    AND (
      (p1_id = p_player_id   AND p2_id = p_opponent_id)
      OR
      (p1_id = p_opponent_id AND p2_id = p_player_id)
    );

  RETURN jsonb_build_object('wins', v_wins, 'losses', v_losses);
END;
$$;
