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
}

export function GameBoard({ gameState, onDraw, onDiscard, onSwap }: GameBoardProps) {
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

    return (
        <div className="flex flex-col h-screen w-full max-w-4xl mx-auto p-4 gap-8">
            {/* Turn Indicator */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                <div className={cn(
                    "px-4 py-2 rounded-full font-bold shadow-lg transition-all duration-300",
                    isMyTurn
                        ? "bg-[var(--color-primary)] text-white scale-110"
                        : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                )}>
                    {isMyTurn ? "YOUR TURN" : "OPPONENT'S TURN"}
                </div>
            </div>

            {/* Opponent Area (Top) */}
            <div className="flex-1 flex items-start justify-center rotate-180">
                {opponent ? (
                    <PlayerHand
                        player={opponent}
                        isCurrentUser={false}
                        className={isMyTurn ? "opacity-50 transition-opacity" : ""}
                    />
                ) : (
                    <div className="text-[var(--color-text-muted)] animate-pulse rotate-180">
                        Waiting for opponent...
                    </div>
                )}
            </div>

            {/* Center Area (Decks) */}
            <div className="flex-none flex items-center justify-center gap-12 py-8">
                {/* Draw Pile */}
                <div
                    onClick={() => isMyTurn && !isActionPhase && onDraw?.('deck')}
                    className={cn(
                        "relative group transition-transform",
                        isMyTurn && !isActionPhase ? "cursor-pointer hover:scale-105" : "cursor-not-allowed opacity-80"
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
                    onClick={() => isMyTurn && !isActionPhase && onDraw?.('discard')}
                    className={cn(
                        "relative transition-transform",
                        isMyTurn && !isActionPhase ? "cursor-pointer hover:scale-105" : "cursor-not-allowed"
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
            <div className="flex-1 flex flex-col items-center justify-end gap-4">
                {/* Drawn Card Area */}
                {gameState.drawnCard && currentPlayer && (
                    <div className="flex flex-col items-center gap-2 animate-in slide-in-from-bottom-10 fade-in duration-300 z-20">
                        <span className="text-sm font-medium text-[var(--color-text-muted)]">Drawn Card</span>
                        <div className="flex items-center gap-4 bg-[var(--color-surface)]/80 p-4 rounded-2xl backdrop-blur-sm border border-[var(--color-border)] shadow-xl">
                            <Card card={{ ...gameState.drawnCard, isFaceUp: true }} />
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => onDiscard?.()}
                                    className="bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200 transition-colors font-medium text-sm"
                                >
                                    Discard
                                </button>
                                <span className="text-xs text-[var(--color-text-muted)] text-center max-w-[100px]">
                                    Click a card in your hand to swap
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {currentPlayer && (
                    <PlayerHand
                        player={currentPlayer}
                        isCurrentUser={true}
                        onCardClick={(card) => {
                            if (gameState.drawnCard) {
                                onSwap?.(card.id)
                            }
                        }}
                        className={!isMyTurn ? "opacity-75" : ""}
                    />
                )}
            </div>
        </div>
    )
}
