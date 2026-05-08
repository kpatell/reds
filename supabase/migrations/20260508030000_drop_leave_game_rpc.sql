-- Drop leave_game RPC: it physically deleted players from games.players JSONB,
-- which destroyed match history records. Finished games no longer call it;
-- player presence for active games is handled by player_disconnected instead.
DROP FUNCTION IF EXISTS public.leave_game(uuid, uuid);
