import React from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { motion } from 'framer-motion'
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
    isDebug?: boolean
    isOpponent?: boolean
    size?: 'sm' | 'default'
}

export function Card({ card, onClick, isSelected, className, isDebug, isOpponent, size = 'default' }: CardProps) {
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds'
    const sm = size === 'sm'

    return (
        <motion.div
            layoutId={card.id}
            layout
            onClick={onClick}
            whileHover={{ y: -4 }}
            animate={{ scale: isSelected ? 1.05 : 1 }}
            transition={{ layout: { type: 'spring', stiffness: 120, damping: 25, duration: 0.6 } }}
            style={{ containerType: 'inline-size' }}
            className={cn(
                "relative perspective-1000 cursor-pointer",
                sm ? "w-16 h-24" : "h-[var(--card-h)] aspect-[2/3]",
                isSelected && "ring-4 ring-[var(--color-primary)] rounded-xl z-10",
                className
            )}
        >
            <div className="w-full h-full" style={{ fontSize: '11cqw' }}>
            <div
                className={cn(
                    "w-full h-full transition-all duration-500 transform-style-3d shadow-md rounded-xl border border-[var(--color-border)]",
                    card.isFaceUp ? "rotate-y-0" : "rotate-y-180 bg-[var(--color-primary)]"
                )}
            >
                {/* Front Face */}
                {card.isFaceUp && (
                    <div className="absolute inset-0 backface-hidden overflow-hidden bg-[var(--color-surface)] rounded-xl flex flex-col justify-between py-[0.8em] px-[0.5em]">
                        {/* Top Left */}
                        <div className={cn("flex flex-col items-center self-start", isRed ? "text-red-600" : "text-neutral-900")}>
                            <span className="font-bold font-serif leading-none" style={{ fontSize: '2.2em' }}>{card.rank}</span>
                            <SuitIcon suit={card.suit} className="mt-[0.1em]" style={{ width: '1.2em', height: '1.2em' }} />
                        </div>

                        {/* Center Giant Suit */}
                        <div className={cn("flex items-center justify-center", isRed ? "text-red-600" : "text-neutral-900")}>
                            <SuitIcon suit={card.suit} style={{ width: '2.8em', height: '2.8em' }} />
                        </div>

                        {/* Bottom Right (Rotated) */}
                        <div className={cn("flex flex-col items-center self-end rotate-180", isRed ? "text-red-600" : "text-neutral-900")}>
                            <span className="font-bold font-serif leading-none" style={{ fontSize: '2.2em' }}>{card.rank}</span>
                            <SuitIcon suit={card.suit} className="mt-[0.1em]" style={{ width: '1.2em', height: '1.2em' }} />
                        </div>
                    </div>
                )}

                {/* Back Face (Pattern) */}
                {!card.isFaceUp && (
                    <div className="absolute inset-0 backface-hidden rotate-y-180 bg-[var(--color-primary)] rounded-xl flex items-center justify-center">
                        <div className="w-full h-full opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIi8+CjxwYXRoIGQ9Ik0wIDBMOCA4Wk04IDBMMCA4WiIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEiLz4KPC9zdmc+')]"></div>
                        <Crown className="text-white/20 w-12 h-12 absolute" />
                        
                        {/* Debug Mode Overlay */}
                        {isDebug && (
                            <div 
                                className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/60 font-bold text-3xl z-[100] rounded-xl pointer-events-none shadow-2xl"
                                style={{ transform: 'translateZ(1px)' }}
                            >
                                <div>{card.rank}</div>
                                <SuitIcon suit={card.suit} className="w-8 h-8 mt-1" />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
        </motion.div>
    )
}

function SuitIcon({ suit, className, style }: { suit: Suit; className?: string; style?: React.CSSProperties }) {
    const props = { className: cn("w-full h-full", className), style }
    switch (suit) {
        case 'hearts': return <Heart {...props} fill="currentColor" />
        case 'diamonds': return <Diamond {...props} fill="currentColor" />
        case 'clubs': return <Club {...props} fill="currentColor" />
        case 'spades': return <Spade {...props} fill="currentColor" />
        case 'joker': return <Crown {...props} />
    }
}
