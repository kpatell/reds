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

export function PlayerHand({ player, isCurrentUser, onCardClick, selectedCardId, className, overrideFaceUp, cardClassName }: PlayerHandProps) {
    return (
        <div className={cn("flex flex-col items-center gap-2", className)}>
            <div className="grid grid-cols-2 gap-2 p-2 sm:p-3 bg-[var(--color-surface)]/50 rounded-2xl border border-[var(--color-border)] shadow-sm">
                {player.hand.map((card, index) => (
                    <Card
                        key={card.id}
                        card={overrideFaceUp?.includes(index) ? { ...card, isFaceUp: true } : card}
                        onClick={() => onCardClick?.(card)}
                        isSelected={selectedCardId === card.id}
                        className={cn(
                            !isCurrentUser && "cursor-default hover:translate-y-0",
                            cardClassName
                        )}
                    />
                ))}
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
