import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { useAuth } from '@/components/AuthProvider'
import { Card } from '@/components/Card'
import { PlayerHand } from '@/components/PlayerHand'
import type { GameState } from '@/lib/game/types'
import type { IncomingEmote } from '@/hooks/useEmotes'
import { cn } from '@/lib/utils'


interface RevealState {
    iHaveVoted: boolean
    opponentHasVoted: boolean
    onVoteReveal: () => void
}

interface GameBoardProps {
    gameState: GameState
    onDraw?: (source: 'deck' | 'discard') => void
    onDiscard?: () => void
    onSwap?: (cardId: string) => void
    onReady?: () => void
    onResolvePower?: (targetCardId: string) => void
    onFinishPeek?: () => void
    onPowerLookSwapDecision?: (action: 'swap' | 'keep') => void
    onSkipPower?: () => void
    onStack?: (handCardId: string, targetDiscardCardId: string) => void
    onTransfer?: (handCardId: string) => void
    onCallReds?: () => void
    highlightedCardIds?: string[]
    isDebugMode?: boolean
    revealState?: RevealState
    onSendEmote?: (emoteId: string) => void
    opponentActiveEmote?: IncomingEmote | null
    localEmote?: IncomingEmote | null
    isProcessing?: boolean
}

export function GameBoard({ gameState, onDraw, onDiscard, onSwap, onReady, onResolvePower, onFinishPeek, onPowerLookSwapDecision, onSkipPower, onStack, onTransfer, onCallReds, highlightedCardIds, isDebugMode = false, revealState, onSendEmote, opponentActiveEmote, localEmote, isProcessing = false }: GameBoardProps) {
    const { user, profile } = useAuth()

    if (!user) {
        console.warn('GameBoard: No user found, rendering null')
        return null
    }

    const currentPlayer = gameState.players[user.id]
        ? { ...gameState.players[user.id], avatar_url: gameState.players[user.id].avatar_url ?? profile?.avatar_url ?? null }
        : undefined
    const opponentId = Object.keys(gameState.players).find(id => id !== user.id)
    const opponent = opponentId ? gameState.players[opponentId] : null

    const topCard = gameState.discardPile[gameState.discardPile.length - 1]

    const isMyTurn = gameState.currentTurnPlayerId === user.id
    const isActionPhase = gameState.turnPhase === 'action'
    const isPeekPhase = gameState.turnPhase === 'peek'
    const isPowerPeekSelfPhase = gameState.turnPhase === 'power_peek_self'
    const isPowerPeekOpponentPhase = gameState.turnPhase === 'power_peek_opponent'
    const isPowerPeekViewingPhase = gameState.turnPhase === 'power_peek_viewing'
    const isPowerBlindSwapPhase = gameState.turnPhase === 'power_blind_swap'
    const isPowerLookSwapPhase = gameState.turnPhase === 'power_look_swap'
    const isPowerLookSwapDecisionPhase = gameState.turnPhase === 'power_look_swap_decision'

    // Visibility Logic:
    // If it's my turn, I see the card.
    // If it's opponent's turn, I only see it if they drew from discard.
    const showDrawnCard = isMyTurn || gameState.drawnCardSource === 'discard'

    // Interaction & Gray-out Logic
    const isPowerActionStep2 = (isPowerBlindSwapPhase || isPowerLookSwapPhase) && !!currentPlayer?.swapSourceCardId

    // Define where the "Viewing" focus is
    const viewingOwnCard = isPowerPeekViewingPhase && !!currentPlayer?.viewingCardId && currentPlayer.hand.some(c => c && c.id === currentPlayer.viewingCardId)
    const viewingOpponentCard = isPowerPeekViewingPhase && !!currentPlayer?.viewingCardId && !viewingOwnCard

    const isStackTransferPhase = !!gameState.pendingStackTransfer
    const amITransferring = isStackTransferPhase && gameState.pendingStackTransfer?.playerId === currentPlayer?.id
    const opponentIsTransferring = isStackTransferPhase && gameState.pendingStackTransfer?.playerId === opponent?.id

    const isOpponentHandInteractive = !isStackTransferPhase && (
        !!topCard || (isMyTurn && (
            isPowerPeekOpponentPhase ||
            isPowerActionStep2 ||
            viewingOpponentCard ||
            isPowerLookSwapDecisionPhase
        ))
    )

    const isMyHandInteractive = amITransferring || (!isStackTransferPhase && (
        !!topCard || isPeekPhase || (isMyTurn && (
            (!isPowerPeekOpponentPhase && (!isPowerPeekViewingPhase || viewingOwnCard) && !isPowerActionStep2) ||
            isPowerLookSwapDecisionPhase
        ))
    ))

    // Can draw from deck/discard?
    const canDraw = !isStackTransferPhase && isMyTurn && !isActionPhase && !isPeekPhase && !isPowerPeekSelfPhase && !isPowerPeekOpponentPhase && !isPowerPeekViewingPhase && !isPowerBlindSwapPhase && !isPowerLookSwapPhase && !isPowerLookSwapDecisionPhase

    const canCallReds = !isStackTransferPhase && isMyTurn && gameState.turnPhase === 'draw' && gameState.status === 'playing'
    const showReadyBadge = gameState.status === 'preview' || gameState.turnPhase === 'peek'

    // Centralized action prompt
    let actionPromptText: string | null = null
    let actionPromptColor = ''
    let hasSkipButton = false
    let viewingConfirmButton = false
    let lookSwapDecisionButtons = false

    if (currentPlayer) {
        if (isPeekPhase && !currentPlayer.isReady) {
            actionPromptText = 'Peek at your bottom 2 cards!'
            actionPromptColor = 'bg-[var(--color-surface)]/90 backdrop-blur-md border-[var(--color-border)] text-[var(--color-primary)]'
        } else if (isPowerPeekSelfPhase && isMyTurn) {
            actionPromptText = 'Choose one of your cards to peek at!'
            actionPromptColor = 'bg-purple-950/70 backdrop-blur-md border-purple-400/40 text-purple-100'
        } else if (isPowerPeekOpponentPhase && isMyTurn) {
            actionPromptText = "Choose an opponent's card to peek at!"
            actionPromptColor = 'bg-blue-950/70 backdrop-blur-md border-blue-400/40 text-blue-100'
        } else if (isPowerBlindSwapPhase && isMyTurn) {
            actionPromptText = currentPlayer.swapSourceCardId
                ? "Now choose an opponent's card to swap!"
                : 'Choose one of your cards to swap!'
            actionPromptColor = 'bg-orange-950/70 backdrop-blur-md border-orange-400/40 text-orange-100'
            hasSkipButton = !currentPlayer.swapSourceCardId
        } else if (isPowerLookSwapPhase && isMyTurn) {
            actionPromptText = currentPlayer.swapSourceCardId
                ? "Now choose an opponent's card to look at!"
                : 'Choose one of your cards to look at!'
            actionPromptColor = 'bg-indigo-950/70 backdrop-blur-md border-indigo-400/40 text-indigo-100'
        } else if (isPowerPeekViewingPhase && isMyTurn) {
            actionPromptText = 'Memorize this card!'
            actionPromptColor = 'bg-amber-950/70 backdrop-blur-md border-amber-400/40 text-amber-100'
            viewingConfirmButton = true
        } else if (isPowerLookSwapDecisionPhase && isMyTurn) {
            actionPromptText = 'Swap these cards?'
            actionPromptColor = 'bg-indigo-950/70 backdrop-blur-md border-indigo-400/40 text-indigo-100'
            lookSwapDecisionButtons = true
        } else if (amITransferring) {
            actionPromptText = 'Choose a card to give to the opponent!'
            actionPromptColor = 'bg-red-950/70 backdrop-blur-md border-red-400/40 text-red-100'
        } else if (opponentIsTransferring) {
            actionPromptText = 'Opponent is choosing a card to give you...'
            actionPromptColor = 'bg-stone-900/70 backdrop-blur-md border-stone-400/40 text-stone-200'
        }
    }

    return (
        <LayoutGroup id="game-board">
        <div className={cn("card-game h-full grid grid-rows-[1fr_minmax(200px,auto)_1fr] p-2 sm:p-4 relative", isProcessing && "pointer-events-none opacity-70")}>
            {/* Call REDS — ghost button, bottom-right of board */}
            {canCallReds && (
                <button
                    onClick={() => onCallReds?.()}
                    className="absolute bottom-4 right-4 z-30 cursor-pointer bg-red-500/10 text-red-700 border border-red-500/30 backdrop-blur-md hover:bg-red-500/20 shadow-sm px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors"
                >
                    Call REDS
                </button>
            )}

            {/* Centralized Action Prompt — absolutely centered on the board */}
            {actionPromptText && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-3 pointer-events-none">
                    <div className={cn('px-5 py-2 rounded-full border shadow-lg text-sm font-bold whitespace-nowrap', actionPromptColor)}>
                        {actionPromptText}
                    </div>
                    {hasSkipButton && onSkipPower && (
                        <button
                            onClick={() => onSkipPower()}
                            className="pointer-events-auto bg-slate-700/80 text-white hover:bg-slate-600 backdrop-blur-sm border border-slate-500 px-3 py-1 rounded-full text-xs font-bold transition-colors shadow-sm"
                        >
                            Skip Power
                        </button>
                    )}
                    {viewingConfirmButton && (
                        <button
                            onClick={() => onFinishPeek?.()}
                            className="pointer-events-auto bg-emerald-500 text-white px-6 py-2 rounded-full font-bold shadow-lg hover:scale-105 focus-visible:ring-2 focus-visible:ring-emerald-400 transition-transform"
                        >
                            Done
                        </button>
                    )}
                    {lookSwapDecisionButtons && (
                        <div className="pointer-events-auto flex gap-4">
                            <button
                                onClick={() => onPowerLookSwapDecision?.('keep')}
                                className="bg-gray-500 text-white px-6 py-2 rounded-full font-bold shadow-lg hover:scale-105 focus-visible:ring-2 focus-visible:ring-gray-400 transition-transform"
                            >
                                Keep Mine
                            </button>
                            <button
                                onClick={() => onPowerLookSwapDecision?.('swap')}
                                className="bg-emerald-500 text-white px-6 py-2 rounded-full font-bold shadow-lg hover:scale-105 focus-visible:ring-2 focus-visible:ring-emerald-400 transition-transform"
                            >
                                Swap
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ═══════════════════════════════════════════ */}
            {/* TOP ZONE — Opponent Hand                   */}
            {/* ═══════════════════════════════════════════ */}
            <div className="flex items-center justify-center pt-10 pb-2 relative">
                {opponent ? (
                    <PlayerHand
                        player={opponent}
                        isCurrentUser={false}
                        isInteractive={isOpponentHandInteractive}
                        activeEmote={opponentActiveEmote}
                        onCardClick={(card) => {
                            if (isStackTransferPhase) return;
                            if (isMyTurn && isPowerPeekOpponentPhase) {
                                onResolvePower?.(card.id)
                            } else if (isMyTurn && isPowerActionStep2) {
                                onResolvePower?.(card.id)
                            } else if (topCard && !isPeekPhase && !isPowerPeekViewingPhase && !isPowerLookSwapDecisionPhase) {
                                onStack?.(card.id, topCard.id)
                            }
                        }}
                        className={!isOpponentHandInteractive ? "pointer-events-none" : ""}
                        selectedCardId={(isPowerBlindSwapPhase || isPowerLookSwapPhase || isPowerLookSwapDecisionPhase) ? opponent?.swapSourceCardId : undefined}
                        viewingCardId={currentPlayer?.viewingCardId}
                        revealViewedCard={!!currentPlayer?.viewingCardId}
                        highlightedCardIds={highlightedCardIds}
                        beingViewedCardIds={[opponent?.viewingCardId, isPowerLookSwapDecisionPhase ? opponent?.swapSourceCardId : null]}
                        isDebug={isDebugMode}
                        showReadyBadge={showReadyBadge}
                    />
                ) : (
                    <div className="text-[var(--color-text-muted)] animate-pulse text-sm">
                        Waiting for opponent...
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/* CENTER ZONE — Action Area (Deck + Discard) */}
            {/* ═══════════════════════════════════════════ */}
            <div className="relative flex items-center justify-center gap-8 sm:gap-12 md:gap-24 z-10 pointer-events-none">

                {/* Draw Pile (Left) */}
                <div
                    onClick={() => canDraw && onDraw?.('deck')}
                    className={cn(
                        "relative group transition-transform pointer-events-auto",
                        canDraw ? "cursor-pointer hover:scale-105" : "cursor-not-allowed opacity-80"
                    )}
                >
                    <div className="h-[var(--card-h)] aspect-[2/3] bg-[var(--color-primary)] rounded-xl border-2 border-white/10 shadow-lg flex items-center justify-center">
                        <span className="text-white font-bold text-lg sm:text-xl">{gameState.deck.length}</span>
                    </div>
                    {/* Stack effect */}
                    <div className="absolute top-1 left-1 h-[var(--card-h)] aspect-[2/3] bg-[var(--color-primary)] rounded-xl -z-10 border-2 border-white/10"></div>
                    <div className="absolute top-2 left-2 h-[var(--card-h)] aspect-[2/3] bg-[var(--color-primary)] rounded-xl -z-20 border-2 border-white/10"></div>
                    <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                        Deck
                    </div>
                </div>

                {/* Drawn Card (Center - absolute overlay) */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-auto">
                {gameState.drawnCard && currentPlayer && !isPeekPhase && (
                    <motion.div
                        className="flex flex-col items-center gap-2"
                        initial={{ x: -150, scale: 0.5, opacity: 0 }}
                        animate={{ x: 0, scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 150, damping: 20 }}
                    >
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-background)]/80 px-2 py-1 rounded-md backdrop-blur-sm shadow-sm">
                            {isMyTurn ? "Current Draw" : "Opponent Drew"}
                        </span>
                        <div className="flex flex-col items-center gap-2 bg-[var(--color-surface)]/90 p-2 rounded-xl backdrop-blur-sm border border-[var(--color-border)] shadow-2xl ring-1 ring-black/5">
                            <motion.div
                                initial={{ rotateY: 180 }}
                                animate={{ rotateY: 0 }}
                                transition={{ duration: 0.6 }}
                            >
                                <Card
                                    card={{ ...gameState.drawnCard, isFaceUp: showDrawnCard }}
                                    className="shadow-md"
                                />
                            </motion.div>

                            {/* Power Hint */}
                            {isMyTurn && gameState.drawnCard && gameState.drawnCardSource === 'deck' && ['7', '8', '9', '10'].includes(gameState.drawnCard.rank) && (
                                <div className="absolute -right-32 top-1/2 -translate-y-1/2 w-28 bg-black/75 text-white text-[10px] p-2 rounded-lg backdrop-blur-sm pointer-events-none animate-in fade-in slide-in-from-left-2">
                                    <p className="font-bold mb-1 text-yellow-400">Power Card!</p>
                                    {gameState.drawnCard.rank === '7' && "Discard to PEEK at one of your own cards."}
                                    {gameState.drawnCard.rank === '8' && "Discard to PEEK at an opponent's card."}
                                    {gameState.drawnCard.rank === '9' && "Blind Swap: Swap any one of your cards with an opponent's card without looking."}
                                    {gameState.drawnCard.rank === '10' && "Look & Swap: See one of your cards and one opponent card, then decide if you want to swap."}
                                </div>
                            )}

                            {isMyTurn && !isPowerPeekSelfPhase && !isPowerPeekOpponentPhase && !isPowerPeekViewingPhase && !isPowerBlindSwapPhase && !isPowerLookSwapPhase && !isPowerLookSwapDecisionPhase && (
                                <div className="flex flex-col gap-1 w-full">
                                    <button
                                        onClick={() => onDiscard?.()}
                                        className="bg-red-100 text-red-700 px-2 py-1.5 rounded-md hover:bg-red-200 focus-visible:ring-2 focus-visible:ring-red-400 transition-colors font-bold text-[10px] w-full uppercase tracking-wide"
                                    >
                                        Discard
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
                </div>

                {/* Discard Pile (Right) */}
                <div
                    onClick={() => canDraw && onDraw?.('discard')}
                    className={cn(
                        "relative h-[var(--card-h)] aspect-[2/3] transition-transform pointer-events-auto",
                        canDraw ? "cursor-pointer hover:scale-105" : "cursor-not-allowed"
                    )}
                >
                    {/* Foundation — always rendered so the pile never flickers away during card transitions */}
                    <div className="absolute inset-0 border-2 border-dashed border-[var(--color-border)] rounded-xl flex items-center justify-center text-[var(--color-text-muted)] text-xs sm:text-sm bg-[var(--color-surface)]/30">
                        {!topCard && 'Empty'}
                    </div>
                    <AnimatePresence>
                    {topCard && (
                        <motion.div key={topCard.id} className="absolute inset-0 z-10">
                            <Card
                                card={{ ...topCard, isFaceUp: true }}
                            />
                        </motion.div>
                    )}
                    </AnimatePresence>
                    <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                        Discard
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════ */}
            {/* BOTTOM ZONE — Player Hand                  */}
            {/* ═══════════════════════════════════════════ */}
            <div className="flex flex-col items-center justify-center pb-2 relative">
                {revealState && (
                    <div className="flex flex-col items-center gap-1.5 mb-3">
                        {revealState.opponentHasVoted && !revealState.iHaveVoted && (
                            <p className="text-xs font-semibold text-red-700">
                                Opponent is ready to reveal!
                            </p>
                        )}
                        {revealState.iHaveVoted ? (
                            <div className="px-6 py-2.5 rounded-xl font-bold text-sm uppercase tracking-wide text-stone-400 bg-stone-900/80 border border-stone-700 select-none">
                                Waiting for opponent…
                            </div>
                        ) : (
                            <button
                                onClick={revealState.onVoteReveal}
                                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm uppercase tracking-wide animate-pulse shadow-lg cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-400 transition-colors"
                            >
                                Reveal Cards
                            </button>
                        )}
                    </div>
                )}
                {currentPlayer && (
                    <div className="flex flex-col items-center gap-3 relative">
                        <PlayerHand
                            player={currentPlayer}
                            isCurrentUser={true}
                            onSendEmote={onSendEmote}
                            localEmote={localEmote}
                            onCardClick={(card) => {
                                if (amITransferring) {
                                    onTransfer?.(card.id)
                                    return
                                }
                                if (isStackTransferPhase) return;

                                if (gameState.drawnCard && isMyTurn && !isPeekPhase && !isPowerPeekSelfPhase && !isPowerPeekOpponentPhase && !isPowerPeekViewingPhase && !isPowerBlindSwapPhase && !isPowerLookSwapPhase && !isPowerLookSwapDecisionPhase) {
                                    onSwap?.(card.id)
                                } else if ((isPowerPeekSelfPhase || isPowerBlindSwapPhase || isPowerLookSwapPhase) && isMyTurn) {
                                    onResolvePower?.(card.id)
                                } else if (topCard && !isPeekPhase && !isPowerPeekViewingPhase && !isPowerLookSwapDecisionPhase) {
                                    // Try to stack if not doing another action
                                    onStack?.(card.id, topCard.id)
                                }
                            }}
                            selectedCardId={isPowerBlindSwapPhase || isPowerLookSwapPhase || isPowerLookSwapDecisionPhase ? currentPlayer.swapSourceCardId : undefined}
                            // Gray out logic restored:
                            className={!isMyHandInteractive ? "pointer-events-none" : ""}
                            overrideFaceUp={isPeekPhase ? [2, 3] : undefined}
                            viewingCardId={isPowerLookSwapDecisionPhase ? currentPlayer.swapSourceCardId : currentPlayer.viewingCardId}
                            // If opponent is viewing one of MY cards, show it as being viewed
                            highlightedCardIds={highlightedCardIds}
                            beingViewedCardId={opponent?.viewingCardId}
                            isDebug={isDebugMode}
                            showReadyBadge={showReadyBadge}
                        />

                        {isPeekPhase && !currentPlayer.isReady && (
                            <button
                                onClick={() => onReady?.()}
                                className="bg-[var(--color-primary)] text-white px-6 py-2 rounded-xl font-bold text-sm shadow-lg hover:scale-105 focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] transition-transform animate-in fade-in slide-in-from-bottom-4"
                            >
                                Ready
                            </button>
                        )}

                        {isPeekPhase && currentPlayer.isReady && (
                            <div className="text-[var(--color-text-muted)] animate-pulse font-medium text-xs">
                                Waiting...
                            </div>
                        )}

                    </div>
                )}
            </div>
        </div>
        </LayoutGroup>
    )
}
