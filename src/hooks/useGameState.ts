import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { GameState } from '@/lib/game/types'
import type { Database } from '@/types/supabase'

type GameRow = Database['public']['Tables']['games']['Row']

export function useGameState(gameId: string) {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gameId) return

    // Initial fetch
    fetchGame()

    // Realtime subscription
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
          // Convert DB row to GameState
          setGameState(mapRowToGameState(newGameRow))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId])

  const fetchGame = async () => {
    console.log('Fetching game:', gameId)
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()

      if (error) {
        console.error('Supabase error fetching game:', error)
        throw error
      }
      
      console.log('Game data fetched:', data)
      if (data) {
        const mappedState = mapRowToGameState(data)
        console.log('Mapped state:', mappedState)
        setGameState(mappedState)
      } else {
        console.warn('No data returned for game:', gameId)
      }
    } catch (err: any) {
      console.error('Error fetching game:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return { gameState, setGameState, loading, error }
}

function mapRowToGameState(row: GameRow): GameState {
  const players = (row.players as any) || {}
  
  // Ensure every player has a hand array to prevent UI crashes
  Object.keys(players).forEach(key => {
    if (!players[key].hand) {
      players[key].hand = []
    }
    if (!players[key].roundsWon) {
        players[key].roundsWon = 0
    }
  })

  return {
    id: row.id,
    status: (row.status as any) || 'waiting',
    deck: (row.deck as any) || [],
    discardPile: (row.discard_pile as any) || [],
    players: players,
    currentTurnPlayerId: row.current_turn_player_id,
    turnPhase: (row.turn_phase as any) || 'draw',
    drawnCard: (row.drawn_card as any)?.card || (row.drawn_card as any) || null, // Handle legacy or new format
    drawnCardSource: (row.drawn_card as any)?.source || null,
    pendingStackTransfer: (row.pending_stack_transfer as any) || null,
    lastActionAt: row.last_action_at || new Date().toISOString(),
    lastGameAction: (row as any).last_game_action || null,
    winnerId: null
  }
}
