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
}

export function GameBoard({ gameState, onDraw, onDiscard, onSwap, onReady }: GameBoardProps) {
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
            <div className="flex-1 flex items-end justify-center rotate-180 min-h-0 pb-4">
                {opponent ? (
                    <PlayerHand
                        player={opponent}
                        isCurrentUser={false}
                        className={isMyTurn && !isPeekPhase ? "opacity-50 transition-opacity" : ""}
                        cardClassName="w-14 h-20 sm:w-16 sm:h-24 md:w-20 md:h-32 lg:w-24 lg:h-36"
                    />
                ) : (
                    <div className="text-[var(--color-text-muted)] animate-pulse rotate-180 text-sm">
                        Waiting...
                    </div>
                )}
            </div>

            {/* Center Area (Decks & Drawn Card) */}
            <div className="flex-none flex items-center justify-center gap-4 sm:gap-8 md:gap-16 py-2 relative w-full z-10">
                {/* Drawn Card (Side Display) */}
                {gameState.drawnCard && currentPlayer && !isPeekPhase && (
                    <div className="absolute left-2 lg:left-12 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 animate-in slide-in-from-left-10 fade-in duration-300 z-20">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-background)]/80 px-2 py-1 rounded-md backdrop-blur-sm">
                            {isMyTurn ? "Draw" : "Opp."}
                        </span>
                        <div className="flex flex-col items-center gap-2 bg-[var(--color-surface)]/90 p-2 rounded-xl backdrop-blur-sm border border-[var(--color-border)] shadow-xl">
                            <Card
                                card={{ ...gameState.drawnCard, isFaceUp: showDrawnCard }}
                                className="w-14 h-20 sm:w-16 sm:h-24 md:w-20 md:h-32 lg:w-24 lg:h-36"
                            />

                            {isMyTurn && (
                                <div className="flex flex-col gap-1 w-full">
                                    <button
                                        onClick={() => onDiscard?.()}
                                        className="bg-red-100 text-red-700 px-2 py-1 rounded-md hover:bg-red-200 transition-colors font-medium text-[10px] w-full"
                                    >
                                        Discard
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Draw Pile */}
                <div
                    onClick={() => isMyTurn && !isActionPhase && !isPeekPhase && onDraw?.('deck')}
                    className={cn(
                        "relative group transition-transform",
                        isMyTurn && !isActionPhase && !isPeekPhase ? "cursor-pointer hover:scale-105" : "cursor-not-allowed opacity-80"
                    )}
                >
                    <div className="w-14 h-20 sm:w-16 sm:h-24 md:w-20 md:h-32 lg:w-24 lg:h-36 bg-[var(--color-primary)] rounded-xl border-2 border-white/10 shadow-lg flex items-center justify-center">
                        <span className="text-white font-bold text-lg sm:text-xl">{gameState.deck.length}</span>
                    </div>
                    {/* Stack effect */}
                    <div className="absolute top-1 left-1 w-14 h-20 sm:w-16 sm:h-24 md:w-20 md:h-32 lg:w-24 lg:h-36 bg-[var(--color-primary)] rounded-xl -z-10 border-2 border-white/10"></div>
                    <div className="absolute top-2 left-2 w-14 h-20 sm:w-16 sm:h-24 md:w-20 md:h-32 lg:w-24 lg:h-36 bg-[var(--color-primary)] rounded-xl -z-20 border-2 border-white/10"></div>
                </div>

                {/* Discard Pile */}
                <div
                    onClick={() => isMyTurn && !isActionPhase && !isPeekPhase && onDraw?.('discard')}
                    className={cn(
                        "relative transition-transform",
                        isMyTurn && !isActionPhase && !isPeekPhase ? "cursor-pointer hover:scale-105" : "cursor-not-allowed"
                    )}
                >
                    {topCard ? (
                        <Card
                            card={{ ...topCard, isFaceUp: true }}
                            className="w-14 h-20 sm:w-16 sm:h-24 md:w-20 md:h-32 lg:w-24 lg:h-36"
                        />
                    ) : (
                        <div className="w-14 h-20 sm:w-16 sm:h-24 md:w-20 md:h-32 lg:w-24 lg:h-36 border-2 border-dashed border-[var(--color-border)] rounded-xl flex items-center justify-center text-[var(--color-text-muted)] text-xs sm:text-sm">
                            Discard
                        </div>
                    )}
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

                        <PlayerHand
                            player={currentPlayer}
                            isCurrentUser={true}
                            onCardClick={(card) => {
                                if (gameState.drawnCard && isMyTurn && !isPeekPhase) {
                                    onSwap?.(card.id)
                                }
                            }}
                            className={!isMyTurn && !isPeekPhase ? "opacity-75" : ""}
                            overrideFaceUp={isPeekPhase ? [2, 3] : undefined}
                            cardClassName="w-14 h-20 sm:w-16 sm:h-24 md:w-20 md:h-32 lg:w-24 lg:h-36"
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
