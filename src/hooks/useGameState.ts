import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { GameState } from '@/lib/game/types'
import type { Database } from '@/types/supabase'

type GameRow = Database['public']['Tables']['games']['Row']

export function useGameState(gameId: string) {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchGame = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()

      if (error) throw error
      if (data) setGameState(mapRowToGameState(data))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [gameId])

  useEffect(() => {
    if (!gameId) return

    fetchGame()

    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          const newGameRow = payload.new as GameRow

          // When the game finishes the Supabase WAL diff payload may truncate
          // large JSONB columns (players, deck), so we can't trust it to carry
          // the final hand state. Do a fresh authoritative SELECT instead.
          if (newGameRow.status === 'finished') {
            fetchGame()
            return
          }

          setGameState(prev => {
            const newState = mapRowToGameState(newGameRow)
            // Guard: preserve columns that Supabase omits from WAL diff when unchanged
            if (prev && newGameRow.deck == null && prev.deck.length > 0) {
              newState.deck = prev.deck
            }
            if (prev && newGameRow.discard_pile == null && prev.discardPile.length > 0) {
              newState.discardPile = prev.discardPile
            }
            return newState
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId, fetchGame])

  return { gameState, setGameState, loading, error }
}

function mapRowToGameState(row: GameRow): GameState {
  const players = (row.players as any) || {}

  Object.keys(players).forEach(key => {
    if (!players[key].hand) players[key].hand = []
    if (!players[key].roundsWon) players[key].roundsWon = 0
  })

  return {
    id: row.id,
    status: (row.status as any) || 'waiting',
    deck: (row.deck as any) || [],
    discardPile: (row.discard_pile as any) || [],
    players,
    currentTurnPlayerId: row.current_turn_player_id,
    turnPhase: (row.turn_phase as any) || 'draw',
    drawnCard: (row.drawn_card as any)?.card || (row.drawn_card as any) || null,
    drawnCardSource: (row.drawn_card as any)?.source || null,
    pendingStackTransfer: (row.pending_stack_transfer as any) || null,
    lastActionAt: row.last_action_at || new Date().toISOString(),
    lastGameAction: (row as any).last_game_action || null,
    callerId: (row as any).caller_id ?? null,
    winnerId: (row as any).winner_id ?? null,
    rematchVotes: (row as any).rematch_votes ?? [],
  }
}
