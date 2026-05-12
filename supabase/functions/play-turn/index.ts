import { createClient } from 'npm:@supabase/supabase-js@2'
import { applyAction } from '../_shared/engine.ts'
import type { PlayTurnAction } from '../_shared/engine.ts'
import type { GameState, Card } from '../_shared/types.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// Mirrors mapRowToGameState in useGameState.ts
// deno-lint-ignore no-explicit-any
function mapRowToGameState(row: Record<string, any>): GameState {
  const players = (row.players as Record<string, GameState['players'][string]>) ?? {}
  Object.keys(players).forEach(key => {
    if (!players[key].hand) players[key].hand = []
    if (!players[key].roundsWon) players[key].roundsWon = 0
  })

  type DrawnCardRow = { card: Card; source: 'deck' | 'discard' } | Card
  const dc = row.drawn_card as DrawnCardRow | null

  return {
    id: row.id,
    status: (row.status ?? 'waiting') as GameState['status'],
    deck: (row.deck as Card[]) ?? [],
    discardPile: (row.discard_pile as Card[]) ?? [],
    players,
    currentTurnPlayerId: row.current_turn_player_id,
    turnPhase: row.turn_phase ?? 'draw',
    drawnCard: dc && 'card' in dc ? (dc as { card: Card }).card : (dc as Card | null),
    drawnCardSource: dc && 'source' in dc ? (dc as { source: 'deck' | 'discard' }).source : null,
    pendingStackTransfer: row.pending_stack_transfer ?? null,
    lastActionAt: row.last_action_at ?? new Date().toISOString(),
    lastGameAction: row.last_game_action ?? null,
    callerId: row.caller_id ?? null,
    winnerId: row.winner_id ?? null,
    rematchVotes: (row.rematch_votes as string[] | null) ?? [],
    revealVotes: (row.reveal_votes as string[] | null) ?? [],
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const { gameId, action }: { gameId: string; action: PlayTurnAction } = await req.json()
    if (!gameId || !action?.type) return json({ error: 'Missing gameId or action' }, 400)

    // Authenticate the caller via their JWT
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    // Service-role client bypasses RLS for atomic read-compute-write
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: row, error: readError } = await admin
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single()

    if (readError || !row) return json({ error: 'Game not found' }, 404)

    // Verify the caller is actually a participant
    const players = (row.players as Record<string, unknown>) ?? {}
    if (!(user.id in players)) return json({ error: 'You are not in this game' }, 403)

    if (action.type === 'draw' && action.forceCardRank) {
      const devEmails = (Deno.env.get('VITE_DEV_EMAILS') ?? '').split(',').map(e => e.trim())
      if (!user.email || !devEmails.includes(user.email)) {
        delete (action as Record<string, unknown>).forceCardRank
      }
    }

    const currentState = mapRowToGameState(row)
    const newState = applyAction(currentState, user.id, action)

    const { data: updated, error: writeError } = await admin
      .from('games')
      .update({
        status: newState.status,
        deck: newState.deck,
        discard_pile: newState.discardPile,
        players: newState.players,
        current_turn_player_id: newState.currentTurnPlayerId,
        turn_phase: newState.turnPhase,
        drawn_card: newState.drawnCard
          ? { ...newState.drawnCard, source: newState.drawnCardSource }
          : null,
        last_action_at: newState.lastActionAt,
        last_game_action: newState.lastGameAction ?? null,
        winner_id: newState.winnerId ?? null,
        pending_stack_transfer: newState.pendingStackTransfer ?? null,
        reveal_votes: newState.revealVotes ?? [],
      })
      .eq('id', gameId)
      .eq('last_action_at', currentState.lastActionAt)
      .select('id')

    if (writeError) throw writeError
    if (!updated || updated.length === 0) {
      return json({ error: 'Concurrent update detected, please retry' }, 409)
    }

    return json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return json({ error: message }, 400)
  }
})
