import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Heart, Diamond, Club, Spade, Crown } from 'lucide-react'
import type { Card as CardType, Suit } from '@/lib/game/types'

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

interface CardProps {
    card: CardType
    onClick?: () => void
    isSelected?: boolean
    className?: string
}

export function Card({ card, onClick, isSelected, className }: CardProps) {
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds'

    return (
        <div
            onClick={onClick}
            className={cn(
                "relative w-24 h-36 perspective-1000 cursor-pointer transition-transform duration-200 hover:-translate-y-1",
                isSelected && "ring-4 ring-[var(--color-primary)] rounded-xl scale-105 z-10",
                className
            )}
        >
            <div
                className={cn(
                    "w-full h-full transition-all duration-500 transform-style-3d shadow-md rounded-xl border border-[var(--color-border)]",
                    card.isFaceUp ? "rotate-y-0" : "rotate-y-180 bg-[var(--color-primary)]"
                )}
            >
                {/* Front Face */}
                {card.isFaceUp && (
                    <div className="absolute inset-0 backface-hidden bg-[var(--color-surface)] rounded-xl flex flex-col items-center justify-between p-2">
                        <div className={cn("self-start text-lg font-bold font-serif", isRed ? "text-red-600" : "text-neutral-900")}>
                            {card.rank}
                            <SuitIcon suit={card.suit} className="w-4 h-4" />
                        </div>

                        <div className={cn("text-4xl", isRed ? "text-red-600" : "text-neutral-900")}>
                            <SuitIcon suit={card.suit} />
                        </div>

                        <div className={cn("self-end text-lg font-bold font-serif rotate-180", isRed ? "text-red-600" : "text-neutral-900")}>
                            {card.rank}
                            <SuitIcon suit={card.suit} className="w-4 h-4" />
                        </div>
                    </div>
                )}

                {/* Back Face (Pattern) */}
                {!card.isFaceUp && (
                    <div className="absolute inset-0 backface-hidden rotate-y-180 bg-[var(--color-primary)] rounded-xl flex items-center justify-center">
                        <div className="w-full h-full opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIi8+CjxwYXRoIGQ9Ik0wIDBMOCA4Wk04IDBMMCA4WiIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz4KPC9zdmc+')]"></div>
                        <Crown className="text-white/20 w-12 h-12 absolute" />
                    </div>
                )}
            </div>
        </div>
    )
}

function SuitIcon({ suit, className }: { suit: Suit; className?: string }) {
    const props = { className: cn("w-full h-full", className) }
    switch (suit) {
        case 'hearts': return <Heart {...props} fill="currentColor" />
        case 'diamonds': return <Diamond {...props} fill="currentColor" />
        case 'clubs': return <Club {...props} fill="currentColor" />
        case 'spades': return <Spade {...props} fill="currentColor" />
        case 'joker': return <Crown {...props} />
    }
}
