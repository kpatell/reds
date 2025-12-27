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



export function PlayerHand({ player, isCurrentUser, onCardClick, selectedCardId, className, overrideFaceUp, cardClassName, viewingCardId, beingViewedCardId, isInteractive, revealViewedCard = true }: PlayerHandProps & { viewingCardId?: string | null, beingViewedCardId?: string | null, isInteractive?: boolean, revealViewedCard?: boolean }) {

    return (
        <div className={cn("flex flex-col items-center gap-2", className)}>
            <div className="grid grid-cols-2 gap-2 p-2 sm:p-3 bg-[var(--color-surface)]/50 rounded-2xl border border-[var(--color-border)] shadow-sm">
                {player.hand.map((card, index) => {
                    // Logic:
                    // 1. Override (Peek Phase) -> Show
                    // 2. Currently Viewing (Power Peek) -> Show ONLY if I am the current user or properly authorized.
                    //    However, viewingCardId is passed from GameBoard based on context.
                    //    Issue: Opponent view was receiving a viewingCardId.
                    //    Fix: checking isCurrentUser or relying on correct props from parent.
                    //    Actually, PlayerHand only knows `viewingCardId`. If it matches, it shows face up.
                    //    So GameBoard must NOT pass viewingCardId for the opponent if the User shouldn't see it?
                    //    But we need the RING to show.

                    // New Approach: Separate "Reveal Logic" vs "Highlight Logic".
                    // The "viewingCardId" prop currently forces FaceUp. We should change this behavior.

                    const isViewing = viewingCardId === card.id
                    const isBeingViewedByOpponent = beingViewedCardId === card.id

                    // Only show face up if implicit rules are met:
                    // - It's my hand (isCurrentUser) and I am viewing it? Yes.
                    // - It's opponent's hand (!isCurrentUser) and I am viewing it? Yes.
                    // - BUT: If I am the opponent (from another perspective), I shouldn't see it just because "viewingCardId" is set for highlighting.

                    // We need to trust the parent to only pass "viewingCardId" when it should be REVEALED.
                    // But we used viewingCardId for the yellow ring too.
                    // Let's rely on Card to handle "isFaceUp" strictly via props, and use viewingCardId just for the ring?
                    // No, existing logic relies on `shouldShowFaceUp` to flip the card.

                    // Fix: Add a check `isCurrentUser` for self-peeks?
                    // If !isCurrentUser (Opponent Hand), and I have `viewingCardId`, that means I am peeking at it (Power 8, Power 10). So I SHOULD see it.
                    // The bug reported is: "My opponent is also able to see the card".
                    // This means when Player A is peeking at Player A's card (Power 10 self-view), Player B sees it flipped.
                    // This happens because Player B sees Player A component.
                    // In Player B's `GameBoard`, `opponent` is Player A.
                    // `viewingCardId` is passed as `opponent.viewingCardId`?
                    // Let's check GameBoard.


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
                                className={cn(
                                    (!isCurrentUser && !isInteractive) && "cursor-default hover:translate-y-0",
                                    cardClassName,
                                    // Yellow ring = Active View (I am looking at this card right now)
                                    isViewing && "ring-4 ring-yellow-400 ring-offset-2 ring-offset-[var(--color-background)] scale-105 z-10",
                                    // Red ring = Opponent View (Opponent is looking at this card)
                                    isBeingViewedByOpponent && "ring-4 ring-red-500 ring-offset-2 ring-offset-[var(--color-background)]"
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
