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
        <div className="flex flex-col h-screen w-full max-w-6xl mx-auto p-4 gap-4 overflow-hidden relative">
            {/* Header: Leave Game & Turn Info */}
            <div className="flex justify-between items-center z-20">
                <a href="/" className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] transition-colors flex items-center gap-2">
                    ← Leave Game
                </a>

                {!isPeekPhase && (
                    <div className={cn(
                        "px-4 py-1.5 rounded-full font-bold text-sm transition-all duration-300",
                        isMyTurn
                            ? "bg-[var(--color-primary)] text-white"
                            : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                    )}>
                        {isMyTurn ? "YOUR TURN" : "OPPONENT'S TURN"}
                    </div>
                )}
            </div>

            {/* Opponent Area (Top) */}
            <div className="flex-1 flex items-start justify-center rotate-180 min-h-0">
                {opponent ? (
                    <PlayerHand
                        player={opponent}
                        isCurrentUser={false}
                        className={isMyTurn && !isPeekPhase ? "opacity-50 transition-opacity" : ""}
                    />
                ) : (
                    <div className="text-[var(--color-text-muted)] animate-pulse rotate-180">
                        Waiting for opponent...
                    </div>
                )}
            </div>

            {/* Center Area (Decks & Drawn Card) */}
            <div className="flex-none flex items-center justify-center gap-16 py-4 relative w-full">
                {/* Drawn Card (Side Display) */}
                {gameState.drawnCard && currentPlayer && !isPeekPhase && (
                    <div className="absolute left-4 lg:left-12 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 animate-in slide-in-from-left-10 fade-in duration-300 z-20">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-background)]/80 px-2 py-1 rounded-md backdrop-blur-sm">
                            {isMyTurn ? "Current Draw" : "Opponent"}
                        </span>
                        <div className="flex flex-col items-center gap-3 bg-[var(--color-surface)]/90 p-3 rounded-2xl backdrop-blur-sm border border-[var(--color-border)] shadow-xl">
                            <Card card={{ ...gameState.drawnCard, isFaceUp: showDrawnCard }} />

                            {isMyTurn && (
                                <div className="flex flex-col gap-2 w-full">
                                    <button
                                        onClick={() => onDiscard?.()}
                                        className="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-200 transition-colors font-medium text-xs w-full"
                                    >
                                        Discard
                                    </button>
                                    <span className="text-[10px] text-[var(--color-text-muted)] text-center leading-tight max-w-[80px]">
                                        Click hand to swap
                                    </span>
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
                    <div className="w-24 h-36 bg-[var(--color-primary)] rounded-xl border-2 border-white/10 shadow-lg flex items-center justify-center">
                        <span className="text-white font-bold text-xl">{gameState.deck.length}</span>
                    </div>
                    {/* Stack effect */}
                    <div className="absolute top-1 left-1 w-24 h-36 bg-[var(--color-primary)] rounded-xl -z-10 border-2 border-white/10"></div>
                    <div className="absolute top-2 left-2 w-24 h-36 bg-[var(--color-primary)] rounded-xl -z-20 border-2 border-white/10"></div>
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
                        <Card card={{ ...topCard, isFaceUp: true }} />
                    ) : (
                        <div className="w-24 h-36 border-2 border-dashed border-[var(--color-border)] rounded-xl flex items-center justify-center text-[var(--color-text-muted)]">
                            Discard
                        </div>
                    )}
                </div>
            </div>

            {/* Player Area (Bottom) */}
            <div className="flex-1 flex flex-col items-center justify-end gap-4 min-h-0 relative pb-8">
                {currentPlayer && (
                    <div className="flex flex-col items-center gap-6 relative">
                        {/* Peek Message - Positioned relative to hand */}
                        {isPeekPhase && !currentPlayer.isReady && (
                            <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-30 w-max animate-bounce">
                                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] px-6 py-2 rounded-full shadow-lg text-sm font-bold text-[var(--color-primary)]">
                                    Peek at your bottom 2 cards!
                                </div>
                                <div className="w-3 h-3 bg-[var(--color-surface)] border-b border-r border-[var(--color-border)] absolute left-1/2 -bottom-1.5 -translate-x-1/2 rotate-45"></div>
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
                        />

                        {isPeekPhase && !currentPlayer.isReady && (
                            <button
                                onClick={() => onReady?.()}
                                className="bg-[var(--color-primary)] text-white px-8 py-3 rounded-xl font-bold text-lg shadow-lg hover:scale-105 transition-transform animate-in fade-in slide-in-from-bottom-4"
                            >
                                I'm Ready to Play
                            </button>
                        )}

                        {isPeekPhase && currentPlayer.isReady && (
                            <div className="text-[var(--color-text-muted)] animate-pulse font-medium">
                                Waiting for opponent to ready up...
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
