import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/AuthProvider'
import { useGameState } from '@/hooks/useGameState'
import { GameBoard } from '@/components/GameBoard'
import { ScaleContainer } from '@/components/ScaleContainer'
import { supabase } from '@/lib/supabase'
import {
    initializeGame, drawCard, discardDrawnCard, swapCard, setPlayerReady,
    resolvePowerPeekSelf, resolvePowerPeekOpponent, finishPeek,
    resolvePowerLookSwapDecision, resolvePowerBlindSwap, resolvePowerLookSwap
} from '@/lib/game/engine'
import type { Database, Json } from '@/types/supabase'


export default function Game() {
    const { gameId } = useParams()
    const { user, signInAnonymously, loading: authLoading } = useAuth()
    const { gameState, loading: gameLoading, error } = useGameState(gameId!)

    // Auto-sign in for guests accessing via link
    useEffect(() => {
        if (!authLoading && !user) {
            console.log('User not authenticated, signing in anonymously...')
            signInAnonymously().catch(err => console.error('Auto sign-in failed:', err))
        }
    }, [authLoading, user, signInAnonymously])

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
                        turn_phase: newGameState.turnPhase,
                        drawn_card: newGameState.drawnCard
                            ? { ...newGameState.drawnCard, source: newGameState.drawnCardSource } as unknown as Json
                            : null,
                        last_action_at: new Date().toISOString()
                    }

                    const { error } = await (supabase
                        .from('games') as any)
                        .update(updatePayload)
                        .eq('id', gameId)

                    if (error) console.error('Error starting game:', error)
                } else {
                    // Just join as waiting
                    const newPlayerState = {
                        id: user.id,
                        username,
                        hand: [],
                        isReady: true,
                        hasCalledReds: false,
                        roundsWon: 0
                    }

                    const newPlayers = {
                        ...gameState.players,
                        [user.id]: newPlayerState
                    }

                    const { error } = await (supabase
                        .from('games') as any)
                        .update({ players: newPlayers as unknown as Json })
                        .eq('id', gameId)

                    if (error) console.error('Error joining game:', error)
                }
            }
        }

        joinAndStartGame()
    }, [gameState, user, gameId])

    if (authLoading || gameLoading) {
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
            turn_phase: newGameState.turnPhase,
            // Pack source into the JSON
            drawn_card: newGameState.drawnCard
                ? { ...newGameState.drawnCard, source: newGameState.drawnCardSource } as unknown as Json
                : null,
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

    const handleReady = async () => {
        if (!gameState || !user) return
        try {
            const newState = setPlayerReady(gameState, user.id)
            await handleGameUpdate(newState)
        } catch (err: any) {
            console.error('Ready failed:', err.message)
        }
    }

    const handleResolvePower = async (targetCardId: string) => {
        if (!gameState || !user) return

        try {
            let newGameState
            if (gameState.turnPhase === 'power_peek_self') {
                newGameState = resolvePowerPeekSelf(gameState, user.id, targetCardId)
            } else if (gameState.turnPhase === 'power_peek_opponent') {
                newGameState = resolvePowerPeekOpponent(gameState, user.id, targetCardId)
            } else if (gameState.turnPhase === 'power_blind_swap') {
                newGameState = resolvePowerBlindSwap(gameState, user.id, targetCardId)
            } else if (gameState.turnPhase === 'power_look_swap') {
                newGameState = resolvePowerLookSwap(gameState, user.id, targetCardId)
            } else {
                return
            }

            // Use handleGameUpdate to send the FULL state, preventing deck data loss
            await handleGameUpdate(newGameState)

        } catch (error: any) {
            console.error('Error resolving power:', error)
            // toast.error(error.message)
        }
    }

    async function handleFinishPeek() {
        if (!gameId || !user) return
        try {
            const newState = finishPeek(gameState!, user.id)
            await handleGameUpdate(newState)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to finish peek')
        }
    }

    async function handlePowerLookSwapDecision(action: 'swap' | 'keep') {
        if (!gameId || !user) return
        try {
            const newState = resolvePowerLookSwapDecision(gameState!, user.id, action)
            await handleGameUpdate(newState)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to resolve decision')
        }
    }

    if (!gameState) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <div className="text-xl font-bold text-red-600">Game not found</div>
                <div className="text-sm text-gray-500">ID: {gameId}</div>
                <button onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-500 text-white rounded">
                    Retry
                </button>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[var(--color-background)] overflow-hidden">
            <ScaleContainer>
                <GameBoard
                    gameState={gameState}
                    onDraw={handleDraw}
                    onDiscard={handleDiscard}
                    onSwap={handleSwap}
                    onReady={handleReady}
                    onResolvePower={handleResolvePower}
                    onFinishPeek={handleFinishPeek}
                    onPowerLookSwapDecision={handlePowerLookSwapDecision}
                />
            </ScaleContainer>
        </div>
    )
}
