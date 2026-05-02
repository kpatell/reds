-- ============================================================
-- Migration: Auth, Profiles & Lobby Overhaul
-- Adds: profiles trigger, win/loss stats, game title/host_id,
--       head-to-head RPC, match history RPC
-- ============================================================

-- 1. Extend profiles: win/loss counters
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS total_wins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_losses integer NOT NULL DEFAULT 0;

-- 2. Extend games: title and host reference
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS host_id uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS rematch_votes jsonb DEFAULT '[]'::jsonb;

-- Fix status constraint to include final_turn (safe re-apply)
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_status_check;
ALTER TABLE games ADD CONSTRAINT games_status_check
  CHECK (status IN ('waiting', 'playing', 'final_turn', 'finished'));

-- ============================================================
-- 3. Auto-create profile on user sign-up / OAuth
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_username   text;
  v_avatar_url text;
  v_fallback   text;
BEGIN
  v_avatar_url := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  -- Prefer explicitly passed username (from signUp options.data),
  -- then OAuth full_name / name, then email prefix.
  v_username := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), '')
  );

  -- Enforce the username_length check (>= 3 chars)
  IF v_username IS NULL OR char_length(v_username) < 3 THEN
    v_username := 'User' || upper(substr(replace(NEW.id::text, '-', ''), 1, 6));
  END IF;

  -- UUID-based fallback that is guaranteed unique per user
  v_fallback := 'User' || upper(substr(replace(NEW.id::text, '-', ''), 1, 8));

  BEGIN
    INSERT INTO public.profiles (id, username, avatar_url)
    VALUES (NEW.id, v_username, v_avatar_url);
  EXCEPTION WHEN unique_violation THEN
    -- Username was taken; use the UUID fallback (always unique)
    INSERT INTO public.profiles (id, username, avatar_url)
    VALUES (NEW.id, v_fallback, v_avatar_url)
    ON CONFLICT (id) DO NOTHING;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 4. Increment profile stats when a game finishes
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_player_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_player_ids text[];
  v_pid        text;
BEGIN
  -- Fire only on the exact transition to 'finished' with a winner set,
  -- and only once (guard against duplicate updates).
  IF NOT (
    NEW.status = 'finished'
    AND NEW.winner_id IS NOT NULL
    AND NOT (OLD.status = 'finished' AND OLD.winner_id IS NOT NULL)
  ) THEN
    RETURN NEW;
  END IF;

  v_player_ids := ARRAY(SELECT jsonb_object_keys(COALESCE(NEW.players, '{}'::jsonb)));

  FOREACH v_pid IN ARRAY v_player_ids LOOP
    IF v_pid::uuid = NEW.winner_id THEN
      UPDATE public.profiles SET total_wins = total_wins + 1 WHERE id = v_pid::uuid;
    ELSE
      UPDATE public.profiles SET total_losses = total_losses + 1 WHERE id = v_pid::uuid;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_game_finished ON games;
CREATE TRIGGER on_game_finished
  AFTER UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION public.update_player_stats();

-- ============================================================
-- 5. RPC: Match History (returns finished games for a user)
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
      'game_id',            g.id,
      'created_at',         g.created_at,
      'won',                g.winner_id = p_player_id,
      'opponent_id',        opp.opp_id,
      'opponent_username',  p.username,
      'opponent_avatar_url', p.avatar_url
    )
    ORDER BY g.created_at DESC
  )
  INTO v_result
  FROM games g
  CROSS JOIN LATERAL (
    SELECT key::uuid AS opp_id
    FROM jsonb_object_keys(COALESCE(g.players, '{}'::jsonb)) AS key
    WHERE key::uuid <> p_player_id
    LIMIT 1
  ) opp
  LEFT JOIN profiles p ON p.id = opp.opp_id
  WHERE g.status    = 'finished'
    AND g.winner_id IS NOT NULL
    AND (g.players ? p_player_id::text);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ============================================================
-- 6. RPC: Head-to-Head stats between two players
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_head_to_head(
  p_player_id  uuid,
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
  FROM games
  WHERE status    = 'finished'
    AND winner_id IS NOT NULL
    AND (players ? p_player_id::text)
    AND (players ? p_opponent_id::text);

  RETURN jsonb_build_object('wins', v_wins, 'losses', v_losses);
END;
$$;

-- ============================================================
-- 7. RPC: vote_rematch (idempotent — add if missing)
-- ============================================================
CREATE OR REPLACE FUNCTION public.vote_rematch(
  p_game_id   uuid,
  p_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_game        record;
  v_votes       jsonb;
  v_player_ids  text[];
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not found');
  END IF;

  v_votes := COALESCE(v_game.rematch_votes, '[]'::jsonb);

  -- Idempotent — add player vote only once
  IF NOT (v_votes @> jsonb_build_array(p_player_id::text)) THEN
    v_votes := v_votes || jsonb_build_array(p_player_id::text);
  END IF;

  v_player_ids := ARRAY(SELECT jsonb_object_keys(COALESCE(v_game.players, '{}'::jsonb)));

  IF array_length(v_votes, 1) >= array_length(v_player_ids, 1) THEN
    -- Both players voted — start a new game (reset state)
    UPDATE games SET
      status               = 'waiting',
      deck                 = '[]'::jsonb,
      discard_pile         = '[]'::jsonb,
      drawn_card           = NULL,
      current_turn_player_id = NULL,
      turn_phase           = 'draw',
      players              = '{}'::jsonb,
      winner_id            = NULL,
      caller_id            = NULL,
      rematch_votes        = '[]'::jsonb,
      last_action_at       = now()
    WHERE id = p_game_id;
    RETURN jsonb_build_object('success', true, 'rematch', true);
  ELSE
    UPDATE games SET rematch_votes = v_votes WHERE id = p_game_id;
    RETURN jsonb_build_object('success', true, 'rematch', false);
  END IF;
END;
$$;
