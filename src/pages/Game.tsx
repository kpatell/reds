import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { useGameState } from '@/hooks/useGameState'
import { GameBoard } from '@/components/GameBoard'
import { supabase } from '@/lib/supabase'
import { initializeGame, drawCard, discardDrawnCard, swapCard } from '@/lib/game/engine'
import type { Database, Json } from '@/types/supabase'


export default function Game() {
    const { gameId } = useParams()
    const { user } = useAuth()
    const { gameState, loading, error } = useGameState(gameId!)

    useEffect(() => {
        if (!gameState || !user || !gameId) return

        const joinAndStartGame = async () => {
            // If I'm not in the game, join it
            const isPlayerInGame = Object.keys(gameState.players).includes(user.id)

            if (!isPlayerInGame) {
                // Check if game is full (already has 2 players)
                if (Object.keys(gameState.players).length >= 2) {
                    // Spectator mode? Or error? For now, just return.
                    return
                }

                // Add myself to players

                // We need a proper PlayerState. 
                // Since we don't have the full profile here, we'll use a placeholder or fetch it.
                // For anonymous auth, we might not have a username.
                const username = user.email?.split('@')[0] || 'Guest'

                // If we are the second player, we START the game.
                const existingPlayers = Object.values(gameState.players).map(p => ({ id: p.id, username: p.username }))
                const allPlayers = [...existingPlayers, { id: user.id, username }]

                if (allPlayers.length === 2) {
                    // Initialize Game (Deal cards, etc)
                    const newGameState = initializeGame(gameId, allPlayers)

                    // Update DB
                    const updatePayload: Database['public']['Tables']['games']['Update'] = {
                        status: 'playing',
                        deck: newGameState.deck as unknown as Json,
                        discard_pile: newGameState.discardPile as unknown as Json,
                        players: newGameState.players as unknown as Json,
                        current_turn_player_id: newGameState.currentTurnPlayerId,
                        last_action_at: new Date().toISOString()
                    }

                    const { error } = await (supabase
                        .from('games') as any)
                        .update(updatePayload)
                        .eq('id', gameId)

                    if (error) console.error('Error starting game:', error)
                } else {
                    // Just join as waiting
                    // We need to construct a partial PlayerState or just update the JSONB
                    // This is tricky because `initializeGame` creates the full state.
                    // If we are just joining, we might not have a hand yet.
                    // But `PlayerState` requires `hand`.
                    // So we should probably NOT add to `players` map until we start?
                    // OR we add with empty hand.

                    // Actually, if we are just joining a waiting room, we update the `players` JSONB.
                    // But our `GameState` type expects `players` to be `Record<string, PlayerState>`.
                    // And `PlayerState` has `hand`.
                    // So we can't really add a player without a hand if we strictly follow types.

                    // Solution: The DB `players` column is JSONB. We can store whatever.
                    // But `useGameState` maps it to `GameState`.
                    // Let's assume for 'waiting' status, hands can be empty.
                }
            }
        }

        joinAndStartGame()
    }, [gameState, user, gameId])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-red-500">Error: {error}</div>
            </div>
        )
    }

    const handleGameUpdate = async (newGameState: any) => {
        const updatePayload: Database['public']['Tables']['games']['Update'] = {
            status: newGameState.status,
            deck: newGameState.deck as unknown as Json,
            discard_pile: newGameState.discardPile as unknown as Json,
            players: newGameState.players as unknown as Json,
            current_turn_player_id: newGameState.currentTurnPlayerId,
            last_action_at: new Date().toISOString()
        }

        const { error } = await (supabase
            .from('games') as any)
            .update(updatePayload)
            .eq('id', gameId)

        if (error) console.error('Error updating game:', error)
    }

    const handleDraw = async (source: 'deck' | 'discard') => {
        if (!gameState || !user) return
        try {
            const newState = drawCard(gameState, user.id, source)
            await handleGameUpdate(newState)
        } catch (err: any) {
            console.error('Move failed:', err.message)
            // Ideally show toast
        }
    }

    const handleDiscard = async () => {
        if (!gameState || !user) return
        try {
            const newState = discardDrawnCard(gameState, user.id)
            await handleGameUpdate(newState)
        } catch (err: any) {
            console.error('Move failed:', err.message)
        }
    }

    const handleSwap = async (cardId: string) => {
        if (!gameState || !user) return
        try {
            const newState = swapCard(gameState, user.id, cardId)
            await handleGameUpdate(newState)
        } catch (err: any) {
            console.error('Move failed:', err.message)
        }
    }

    if (!gameState) return null

    return (
        <div className="min-h-screen bg-[var(--color-background)]">
            <GameBoard
                gameState={gameState}
                onDraw={handleDraw}
                onDiscard={handleDiscard}
                onSwap={handleSwap}
            />
        </div>
    )
}

