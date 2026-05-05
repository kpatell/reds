import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Copy, Loader2, Volume2, VolumeX } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/AuthProvider'
import { useGameState } from '@/hooks/useGameState'
import { useAudio } from '@/hooks/useAudio'
import { useEmotes } from '@/hooks/useEmotes'
import { usePresence } from '@/hooks/usePresence'
import { GameBoard } from '@/components/GameBoard'
import { ShowdownOverlay } from '@/components/ShowdownOverlay'
import { RulesModal } from '@/components/RulesModal'
import { Modal } from '@/components/Modal'

import { supabase } from '@/lib/supabase'
import {
    initializeGame, drawCard, discardDrawnCard, swapCard, setPlayerReady,
    resolvePowerPeekSelf, resolvePowerPeekOpponent, finishPeek,
    resolvePowerLookSwapDecision, resolvePowerBlindSwap, resolvePowerLookSwap
} from '@/lib/game/engine'
import type { Database, Json } from '@/types/supabase'


export default function Game() {
    const { shortCode } = useParams()
    const { user, profile, signInAnonymously, loading: authLoading } = useAuth()
    const navigate = useNavigate()
    const { gameState, setGameState, gameId, loading: gameLoading, error } = useGameState(shortCode!)

    const [highlightedCardIds, setHighlightedCardIds] = useState<string[]>([])
    const [isDebugMode, setIsDebugMode] = useState(false)
    const [rulesOpen, setRulesOpen] = useState(false)
    const [disconnectOpen, setDisconnectOpen] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const isProcessingRef = useRef(false)
    const latestGameState = useRef(gameState)
    useEffect(() => { latestGameState.current = gameState }, [gameState])
    const { isMuted, toggleMute, playDraw, playSwap, playError, playReds } = useAudio()
    const { sendEmote, incomingEmote, localEmote } = useEmotes(gameId, user?.id ?? null)
    const connectedPlayerIds = usePresence(gameId, user?.id ?? null)

    // Prevents initializeGame from being called twice when the effect re-fires
    // during the optimistic state update window (concurrent async closures).
    const gameInitializedRef = useRef(false)
    const processedActionRef = useRef<string | null>(null)

    const opponentId = gameState && user
        ? (Object.keys(gameState.players).find(id => id !== user.id) ?? null)
        : null
    const opponentWasPresentRef = useRef(false)
    const opponentUsernameRef = useRef('Opponent')
    // Tracks whether the opponent ever appeared in Presence (so we only show the
    // disconnect modal after they were confirmed connected, not before first join).
    const opponentEverConnectedRef = useRef(false)

    // Effect for notifications based on lastAction
    useEffect(() => {
        if (!gameState?.lastGameAction) return
        if (!['playing', 'final_turn', 'reveal_pending'].includes(gameState.status)) return

        const action = gameState.lastGameAction
        const actionTime = new Date(gameState.lastActionAt).getTime()
        const now = new Date().getTime()

        if (now - actionTime > 5000) return // Reduce timeout to avoid old toasts
        const signature = JSON.stringify(action)
        if (processedActionRef.current === signature) return
        processedActionRef.current = signature

        // Handle Notifications & Visuals
        if (['swap', 'power_peek_self', 'power_peek_opponent', 'power_blind_swap', 'power_look_swap'].includes(action.actionType)) {
            toast.info(action.description)

            // Universal Visual Highlight
            if (action.metadata && action.metadata.highlightedCardIds) {
                // Cast to array of strings
                const ids = action.metadata.highlightedCardIds as string[]
                if (ids && ids.length > 0) {
                    setHighlightedCardIds(ids)
                    setTimeout(() => setHighlightedCardIds([]), 3000)
                }
            }
        }

        if (action.actionType === 'power_skip') {
            toast.info("Opponent declined to swap (Power 9)")
        }

        if (action.actionType === 'stack_failed') {
            playError()
            toast.error(action.description)
            if (action.metadata && action.metadata.highlightedCardIds) {
                const ids = action.metadata.highlightedCardIds as string[]
                if (ids && ids.length > 0) {
                    setHighlightedCardIds(ids)
                    setTimeout(() => setHighlightedCardIds([]), 3000)
                }
            }
        }
        
        if (action.actionType === 'stack_success') {
            playSwap()
            toast.success(action.description)
            if (action.metadata && action.metadata.highlightedCardIds) {
                const ids = action.metadata.highlightedCardIds as string[]
                if (ids && ids.length > 0) {
                    setHighlightedCardIds(ids)
                    setTimeout(() => setHighlightedCardIds([]), 3000)
                }
            }
        }

        if (action.actionType === 'stack_transfer') {
            toast.success(action.description)
            if (action.metadata && action.metadata.highlightedCardIds) {
                const ids = action.metadata.highlightedCardIds as string[]
                if (ids && ids.length > 0) {
                    setHighlightedCardIds(ids)
                    setTimeout(() => setHighlightedCardIds([]), 3000)
                }
            }
        }

        if (action.actionType === 'call_reds') {
            const callerIsMe = action.playerId === user?.id
            if (callerIsMe) {
                toast.success('You called REDS!')
            } else {
                const callerName = gameState?.players[action.playerId ?? '']?.username ?? 'Opponent'
                toast.warning(`${callerName} called REDS — this is your final turn!`)
            }
        }
    }, [gameState?.lastActionAt, gameState?.lastGameAction])

    // Notify when opponent has voted to reveal but current player hasn't yet
    useEffect(() => {
        if (!gameState || !user || gameState.status !== 'reveal_pending') return
        const opponentId = Object.keys(gameState.players).find(id => id !== user.id)
        if (!opponentId) return
        const votes = gameState.revealVotes ?? []
        if (votes.includes(opponentId) && !votes.includes(user.id)) {
            const opponentName = gameState.players[opponentId]?.username ?? 'Opponent'
            toast.info(`${opponentName} is ready to reveal!`)
        }
    }, [(gameState?.revealVotes ?? []).length])

    // Notify when opponent votes for rematch but current player hasn't yet
    useEffect(() => {
        if (!gameState || !user || gameState.status !== 'finished') return
        const opponentId = Object.keys(gameState.players).find(id => id !== user.id)
        if (!opponentId) return
        const votes = gameState.rematchVotes ?? []
        if (votes.includes(opponentId) && !votes.includes(user.id)) {
            const opponentName = gameState.players[opponentId]?.username ?? 'Opponent'
            toast.info(`${opponentName} wants to play again!`)
        }
    }, [(gameState?.rematchVotes ?? []).length])

    // Scenario A: notify me the moment the opponent leaves while I've already voted
    useEffect(() => {
        if (!gameState || !user || gameState.status !== 'finished') return
        if (opponentId) {
            opponentWasPresentRef.current = true
            opponentUsernameRef.current = gameState.players[opponentId]?.username ?? 'Opponent'
            return
        }
        if (opponentWasPresentRef.current) {
            opponentWasPresentRef.current = false
            if ((gameState.rematchVotes ?? []).includes(user.id)) {
                toast.info(`${opponentUsernameRef.current} left the game`)
            }
        }
    }, [opponentId, gameState?.status])

    // Show/dismiss the disconnect modal based on Presence changes
    useEffect(() => {
        const activeStatuses = ['preview', 'playing', 'final_turn', 'reveal_pending']
        if (!gameState || !user || !activeStatuses.includes(gameState.status)) return
        if (!opponentId) return

        const isConnected = connectedPlayerIds.includes(opponentId)

        if (isConnected) {
            opponentEverConnectedRef.current = true
            setDisconnectOpen(false) // dismiss if they reconnect
        } else if (opponentEverConnectedRef.current) {
            setDisconnectOpen(true)
        }
    }, [connectedPlayerIds, opponentId, gameState?.status, user])

    // Auto-sign in for guests accessing via link
    useEffect(() => {
        if (!authLoading && !user) {
            console.log('User not authenticated, signing in anonymously...')
            signInAnonymously().catch((err: unknown) => console.error('Auto sign-in failed:', err))
        }
    }, [authLoading, user, signInAnonymously])

    // Redirect on invalid code
    useEffect(() => {
        if (error === 'invalid_code') {
            toast.error('Invalid Code — no game found.')
            navigate('/')
        }
    }, [error, navigate])

    useEffect(() => {
        if (!gameState || !user || !gameId) return

        const joinAndStartGame = async () => {
            // If I'm not in the game, join it
            const isPlayerInGame = Object.keys(gameState.players).includes(user.id)

            if (!isPlayerInGame) {
                // Check if game is full (already has 2 players)
                if (Object.keys(gameState.players).length >= 2) {
                    toast.error('Game is Full')
                    navigate('/')
                    return
                }

                const username = profile?.username || user.email?.split('@')[0] || 'Guest'
                const avatarUrl = profile?.avatar_url ?? null

                // If we are the second player, we START the game.
                const existingPlayers = Object.values(gameState.players).map(p => ({ id: p.id, username: p.username, avatar_url: p.avatar_url ?? null }))
                const allPlayers = [...existingPlayers, { id: user.id, username, avatar_url: avatarUrl }]

                if (allPlayers.length === 2) {
                    if (gameInitializedRef.current) return
                    gameInitializedRef.current = true

                    // Initialize Game (Deal cards, etc)
                    const newGameState = initializeGame(gameId, allPlayers)
                    // Optimistic update so Player B sees their cards before the realtime round-trip
                    setGameState(newGameState)

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

                    if (error) {
                        gameInitializedRef.current = false
                        console.error('Error starting game:', error)
                    } else {
                        supabase.channel(`game:${gameId}`).send({ type: 'broadcast', event: 'game_started', payload: {} })
                    }
                } else {
                    // Just join as waiting
                    const newPlayerState = {
                        id: user.id,
                        username,
                        avatar_url: avatarUrl,
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
        if (!gameId) return
        const updatePayload: any = {
            status: newGameState.status,
            deck: newGameState.deck as unknown as Json,
            discard_pile: newGameState.discardPile as unknown as Json,
            players: newGameState.players as unknown as Json,
            current_turn_player_id: newGameState.currentTurnPlayerId,
            turn_phase: newGameState.turnPhase,
            drawn_card: newGameState.drawnCard
                ? { ...newGameState.drawnCard, source: newGameState.drawnCardSource } as unknown as Json
                : null,
            last_action_at: new Date().toISOString(),
            last_game_action: newGameState.lastGameAction as unknown as Json,
            winner_id: newGameState.winnerId ?? null,
        }

        console.log('[Game Update] Sending payload:', updatePayload)

        const { error } = await (supabase
            .from('games') as any)
            .update(updatePayload)
            .eq('id', gameId)

        if (error) {
            console.error('[Game Update] Update FAILED:', error)
        } else {
            console.log('[Game Update] Update SUCCESS')
        }
    }

    const handleDraw = async (source: 'deck' | 'discard') => {
        const gs = latestGameState.current
        if (!gs || !user || isProcessingRef.current) return
        isProcessingRef.current = true
        setIsProcessing(true)
        try {
            const newState = drawCard(gs, user.id, source)
            playDraw()
            await handleGameUpdate(newState)
        } catch (err: any) {
            console.error('Move failed:', err.message)
        } finally {
            isProcessingRef.current = false
            setIsProcessing(false)
        }
    }

    const handleDiscard = async () => {
        const gs = latestGameState.current
        if (!gs || !user || isProcessingRef.current) return
        isProcessingRef.current = true
        setIsProcessing(true)
        try {
            const newState = discardDrawnCard(gs, user.id)
            setGameState(newState)
            await handleGameUpdate(newState)
        } catch (err: any) {
            console.error('Move failed:', err.message)
        } finally {
            isProcessingRef.current = false
            setIsProcessing(false)
        }
    }

    const handleSwap = async (cardId: string) => {
        const gs = latestGameState.current
        if (!gs || !user || isProcessingRef.current) return
        isProcessingRef.current = true
        setIsProcessing(true)
        try {
            const newState = swapCard(gs, user.id, cardId)
            playSwap()
            await handleGameUpdate(newState)
        } catch (err: any) {
            console.error('Move failed:', err.message)
        } finally {
            isProcessingRef.current = false
            setIsProcessing(false)
        }
    }

    const handleReady = async () => {
        if (!gameState || !user || isProcessingRef.current) return
        isProcessingRef.current = true
        setIsProcessing(true)
        try {
            const newState = setPlayerReady(gameState, user.id)
            setGameState(newState)
            await handleGameUpdate(newState)
        } catch (err: any) {
            console.error('Ready failed:', err.message)
        } finally {
            isProcessingRef.current = false
            setIsProcessing(false)
        }
    }

    const handleResolvePower = async (targetCardId: string) => {
        if (!gameState || !user || isProcessingRef.current) return
        isProcessingRef.current = true
        setIsProcessing(true)
        try {
            let newGameState
            if (gameState.turnPhase === 'power_peek_self') {
                newGameState = resolvePowerPeekSelf(gameState, user.id, targetCardId)
                playSwap()
            } else if (gameState.turnPhase === 'power_peek_opponent') {
                newGameState = resolvePowerPeekOpponent(gameState, user.id, targetCardId)
                playSwap()
            } else if (gameState.turnPhase === 'power_blind_swap') {
                newGameState = resolvePowerBlindSwap(gameState, user.id, targetCardId)
            } else if (gameState.turnPhase === 'power_look_swap') {
                newGameState = resolvePowerLookSwap(gameState, user.id, targetCardId)
                if (!gameState.players[user.id]?.swapSourceCardId) playSwap()
            } else {
                return
            }
            await handleGameUpdate(newGameState)
        } catch (error: any) {
            console.error('Error resolving power:', error)
        } finally {
            isProcessingRef.current = false
            setIsProcessing(false)
        }
    }

    async function handleFinishPeek() {
        if (!gameId || !user || isProcessingRef.current) return
        isProcessingRef.current = true
        setIsProcessing(true)
        try {
            const newState = finishPeek(gameState!, user.id)
            playSwap()
            await handleGameUpdate(newState)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to finish peek')
        } finally {
            isProcessingRef.current = false
            setIsProcessing(false)
        }
    }

    async function handlePowerLookSwapDecision(action: 'swap' | 'keep') {
        if (!gameId || !user || isProcessingRef.current) return
        isProcessingRef.current = true
        setIsProcessing(true)
        try {
            const newState = resolvePowerLookSwapDecision(gameState!, user.id, action)
            await handleGameUpdate(newState)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to resolve decision')
        } finally {
            isProcessingRef.current = false
            setIsProcessing(false)
        }
    }

    async function handleSkipPower() {
        if (!gameId || !user || isProcessingRef.current) return
        isProcessingRef.current = true
        setIsProcessing(true)
        try {
            const { skipPower } = await import('@/lib/game/engine')
            const newState = skipPower(gameState!, user.id)
            await handleGameUpdate(newState)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to skip power')
        } finally {
            isProcessingRef.current = false
            setIsProcessing(false)
        }
    }

    const handleCallReds = async () => {
        if (!gameState || !user || !gameId) return
        try {
            const { data, error } = await supabase.rpc('call_reds', {
                p_game_id: gameId,
                p_player_id: user.id
            })
            if (error) throw error
            const result = data as { success?: boolean; error?: string }
            if (result && !result.success) {
                toast.error(result.error || 'Failed to call REDS')
            } else {
                playReds()
            }
        } catch (error: unknown) {
            console.error('Call REDS error:', error)
            toast.error(error instanceof Error ? error.message : 'Failed to call REDS')
        }
    }

    const handlePlayAgain = async () => {
        if (!gameState || !user || !gameId || gameState.status !== 'finished') return
        const winnerId = gameState.winnerId
        const playersList = Object.values(gameState.players).map(p => ({ id: p.id, username: p.username }))
        const newState = initializeGame(gameId, playersList, winnerId ?? undefined)

        const { error } = await (supabase.from('games') as any)
            .update({
                status: 'playing',
                deck: newState.deck as unknown as Json,
                discard_pile: newState.discardPile as unknown as Json,
                players: newState.players as unknown as Json,
                current_turn_player_id: newState.currentTurnPlayerId,
                turn_phase: newState.turnPhase,
                drawn_card: null,
                last_action_at: new Date().toISOString(),
                last_game_action: null,
                winner_id: null,
                caller_id: null,
                pending_stack_transfer: null,
                rematch_votes: [],
                reveal_votes: [],
            })
            .eq('id', gameId)
            .eq('status', 'finished') // Guard against duplicate clicks

        if (error) toast.error('Failed to start new round')
    }

    const handleLeave = async () => {
        if (gameState && user && gameId) {
            try {
                if (gameState.status === 'finished') {
                    await supabase.rpc('leave_game', {
                        p_game_id: gameId,
                        p_player_id: user.id,
                    })
                } else {
                    // Eagerly mark ourselves disconnected before the component unmounts
                    // so the lobby count updates without waiting for the WS timeout.
                    await supabase.rpc('player_disconnected', {
                        p_game_id: gameId,
                        p_player_id: user.id,
                    })
                }
            } catch (err) {
                console.error('Failed to signal leave:', err)
            }
        }
        navigate('/')
    }

    const handleVoteRematch = async () => {
        if (!gameState || !user || !gameId) return
        try {
            const { data, error } = await supabase.rpc('vote_rematch', {
                p_game_id: gameId,
                p_player_id: user.id
            })
            if (error) throw error
            const result = data as { success: boolean; both_agreed: boolean; error?: string }
            if (!result?.success) {
                throw new Error(result?.error ?? 'Vote rejected by server')
            }
            if (result.both_agreed) {
                await handlePlayAgain()
            }
        } catch (err: unknown) {
            console.error('[Vote Rematch] Error:', err)
            toast.error(err instanceof Error ? err.message : 'Failed to request rematch')
        }
    }

    const handleVoteReveal = async () => {
        if (!gameState || !user || !gameId) return
        // Optimistic: reflect this player's vote immediately without waiting for realtime
        setGameState(prev => {
            if (!prev || !user) return prev
            const votes = prev.revealVotes ?? []
            if (votes.includes(user.id)) return prev
            return { ...prev, revealVotes: [...votes, user.id] }
        })
        try {
            const { data, error } = await supabase.rpc('vote_reveal', {
                p_game_id: gameId,
                p_player_id: user.id
            })
            if (error) throw error
            const result = data as { success: boolean; both_voted: boolean; error?: string }
            if (!result?.success) {
                throw new Error(result?.error ?? 'Vote rejected by server')
            }
        } catch (err: unknown) {
            console.error('[Vote Reveal] Error:', err)
            // Roll back optimistic update on failure
            setGameState(prev => {
                if (!prev || !user) return prev
                return { ...prev, revealVotes: (prev.revealVotes ?? []).filter(id => id !== user.id) }
            })
            toast.error(err instanceof Error ? err.message : 'Failed to reveal cards')
        }
    }

    const handleStack = async (handCardId: string, targetDiscardCardId: string) => {
        if (!gameState || !user || !gameId) return

        // Optimistic update: move card from hand to discard pile so FM can animate the FLIP.
        // Rolled back if the server rejects (race condition / wrong card).
        const prevState = gameState
        const myPlayer = gameState.players[user.id]
        if (myPlayer) {
            const cardIdx = myPlayer.hand.findIndex(c => c?.id === handCardId)
            if (cardIdx !== -1) {
                const card = myPlayer.hand[cardIdx]!
                const newHand = [...myPlayer.hand]
                newHand[cardIdx] = null
                setGameState({
                    ...gameState,
                    players: { ...gameState.players, [user.id]: { ...myPlayer, hand: newHand } },
                    discardPile: [...gameState.discardPile, { ...card, isFaceUp: true }],
                })
            }
        }

        try {
            const { error } = await supabase.rpc('attempt_stack', {
                p_game_id: gameId,
                p_player_id: user.id,
                p_hand_card_id: handCardId,
                p_target_discard_card_id: targetDiscardCardId
            })

            if (error) throw error

            // Toast is handled by the realtime subscription (stack_failed / stack_success)
            // so we don't show one here to avoid duplicate notifications
        } catch (error: unknown) {
            setGameState(prevState)
            console.error('Stack error:', error)
            toast.error(error instanceof Error ? error.message : 'Failed to stack card')
        }
    }

    const handleTransfer = async (handCardId: string) => {
        if (!gameState || !user || !gameId) return

        // Optimistic update: fly the card from my hand into the opponent's hand.
        // Knowledge-doesn't-travel rule: card enters opponent's hand face-down.
        const prevState = gameState
        const myPlayer = gameState.players[user.id]
        const oppId = Object.keys(gameState.players).find(id => id !== user.id)
        const opp = oppId ? gameState.players[oppId] : null
        if (myPlayer && opp && oppId) {
            const cardIdx = myPlayer.hand.findIndex(c => c?.id === handCardId)
            if (cardIdx !== -1) {
                const card = myPlayer.hand[cardIdx]!
                const newHand = [...myPlayer.hand]
                newHand[cardIdx] = null
                setGameState({
                    ...gameState,
                    players: {
                        ...gameState.players,
                        [user.id]: { ...myPlayer, hand: newHand },
                        [oppId]: (() => {
                                    const oppHand = [...opp.hand]
                                    const nullSlot = oppHand.findIndex(c => c === null)
                                    const incoming = { ...card, isFaceUp: false }
                                    if (nullSlot !== -1) oppHand[nullSlot] = incoming
                                    else oppHand.push(incoming)
                                    return { ...opp, hand: oppHand }
                                })(),
                    },
                    pendingStackTransfer: null,
                })
            }
        }

        try {
            const { data, error } = await supabase.rpc('resolve_stack_transfer', {
                p_game_id: gameId,
                p_player_id: user.id,
                p_hand_card_id: handCardId
            })

            if (error) throw error
            const result = data as { success?: boolean; error?: string }
            if (result && !result.success) {
                setGameState(prevState)
                toast.error(result.error || 'Failed to transfer card')
            }
        } catch (error: any) {
            setGameState(prevState)
            console.error('Transfer error:', error)
            toast.error(error.message || 'Failed to transfer card')
        }
    }

    if (!gameState) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <div className="text-xl font-bold text-red-600">Game not found</div>
                <div className="text-sm text-gray-500">Code: {shortCode}</div>
                <button onClick={() => window.location.href = '/'} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium">
                    Back to Lobby
                </button>
            </div>
        )
    }

    const isMyTurn = gameState.currentTurnPlayerId === user?.id
    const isPeekPhase = gameState.turnPhase === 'peek'
    const isFinalTurn = gameState.status === 'final_turn'
    const isRevealPending = gameState.status === 'reveal_pending'

    const revealVotes = gameState.revealVotes ?? []
    const iHaveVotedReveal = user ? revealVotes.includes(user.id) : false
    const opponentHasVotedReveal = opponentId ? revealVotes.includes(opponentId) : false

    const turnBannerLabel = isFinalTurn
        ? 'FINAL TURN'
        : isRevealPending
        ? 'ROUND OVER'
        : isMyTurn ? 'YOUR TURN' : "OPPONENT'S TURN"

    const turnBannerClass = isFinalTurn
        ? 'px-4 py-2 rounded-full font-bold text-sm shadow-md bg-amber-500 text-white animate-pulse'
        : isRevealPending
        ? 'px-4 py-2 rounded-full font-bold text-sm shadow-md bg-emerald-600 text-white'
        : isMyTurn
            ? 'px-4 py-2 rounded-full font-bold text-sm transition-all duration-300 shadow-md bg-[var(--color-primary)] text-white'
            : 'px-4 py-2 rounded-full font-bold text-sm transition-all duration-300 shadow-md bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border)] opacity-80'

    return (
        <div className="h-dvh bg-[var(--color-background)] overflow-hidden relative">
            {/* Header: Absolutely positioned over the game board */}
            <div className="flex justify-between items-center z-30 px-6 absolute top-2 left-0 right-0">
                <div className="flex items-center gap-4">
                    <button onClick={handleLeave} className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] transition-colors flex items-center gap-2 cursor-pointer">
                        ← Leave
                    </button>
                    {(user?.email === 'krishanpatel00@gmail.com' || user?.email === 'jskmeta@gmail.com') && (
                        <button
                            onClick={() => setIsDebugMode(!isDebugMode)}
                            className={isDebugMode ? "text-xs font-bold px-2 py-1 rounded transition-colors bg-red-500 text-white" : "text-xs font-bold px-2 py-1 rounded transition-colors bg-gray-200 text-gray-500 hover:bg-gray-300 focus-visible:ring-2 focus-visible:ring-gray-400"}
                        >
                            DEV
                        </button>
                    )}
                    <button
                        onClick={() => setRulesOpen(true)}
                        className="w-7 h-7 flex items-center justify-center text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)]/80 hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
                        title="How to Play"
                    >
                        ?
                    </button>
                    <button
                        onClick={toggleMute}
                        className="w-7 h-7 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)]/80 hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
                        title={isMuted ? 'Unmute sounds' : 'Mute sounds'}
                    >
                        {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                </div>

                {gameState.status === 'waiting' && shortCode ? (
                    <div className="flex items-center gap-2">
                        <div className="text-xs font-mono font-bold tracking-widest text-[var(--color-text-muted)] bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg">
                            Room: {shortCode}
                        </div>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(shortCode)
                                toast.success('Copied to clipboard!')
                            }}
                            className="p-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]"
                            title="Copy room code"
                        >
                            <Copy className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ) : !isPeekPhase ? (
                    <div className={turnBannerClass}>
                        {turnBannerLabel}
                    </div>
                ) : null}
            </div>

            <GameBoard
                gameState={gameState}
                onDraw={handleDraw}
                onDiscard={handleDiscard}
                onSwap={handleSwap}
                onReady={handleReady}
                onResolvePower={handleResolvePower}
                onFinishPeek={handleFinishPeek}
                onPowerLookSwapDecision={handlePowerLookSwapDecision}
                onSkipPower={handleSkipPower}
                onStack={handleStack}
                onTransfer={handleTransfer}
                onCallReds={handleCallReds}
                highlightedCardIds={highlightedCardIds}
                isDebugMode={isDebugMode}
                onSendEmote={sendEmote}
                opponentActiveEmote={incomingEmote}
                localEmote={localEmote}
                isProcessing={isProcessing}
                revealState={isRevealPending ? {
                    iHaveVoted: iHaveVotedReveal,
                    opponentHasVoted: opponentHasVotedReveal,
                    onVoteReveal: handleVoteReveal,
                } : undefined}
            />

            <RulesModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} />

            {user && (
                <ShowdownOverlay
                    gameState={gameState}
                    currentUserId={user.id}
                    onVoteRematch={handleVoteRematch}
                    onLeave={handleLeave}
                />
            )}

            <Modal isOpen={disconnectOpen} onClose={() => setDisconnectOpen(false)} title="Opponent Disconnected">
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-[var(--color-text-muted)]">
                        Your opponent has disconnected. You can wait for them to rejoin, or return to the lobby.
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setDisconnectOpen(false)}
                            className="flex-1 py-2.5 text-sm font-medium border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
                        >
                            Wait
                        </button>
                        <button
                            onClick={async () => {
                                if (gameId && user?.id) {
                                    await supabase.rpc('player_disconnected', {
                                        p_game_id: gameId,
                                        p_player_id: user.id,
                                    })
                                }
                                navigate('/')
                            }}
                            className="flex-1 py-2.5 text-sm font-medium bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-hover)] transition-colors cursor-pointer"
                        >
                            Return to Lobby
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
