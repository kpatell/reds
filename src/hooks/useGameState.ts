import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { GameState } from '@/lib/game/types'
import type { Database } from '@/types/supabase'

type GameRow = Database['public']['Tables']['games']['Row']

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
    revealVotes: (row as any).reveal_votes ?? [],
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

          // Safety net: re-fetch if a status transition arrives with a null deck (WAL
          // truncation). Covers 'playing', 'reveal_pending', and 'finished' since those
          // transitions may come from RPCs that don't explicitly re-write JSONB columns.
          if (newGameRow.deck == null && ['playing', 'reveal_pending', 'finished'].includes(newGameRow.status ?? '')) {
            fetchById(gameId)
            return
          }

          setGameState(prev => {
            const newState = mapRowToGameState(newGameRow)
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

  return { gameState, setGameState, gameId, loading, error }
}
