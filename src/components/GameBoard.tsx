import { useAuth } from '@/components/AuthProvider'
import { Card } from '@/components/Card'
import { PlayerHand } from '@/components/PlayerHand'
import type { GameState } from '@/lib/game/types'
import { cn } from '@/lib/utils'


interface GameBoardProps {
    gameState: GameState
    onDraw?: (source: 'deck' | 'discard') => void
    onDiscard?: () => void
    onSwap?: (cardId: string) => void
    onReady?: () => void
    onResolvePower?: (targetCardId: string) => void
    onFinishPeek?: () => void
    onPowerLookSwapDecision?: (action: 'swap' | 'keep') => void
}

export function GameBoard({ gameState, onDraw, onDiscard, onSwap, onReady, onResolvePower, onFinishPeek, onPowerLookSwapDecision }: GameBoardProps) {
    const { user } = useAuth()

    if (!user) {
        console.warn('GameBoard: No user found, rendering null')
        return null
    }

    const currentPlayer = gameState.players[user.id]
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

    return (
        <div className="flex flex-col h-screen w-full max-w-6xl mx-auto p-2 gap-2 overflow-hidden relative">
            {/* Header: Leave Game & Turn Info */}
            <div className="flex justify-between items-center z-20 px-2">
                <a href="/" className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] transition-colors flex items-center gap-2">
                    ← Leave
                </a>

                {!isPeekPhase && (
                    <div className={cn(
                        "px-3 py-1 rounded-full font-bold text-xs transition-all duration-300",
                        isMyTurn
                            ? "bg-[var(--color-primary)] text-white"
                            : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                    )}>
                        {isMyTurn ? "YOUR TURN" : "OPPONENT'S TURN"}
                    </div>
                )}
            </div>

            {/* Opponent Area (Top) */}
            <div className="flex-1 flex items-end justify-center rotate-180 min-h-0 pb-4 relative">
                {(isPowerPeekOpponentPhase || (isPowerBlindSwapPhase && currentPlayer.swapSourceCardId) || (isPowerLookSwapPhase && currentPlayer.swapSourceCardId)) && isMyTurn && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-max animate-bounce rotate-180">
                        <div className="bg-blue-100 border border-blue-300 px-4 py-1.5 rounded-full shadow-lg text-xs font-bold text-blue-700">
                            {isPowerBlindSwapPhase ? "Choose card to swap!" : isPowerLookSwapPhase ? "Choose card to look at!" : "Peek opponent's card!"}
                        </div>
                        <div className="w-2 h-2 bg-blue-100 border-b border-r border-blue-300 absolute left-1/2 -bottom-1 -translate-x-1/2 rotate-45"></div>
                    </div>
                )}

                {opponent ? (
                    <PlayerHand
                        player={opponent}
                        isCurrentUser={false}
                        onCardClick={(card) => {
                            if ((isPowerPeekOpponentPhase || isPowerBlindSwapPhase || isPowerLookSwapPhase) && isMyTurn) {
                                onResolvePower?.(card.id)
                            }
                        }}
                        className={isMyTurn && !isPeekPhase && !isPowerPeekSelfPhase && !isPowerPeekOpponentPhase && !isPowerPeekViewingPhase && !isPowerBlindSwapPhase && !isPowerLookSwapPhase && !isPowerLookSwapDecisionPhase ? "opacity-50 transition-opacity" : ""}
                        cardClassName="w-16 h-24 sm:w-20 sm:h-32 md:w-24 md:h-36 lg:w-28 lg:h-40"
                        viewingCardId={isPowerPeekViewingPhase || isPowerLookSwapDecisionPhase ? currentPlayer?.viewingCardId : undefined}
                        beingViewedCardId={opponent?.viewingCardId}
                    />
                ) : (
                    <div className="text-[var(--color-text-muted)] animate-pulse rotate-180 text-sm">
                        Waiting...
                    </div>
                )}
            </div>

            {/* Center Area (Decks & Drawn Card) */}
            <div className="flex-none flex items-center justify-between px-8 sm:px-16 md:px-32 py-2 relative w-full z-10 max-w-4xl mx-auto">

                {/* Draw Pile (Left) */}
                <div
                    onClick={() => isMyTurn && !isActionPhase && !isPeekPhase && !isPowerPeekSelfPhase && !isPowerPeekOpponentPhase && !isPowerPeekViewingPhase && !isPowerBlindSwapPhase && !isPowerLookSwapPhase && !isPowerLookSwapDecisionPhase && onDraw?.('deck')}
                    className={cn(
                        "relative group transition-transform",
                        isMyTurn && !isActionPhase && !isPeekPhase && !isPowerPeekSelfPhase && !isPowerPeekOpponentPhase && !isPowerPeekViewingPhase && !isPowerBlindSwapPhase && !isPowerLookSwapPhase && !isPowerLookSwapDecisionPhase ? "cursor-pointer hover:scale-105" : "cursor-not-allowed opacity-80"
                    )}
                >
                    <div className="w-16 h-24 sm:w-20 sm:h-32 md:w-24 md:h-36 lg:w-28 lg:h-40 bg-[var(--color-primary)] rounded-xl border-2 border-white/10 shadow-lg flex items-center justify-center">
                        <span className="text-white font-bold text-lg sm:text-xl">{gameState.deck.length}</span>
                    </div>
                    {/* Stack effect */}
                    <div className="absolute top-1 left-1 w-16 h-24 sm:w-20 sm:h-32 md:w-24 md:h-36 lg:w-28 lg:h-40 bg-[var(--color-primary)] rounded-xl -z-10 border-2 border-white/10"></div>
                    <div className="absolute top-2 left-2 w-16 h-24 sm:w-20 sm:h-32 md:w-24 md:h-36 lg:w-28 lg:h-40 bg-[var(--color-primary)] rounded-xl -z-20 border-2 border-white/10"></div>
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                        Deck
                    </div>
                </div>

                {/* Drawn Card (Center) */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                    {gameState.drawnCard && currentPlayer && !isPeekPhase && (
                        <div className="flex flex-col items-center gap-2 animate-in zoom-in-90 fade-in duration-300">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-background)]/80 px-2 py-1 rounded-md backdrop-blur-sm shadow-sm">
                                {isMyTurn ? "Current Draw" : "Opponent Drew"}
                            </span>
                            <div className="flex flex-col items-center gap-2 bg-[var(--color-surface)]/90 p-2 rounded-xl backdrop-blur-sm border border-[var(--color-border)] shadow-2xl ring-1 ring-black/5">
                                <Card
                                    card={{ ...gameState.drawnCard, isFaceUp: showDrawnCard }}
                                    className="w-16 h-24 sm:w-20 sm:h-32 md:w-24 md:h-36 lg:w-28 lg:h-40 shadow-md"
                                />

                                {/* Power Hint */}
                                {isMyTurn && gameState.drawnCard && ['7', '8', '9', '10'].includes(gameState.drawnCard.rank) && (
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
                                            className="bg-red-100 text-red-700 px-2 py-1.5 rounded-md hover:bg-red-200 transition-colors font-bold text-[10px] w-full uppercase tracking-wide"
                                        >
                                            Discard
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Discard Pile (Right) */}
                <div
                    onClick={() => isMyTurn && !isActionPhase && !isPeekPhase && !isPowerPeekSelfPhase && !isPowerPeekOpponentPhase && !isPowerPeekViewingPhase && !isPowerBlindSwapPhase && !isPowerLookSwapPhase && !isPowerLookSwapDecisionPhase && onDraw?.('discard')}
                    className={cn(
                        "relative transition-transform",
                        isMyTurn && !isActionPhase && !isPeekPhase && !isPowerPeekSelfPhase && !isPowerPeekOpponentPhase && !isPowerPeekViewingPhase && !isPowerBlindSwapPhase && !isPowerLookSwapPhase && !isPowerLookSwapDecisionPhase ? "cursor-pointer hover:scale-105" : "cursor-not-allowed"
                    )}
                >
                    {topCard ? (
                        <Card
                            card={{ ...topCard, isFaceUp: true }}
                            className="w-16 h-24 sm:w-20 sm:h-32 md:w-24 md:h-36 lg:w-28 lg:h-40"
                        />
                    ) : (
                        <div className="w-16 h-24 sm:w-20 sm:h-32 md:w-24 md:h-36 lg:w-28 lg:h-40 border-2 border-dashed border-[var(--color-border)] rounded-xl flex items-center justify-center text-[var(--color-text-muted)] text-xs sm:text-sm bg-[var(--color-surface)]/30">
                            Empty
                        </div>
                    )}
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                        Discard
                    </div>
                </div>
            </div>

            {/* Player Area (Bottom) */}
            <div className="flex-1 flex flex-col items-center justify-end gap-2 min-h-0 relative pb-4">
                {currentPlayer && (
                    <div className="flex flex-col items-center gap-2 relative">
                        {/* Peek Message - Positioned relative to hand */}
                        {isPeekPhase && !currentPlayer.isReady && (
                            <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-30 w-max animate-bounce">
                                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] px-4 py-1.5 rounded-full shadow-lg text-xs font-bold text-[var(--color-primary)]">
                                    Peek bottom 2!
                                </div>
                                <div className="w-2 h-2 bg-[var(--color-surface)] border-b border-r border-[var(--color-border)] absolute left-1/2 -bottom-1 -translate-x-1/2 rotate-45"></div>
                            </div>
                        )}

                        {/* Power Peek Message */}
                        {isPowerPeekSelfPhase && isMyTurn && (
                            <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-30 w-max animate-bounce">
                                <div className="bg-purple-100 border border-purple-300 px-4 py-1.5 rounded-full shadow-lg text-xs font-bold text-purple-700">
                                    Choose a card to peek!
                                </div>
                                <div className="w-2 h-2 bg-purple-100 border-b border-r border-purple-300 absolute left-1/2 -bottom-1 -translate-x-1/2 rotate-45"></div>
                            </div>
                        )}

                        {/* Power Blind Swap Message */}
                        {isPowerBlindSwapPhase && isMyTurn && (
                            <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-30 w-max animate-bounce">
                                <div className="bg-orange-100 border border-orange-300 px-4 py-1.5 rounded-full shadow-lg text-xs font-bold text-orange-700">
                                    {currentPlayer.swapSourceCardId
                                        ? "Now choose an opponent's card to swap!"
                                        : "Choose one of your cards to swap!"}
                                </div>
                                <div className="w-2 h-2 bg-orange-100 border-b border-r border-orange-300 absolute left-1/2 -bottom-1 -translate-x-1/2 rotate-45"></div>
                            </div>
                        )}

                        {/* Power Look & Swap Message */}
                        {isPowerLookSwapPhase && isMyTurn && (
                            <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-30 w-max animate-bounce">
                                <div className="bg-indigo-100 border border-indigo-300 px-4 py-1.5 rounded-full shadow-lg text-xs font-bold text-indigo-700">
                                    {currentPlayer.swapSourceCardId
                                        ? "Now choose an opponent's card to look at!"
                                        : "Choose one of your cards to look at!"}
                                </div>
                                <div className="w-2 h-2 bg-indigo-100 border-b border-r border-indigo-300 absolute left-1/2 -bottom-1 -translate-x-1/2 rotate-45"></div>
                            </div>
                        )}

                        {/* Viewing Confirmation */}
                        {isPowerPeekViewingPhase && isMyTurn && (
                            <div className="absolute -top-20 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2">
                                <div className="bg-yellow-100 border border-yellow-300 px-4 py-2 rounded-xl shadow-lg text-sm font-bold text-yellow-800 text-center">
                                    Memorize this card!
                                </div>
                                <button
                                    onClick={() => onFinishPeek?.()}
                                    className="bg-emerald-500 text-white px-6 py-2 rounded-full font-bold shadow-lg hover:scale-105 transition-transform"
                                >
                                    Done
                                </button>
                            </div>
                        )}

                        {/* Look & Swap Decision */}
                        {isPowerLookSwapDecisionPhase && isMyTurn && (
                            <div className="absolute -top-24 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 w-max">
                                <div className="bg-indigo-100 border border-indigo-300 px-4 py-2 rounded-xl shadow-lg text-sm font-bold text-indigo-800 text-center mb-2">
                                    Swap these cards?
                                </div>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => onPowerLookSwapDecision?.('keep')}
                                        className="bg-gray-500 text-white px-6 py-2 rounded-full font-bold shadow-lg hover:scale-105 transition-transform"
                                    >
                                        Keep Mine
                                    </button>
                                    <button
                                        onClick={() => onPowerLookSwapDecision?.('swap')}
                                        className="bg-emerald-500 text-white px-6 py-2 rounded-full font-bold shadow-lg hover:scale-105 transition-transform"
                                    >
                                        Swap
                                    </button>
                                </div>
                            </div>
                        )}

                        <PlayerHand
                            player={currentPlayer}
                            isCurrentUser={true}
                            onCardClick={(card) => {
                                if (gameState.drawnCard && isMyTurn && !isPeekPhase && !isPowerPeekSelfPhase && !isPowerPeekOpponentPhase && !isPowerPeekViewingPhase && !isPowerBlindSwapPhase && !isPowerLookSwapPhase && !isPowerLookSwapDecisionPhase) {
                                    onSwap?.(card.id)
                                } else if ((isPowerPeekSelfPhase || isPowerBlindSwapPhase || isPowerLookSwapPhase) && isMyTurn) {
                                    onResolvePower?.(card.id)
                                }
                            }}
                            selectedCardId={isPowerBlindSwapPhase || isPowerLookSwapPhase || isPowerLookSwapDecisionPhase ? currentPlayer.swapSourceCardId : undefined}
                            // Gray out if:
                            // 1. Not my turn (standard)
                            // 2. Peek phase (standard)
                            // 3. Power Peek Opponent phase (I should be looking at opponent's hand, not mine)
                            // 4. Power Peek Viewing phase (I am looking at a specific card)
                            // 5. Power Blind Swap (Step 2): If I have selected my card, I should be looking at opponent's hand
                            // 6. Power Look Swap (Step 2): If I have selected my card, I should be looking at opponent's hand
                            // 7. Power Look Swap Decision: I am viewing both, so don't gray out
                            className={!isMyTurn && !isPeekPhase && !isPowerPeekSelfPhase && !isPowerPeekOpponentPhase && !isPowerPeekViewingPhase && !isPowerBlindSwapPhase && !isPowerLookSwapPhase && !isPowerLookSwapDecisionPhase ? "opacity-75" :
                                (isPowerPeekOpponentPhase && isMyTurn) || ((isPowerBlindSwapPhase || isPowerLookSwapPhase) && isMyTurn && currentPlayer.swapSourceCardId) ? "opacity-50 transition-opacity" : ""}
                            overrideFaceUp={isPeekPhase ? [2, 3] : undefined}
                            cardClassName="w-16 h-24 sm:w-20 sm:h-32 md:w-24 md:h-36 lg:w-28 lg:h-40"
                            viewingCardId={isPowerPeekViewingPhase || isPowerLookSwapDecisionPhase ? currentPlayer?.viewingCardId : undefined}
                            // If opponent is viewing one of MY cards, show it as being viewed
                            beingViewedCardId={opponent?.viewingCardId}
                        />

                        {isPeekPhase && !currentPlayer.isReady && (
                            <button
                                onClick={() => onReady?.()}
                                className="bg-[var(--color-primary)] text-white px-6 py-2 rounded-xl font-bold text-sm shadow-lg hover:scale-105 transition-transform animate-in fade-in slide-in-from-bottom-4"
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
    )
}
