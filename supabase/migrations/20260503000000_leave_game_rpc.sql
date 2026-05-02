-- RPC: leave_game
-- Removes a player from the games.players JSONB column for finished games only.
-- Uses SECURITY DEFINER so the client never needs direct UPDATE access to the games table.
create or replace function leave_game(p_game_id uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update games
  set players = players - p_player_id::text
  where id = p_game_id
    and status = 'finished';
end;
$$;
