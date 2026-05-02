-- ============================================================
-- Migration: Add short_code to games
-- Human-friendly 6-char uppercase hex join code, auto-generated
-- by trigger on every new INSERT.
-- ============================================================

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS short_code varchar(6);

CREATE UNIQUE INDEX IF NOT EXISTS games_short_code_key ON games (short_code)
  WHERE short_code IS NOT NULL;

-- ============================================================
-- Trigger function: generate a collision-free short code
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_game_short_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_code varchar(6);
BEGIN
  LOOP
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM games WHERE short_code = v_code);
  END LOOP;
  NEW.short_code := v_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_game_short_code ON games;
CREATE TRIGGER set_game_short_code
  BEFORE INSERT ON games
  FOR EACH ROW
  WHEN (NEW.short_code IS NULL)
  EXECUTE FUNCTION public.generate_game_short_code();

-- ============================================================
-- Backfill existing rows
-- ============================================================
DO $$
DECLARE
  r      RECORD;
  v_code varchar(6);
BEGIN
  FOR r IN SELECT id FROM games WHERE short_code IS NULL LOOP
    LOOP
      v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM games WHERE short_code = v_code);
    END LOOP;
    UPDATE games SET short_code = v_code WHERE id = r.id;
  END LOOP;
END;
$$;
