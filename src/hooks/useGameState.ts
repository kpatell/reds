import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Card, GameState, PlayerState, TurnPhase } from '@/lib/game/types'
import type { Database } from '@/types/supabase'

type GameRow = Database['public']['Tables']['games']['Row']

function mapRowToGameState(row: GameRow): GameState {
  const players = (row.players as unknown as Record<string, PlayerState>) ?? {}

  Object.keys(players).forEach(key => {
    if (!players[key].hand) players[key].hand = []
    if (!players[key].roundsWon) players[key].roundsWon = 0
  })

  // drawn_card persists as { card: Card; source: 'deck'|'discard' } (current write path)
  // or a bare Card (rows written before the source field was added).
  type DrawnCardRow = { card: Card; source: 'deck' | 'discard' } | Card
  const dc = row.drawn_card as DrawnCardRow | null

  return {
    id: row.id,
    status: (row.status ?? 'waiting') as GameState['status'],
    deck: (row.deck as unknown as Card[]) ?? [],
    discardPile: (row.discard_pile as unknown as Card[]) ?? [],
    players,
    currentTurnPlayerId: row.current_turn_player_id,
    turnPhase: (row.turn_phase ?? 'draw') as TurnPhase,
    drawnCard: dc && 'card' in dc ? dc.card : (dc as Card | null),
    drawnCardSource: dc && 'source' in dc ? dc.source : null,
    pendingStackTransfer: row.pending_stack_transfer as GameState['pendingStackTransfer'],
    lastActionAt: row.last_action_at ?? new Date().toISOString(),
    lastGameAction: row.last_game_action as GameState['lastGameAction'],
    callerId: row.caller_id,
    winnerId: row.winner_id,
    rematchVotes: (row.rematch_votes as string[] | null) ?? [],
    revealVotes: (row.reveal_votes as string[] | null) ?? [],
  }
}

export function useGameState(shortCode: string) {
  const [gameId, setGameId] = useState<string | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchById = useCallback(async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      if (data) setGameState(mapRowToGameState(data))
    } catch (err: any) {
      setError(err.message)
    }
  }, [])

  const fetchByShortCode = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('short_code', shortCode)
        .maybeSingle()

      if (error) throw error
      if (!data) {
        setError('invalid_code')
        return
      }
      setGameId(data.id)
      setGameState(mapRowToGameState(data))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [shortCode])

  useEffect(() => {
    if (!shortCode) return
    fetchByShortCode()
  }, [shortCode, fetchByShortCode])

  useEffect(() => {
    if (!gameId) return

    const channel = supabase
      .channel(`game:${gameId}`)
      .on('broadcast', { event: 'game_started' }, () => fetchById(gameId))
      .on('broadcast', { event: 'state_updated' }, () => fetchById(gameId))
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        () => fetchById(gameId)
      )
      .subscribe(async (status) => {
        // Catch-up fetch: if an UPDATE landed between the initial fetch and when
        // this subscription became active, we would have missed it. Re-fetch once
        // after the channel is confirmed SUBSCRIBED to close that gap.
        if (status === 'SUBSCRIBED') {
          await fetchById(gameId)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId, fetchById])

  // Deliberate polling failsafe: Supabase Realtime occasionally drops the
  // `game_started` broadcast on the free tier, so we keep a 1.5s poll while
  // waiting so Player A never gets stuck on the "waiting for opponent" screen.
  useEffect(() => {
    if (!gameId || gameState?.status !== 'waiting') return
    const interval = setInterval(() => fetchById(gameId), 1500)
    return () => clearInterval(interval)
  }, [gameId, gameState?.status, fetchById])

  return { gameState, setGameState, gameId, loading, error, fetchById }
}
