import React, { useState } from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { motion } from 'framer-motion'
import { Heart, Diamond, Club, Spade, Crown } from 'lucide-react'
import type { Card as CardType, Suit } from '@/lib/game/types'

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

const JOKER_MASK = `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/>' +
    '<path d="M5 21h14"/>' +
    '</svg>'
)}")`

interface CardProps {
    card: CardType
    onClick?: () => void
    onDoubleClick?: () => void
    isSelected?: boolean
    className?: string
    isDebug?: boolean
    size?: 'sm' | 'default'
    /** Disable shared layout animation — use when the card is being animated by
     *  a parent (e.g. the drawn-card overlay) to avoid conflicting FLIP transforms. */
    noLayoutAnimation?: boolean
}

export function Card({ card, onClick, onDoubleClick, isSelected, className, isDebug, size = 'default', noLayoutAnimation = false }: CardProps) {
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds'
    const sm = size === 'sm'

    // Disable transform-style-3d while a layout animation (FLIP) is running.
    // Framer Motion's FLIP applies ancestor transforms that break CSS preserve-3d,
    // causing the card back face to bleed through (gray-out artifact).
    const [layoutAnimating, setLayoutAnimating] = useState(false)

    return (
        <motion.div
            layoutId={noLayoutAnimation ? undefined : card.id}
            layout={!noLayoutAnimation}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            whileHover={{ y: -4 }}
            animate={{ scale: isSelected ? 1.05 : 1 }}
            transition={{ layout: { type: 'spring', stiffness: 120, damping: 25, duration: 0.6 }, opacity: { duration: 0 } }}
            onLayoutAnimationStart={() => setLayoutAnimating(true)}
            onLayoutAnimationComplete={() => setLayoutAnimating(false)}
            style={{ containerType: 'inline-size' }}
            className={cn(
                "relative perspective-1000 cursor-pointer !opacity-100",
                sm ? "w-16 h-24" : "h-[var(--card-h)] aspect-[2/3]",
                isSelected && "ring-4 ring-[var(--color-primary)] rounded-xl z-10",
                className
            )}
        >
            <div className="w-full h-full" style={{ fontSize: 'max(7px, 11cqw)' }}>
                <div
                    className={cn(
                        "w-full h-full transition-all duration-500 shadow-md rounded-xl border border-[var(--color-border)]",
                        !layoutAnimating && "transform-style-3d",
                        card.isFaceUp ? "rotate-y-0" : "rotate-y-180 bg-[var(--color-primary)]"
                    )}
                >
                    {/* Front Face */}
                    {card.isFaceUp && (
                        <div className="absolute inset-0 backface-hidden overflow-hidden bg-[var(--color-surface)] rounded-xl flex flex-col justify-between py-[0.8em] px-[0.5em]">

                            {/* Mobile: single centered rank + suit (replaces corner layout) */}
                            <div className={cn("sm:hidden absolute inset-0 flex flex-col items-center justify-center gap-[0.25em]", isRed ? "text-red-600" : "text-neutral-900")}>
                                {card.suit === 'joker' ? (
                                    <SuitIcon suit={card.suit} style={{ width: '4em', height: '4em' }} />
                                ) : (
                                    <>
                                        <span className="font-black font-serif leading-none" style={{ fontSize: '3.2em' }}>{card.rank}</span>
                                        <SuitIcon suit={card.suit} style={{ width: '2.4em', height: '2.4em' }} />
                                    </>
                                )}
                            </div>

                            {/* Desktop: top-left corner */}
                            <div className={cn("hidden sm:flex flex-col items-center self-start", isRed ? "text-red-600" : "text-neutral-900")}>
                                <span className="font-bold font-serif leading-none text-[2.2em]">{card.rank}</span>
                                {card.suit !== 'joker' && <SuitIcon suit={card.suit} className="mt-[0.1em]" style={{ width: '1.2em', height: '1.2em' }} />}
                            </div>

                            {/* Desktop: center giant suit */}
                            <div className={cn("hidden sm:flex items-center justify-center", isRed ? "text-red-600" : "text-neutral-900")}>
                                <SuitIcon suit={card.suit} style={{ width: '2.8em', height: '2.8em' }} />
                            </div>

                            {/* Desktop: bottom-right corner (rotated) */}
                            <div className={cn("hidden sm:flex flex-col items-center self-end rotate-180", isRed ? "text-red-600" : "text-neutral-900")}>
                                <span className="font-bold font-serif leading-none text-[2.2em]">{card.rank}</span>
                                {card.suit !== 'joker' && <SuitIcon suit={card.suit} className="mt-[0.1em]" style={{ width: '1.2em', height: '1.2em' }} />}
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
        case 'joker': return (
            <span
                className={cn(className)}
                style={{
                    display: 'inline-block',
                    ...style,
                    background: 'linear-gradient(135deg, #ff4d4d 0%, #ffaa00 25%, #22cc66 50%, #4488ff 75%, #aa44ff 100%)',
                    WebkitMaskImage: JOKER_MASK,
                    WebkitMaskSize: '100% 100%',
                    maskImage: JOKER_MASK,
                    maskSize: '100% 100%',
                }}
            />
        )
    }
}
