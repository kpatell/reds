import { Card } from './Card'
import type { Card as CardType, PlayerState } from '@/lib/game/types'
import { cn } from '@/lib/utils'

interface PlayerHandProps {
    player: PlayerState
    isCurrentUser: boolean
    onCardClick?: (card: CardType) => void
    selectedCardId?: string | null
    className?: string
    overrideFaceUp?: number[] // Indices of cards to force face up
    cardClassName?: string
    highlightedCardIds?: string[]
    isDebug?: boolean
    maxCols?: number
}



export function PlayerHand({ player, isCurrentUser, onCardClick, selectedCardId, className, overrideFaceUp, cardClassName, viewingCardId, beingViewedCardId, beingViewedCardIds = [], isInteractive, revealViewedCard = true, highlightedCardIds = [], isDebug = false, maxCols }: PlayerHandProps & { viewingCardId?: string | null, beingViewedCardId?: string | null, beingViewedCardIds?: (string | null | undefined)[], isInteractive?: boolean, revealViewedCard?: boolean }) {

    // DO NOT filter nulls so cards stay in their exact positions
    const visualHand = [...player.hand]

    // Pad to a minimum of 4 slots to maintain the 2x2 base grid
    while (visualHand.length < 4) {
        visualHand.push(null as any)
    }

    // 3. Grid Columns uses maxCols if provided (so both players' grids align), fallback to visual hand length
    const cols = maxCols || Math.max(2, Math.ceil(visualHand.length / 2))

    return (
        <div className={cn("flex flex-col items-center gap-2", className)}>
            <div
                className="grid justify-center max-w-full gap-2 p-2 sm:p-3 bg-[var(--color-surface)]/50 rounded-2xl border border-[var(--color-border)] shadow-sm"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, auto))` }}
            >
                {visualHand.map((card, index) => {
                    if (!card) {
                        return (
                            <div key={`empty-${index}`} className="relative group flex items-center justify-center border-2 border-dashed border-[var(--color-border)] rounded-xl aspect-[63/88] w-20 sm:w-24 md:w-28 opacity-50 bg-black/5">
                            </div>
                        )
                    }

                    const isViewing = viewingCardId === card.id
                    const isBeingViewedByOpponent = beingViewedCardId === card.id || beingViewedCardIds.includes(card.id)
                    const isHighlighted = highlightedCardIds?.includes(card.id)

                    const shouldShowFaceUp = overrideFaceUp?.includes(index) || (isViewing && revealViewedCard)

                    return (
                        <div key={card.id} className="relative group">
                            {(isBeingViewedByOpponent || (isViewing && !isCurrentUser && !revealViewedCard)) && (
                                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 rounded-xl backdrop-blur-[1px] animate-pulse">
                                    <div className="bg-white/90 rounded-full p-2 shadow-lg">
                                        <div className="text-2xl">👁️</div>
                                    </div>
                                </div>
                            )}
                            <Card
                                card={shouldShowFaceUp ? { ...card, isFaceUp: true } : card}
                                onClick={() => onCardClick?.(card)}
                                isSelected={selectedCardId === card.id}
                                isDebug={isDebug}
                                isOpponent={!isCurrentUser}
                                className={cn(
                                    (!isCurrentUser && !isInteractive) && "cursor-default hover:translate-y-0",
                                    cardClassName,
                                    // Yellow ring = Active View (I am looking at this card right now)
                                    isViewing && "ring-4 ring-yellow-400 ring-offset-2 ring-offset-[var(--color-background)] scale-105 z-10",
                                    // Red ring = Opponent View (Opponent is looking at this card)
                                    isBeingViewedByOpponent && "ring-4 ring-red-500 ring-offset-2 ring-offset-[var(--color-background)]",
                                    // Purple ring = Highlighted (e.g. Swapped)
                                    isHighlighted && "ring-4 ring-purple-500 ring-offset-2 ring-offset-[var(--color-background)] shadow-[0_0_15px_rgba(168,85,247,0.5)] z-20"
                                )}
                            />
                        </div>
                    )
                })}
            </div>

            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white font-bold">
                    {player.username.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium text-[var(--color-text-main)]">{player.username}</span>
                {player.isReady && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Ready</span>
                )}
            </div>
        </div>
    )
}
