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
}

import { useAuth } from '@/components/AuthProvider'

export function PlayerHand({ player, isCurrentUser, onCardClick, selectedCardId, className, overrideFaceUp, cardClassName, viewingCardId, beingViewedCardId }: PlayerHandProps & { viewingCardId?: string | null, beingViewedCardId?: string | null }) {
    const { user } = useAuth()

    return (
        <div className={cn("flex flex-col items-center gap-2", className)}>
            <div className="grid grid-cols-2 gap-2 p-2 sm:p-3 bg-[var(--color-surface)]/50 rounded-2xl border border-[var(--color-border)] shadow-sm">
                {player.hand.map((card, index) => {
                    const isKnownByMe = user && card.knownBy?.includes(user.id)

                    // Logic:
                    // 1. Override (Peek Phase) -> Show
                    // 2. Currently Viewing (Power Peek) -> Show
                    // 3. Known by me -> Show indicator (Ring), but NOT face up
                    const isViewing = viewingCardId === card.id
                    const isBeingViewedByOpponent = beingViewedCardId === card.id

                    const shouldShowFaceUp = overrideFaceUp?.includes(index) || isViewing

                    return (
                        <div key={card.id} className="relative">
                            {isBeingViewedByOpponent && (
                                <div className="absolute -top-2 -right-2 z-20 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full animate-pulse shadow-sm border border-white">
                                    👁️ Opponent Viewing
                                </div>
                            )}
                            <Card
                                card={shouldShowFaceUp ? { ...card, isFaceUp: true } : card}
                                onClick={() => onCardClick?.(card)}
                                isSelected={selectedCardId === card.id}
                                className={cn(
                                    !isCurrentUser && "cursor-default hover:translate-y-0",
                                    cardClassName,
                                    isKnownByMe && "ring-2 ring-blue-400/50", // Visual cue for known cards
                                    isViewing && "ring-4 ring-yellow-400 scale-105 z-10", // Highlight viewing card
                                    isBeingViewedByOpponent && "ring-4 ring-red-500/50" // Highlight card being viewed by opponent
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
