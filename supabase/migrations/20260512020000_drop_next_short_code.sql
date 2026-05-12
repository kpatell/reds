-- Remove next_short_code, a leftover from the reverted Route 1 rematch
-- approach. Route 2 (match_results ledger) does not need it.
ALTER TABLE public.games DROP COLUMN IF EXISTS next_short_code;
