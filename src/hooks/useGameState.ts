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
          // Convert DB row to GameState (need a mapper function)
          // For now, we might need to store the FULL GameState in the DB as JSON or map it.
          // The DB schema has: deck, discard_pile, players (jsonb).
          // We need to map this back to our GameState interface.
          setGameState(mapRowToGameState(newGameRow))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId])

  const fetchGame = async () => {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()

      if (error) throw error
      if (data) {
        setGameState(mapRowToGameState(data))
      }
    } catch (err: any) {
      console.error('Error fetching game:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return { gameState, loading, error }
}

function mapRowToGameState(row: GameRow): GameState {
  // TODO: Robust mapping. For now, assuming JSON structure matches.
  // We need to be careful about 'players' being a JSONB object in DB vs Record<string, PlayerState> in TS.
  // The types should align if we typed the DB JSON correctly.
  
  return {
    id: row.id,
    status: row.status,
    deck: row.deck as any, // Cast for now, should validate
    discardPile: row.discard_pile as any,
    players: row.players as any,
    currentTurnPlayerId: row.current_turn_player_id,
    turnPhase: 'draw', // Default for now, need to persist this in DB if we want it to survive refresh!
    // Wait, DB doesn't have turnPhase? We need to add it to schema or derive it.
    // For now, let's assume 'draw' if not present.
    drawnCard: null, // DB doesn't track this yet?
    lastActionAt: row.last_action_at || new Date().toISOString(),
    winnerId: null
  }
}
