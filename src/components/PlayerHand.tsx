import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Card } from './Card'
import type { Card as CardType, PlayerState } from '@/lib/game/types'
import type { IncomingEmote } from '@/hooks/useEmotes'
import { cn } from '@/lib/utils'

const EMOTE_IDS = ['😡', '😂', '🤔', '⏳'] as const

interface PlayerHandProps {
    player: PlayerState
    isCurrentUser: boolean
    onCardClick?: (card: CardType) => void
    selectedCardId?: string | null
    className?: string
    overrideFaceUp?: number[] // Indices of cards to force face up
    highlightedCardIds?: string[]
    isDebug?: boolean
    viewingCardId?: string | null
    beingViewedCardId?: string | null
    beingViewedCardIds?: (string | null | undefined)[]
    isInteractive?: boolean
    revealViewedCard?: boolean
    showReadyBadge?: boolean
    onSendEmote?: (emoteId: string) => void
    activeEmote?: IncomingEmote | null
    localEmote?: IncomingEmote | null
}

/**
 * Distributes hand indices into two visual rows matching the spec:
 *   Top Row:    0, 1, 4, 6, 8, ...
 *   Bottom Row: 2, 3, 5, 7, 9, ...
 */
function splitIntoRows(length: number): [number[], number[]] {
    const top: number[] = []
    const bottom: number[] = []
    for (let i = 0; i < length; i++) {
        if (i < 2) top.push(i)
        else if (i < 4) bottom.push(i)
        else if (i % 2 === 0) top.push(i)
        else bottom.push(i)
    }
    return [top, bottom]
}

export function PlayerHand({
    player,
    isCurrentUser,
    onCardClick,
    selectedCardId,
    className,
    overrideFaceUp,
    highlightedCardIds = [],
    isDebug = false,
    viewingCardId,
    beingViewedCardId,
    beingViewedCardIds = [],
    isInteractive,
    revealViewedCard = true,
    showReadyBadge = true,
    onSendEmote,
    activeEmote,
    localEmote,
}: PlayerHandProps) {
    const [pickerOpen, setPickerOpen] = useState(false)
    const pickerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!pickerOpen) return
        const handler = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setPickerOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [pickerOpen])
    // Preserve internal nulls so cards stay in their memorized positions
    const visualHand: (CardType | null)[] = [...player.hand]

    // Pad to a minimum of 4 slots to maintain the 2x2 base grid
    while (visualHand.length < 4) {
        visualHand.push(null)
    }

    // Trim trailing nulls only (rightmost empty slots) — keep minimum 4
    while (visualHand.length > 4 && visualHand[visualHand.length - 1] === null) {
        visualHand.pop()
    }

    // Always keep an even count so the rows are balanced
    if (visualHand.length % 2 !== 0) {
        visualHand.push(null)
    }

    const [topIndices, bottomIndices] = splitIntoRows(visualHand.length)
    const displayHand = !isCurrentUser ? [...visualHand].reverse() : visualHand

    const renderCard = (index: number) => {
        const card = displayHand[index]

        if (!card) {
            return (
                <motion.div
                    key={`empty-${index}`}
                    layout
                    className="relative group flex items-center justify-center border-2 border-dashed border-[var(--color-border)] rounded-xl opacity-40 bg-black/5 h-[var(--card-h)] aspect-[2/3]"
                />
            )
        }

        const isViewing = viewingCardId === card.id
        const isBeingViewedByOpponent = beingViewedCardId === card.id || beingViewedCardIds.includes(card.id)
        const isHighlighted = highlightedCardIds?.includes(card.id)
        const shouldShowFaceUp = overrideFaceUp?.includes(index) || (isViewing && revealViewedCard)

        return (
            <motion.div key={card.id} layout className="relative group" style={{ zIndex: isHighlighted ? (isCurrentUser ? 30 : 20) : undefined }} transition={{ layout: { type: 'spring', stiffness: 150, damping: 20 } }}>
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
                        // Yellow ring = Active View (I am looking at this card right now)
                        isViewing && "ring-4 ring-yellow-400 ring-offset-2 ring-offset-[var(--color-background)] scale-105 z-10",
                        // Red ring = Opponent View (Opponent is looking at this card)
                        isBeingViewedByOpponent && "ring-4 ring-red-500 ring-offset-2 ring-offset-[var(--color-background)]",
                        // Purple ring = Highlighted (e.g. Swapped)
                        isHighlighted && "ring-4 ring-purple-500 ring-offset-2 ring-offset-[var(--color-background)] shadow-[0_0_15px_rgba(168,85,247,0.5)] z-20"
                    )}
                />
            </motion.div>
        )
    }

    return (
        <div className={cn("flex items-center gap-2", isCurrentUser ? "flex-col" : "flex-col-reverse", className)}>
            <div className="flex flex-col gap-1.5 sm:gap-2 p-2 sm:p-3 bg-[var(--color-surface)]/50 rounded-2xl border border-[var(--color-border)] shadow-sm">
                {/* Top Row: indices 0, 1, 4, 6, 8... */}
                <div className="flex gap-1.5 sm:gap-2 justify-center">
                    {topIndices.map(renderCard)}
                </div>
                {/* Bottom Row: indices 2, 3, 5, 7, 9... */}
                <div className="flex gap-1.5 sm:gap-2 justify-center">
                    {bottomIndices.map(renderCard)}
                </div>
            </div>

            <div className="flex items-center gap-2">
                {(() => {
                    const avatarEl = player.avatar_url ? (
                        <img src={player.avatar_url} alt={player.username} className="w-8 h-8 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)]" />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white font-bold">
                            {player.username.charAt(0).toUpperCase()}
                        </div>
                    )

                    if (isCurrentUser && onSendEmote) {
                        return (
                            <div className="relative pointer-events-auto" ref={pickerRef}>
                                {localEmote && (
                                    <div key={localEmote.nonce} className="emote-bubble absolute text-2xl pointer-events-none select-none z-10">
                                        {localEmote.emoteId}
                                    </div>
                                )}
                                <button onClick={() => setPickerOpen(v => !v)} className="rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]" title="Send emote">
                                    {avatarEl}
                                </button>
                                {pickerOpen && (
                                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex gap-0.5 p-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl z-50">
                                        {EMOTE_IDS.map(emote => (
                                            <button
                                                key={emote}
                                                onClick={() => { onSendEmote(emote); setPickerOpen(false) }}
                                                className="text-xl p-1 hover:scale-125 transition-transform cursor-pointer rounded"
                                            >
                                                {emote}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    }

                    if (!isCurrentUser && activeEmote) {
                        return (
                            <div className="relative inline-block">
                                <div key={activeEmote.nonce} className="emote-bubble absolute text-2xl pointer-events-none select-none z-10">
                                    {activeEmote.emoteId}
                                </div>
                                {avatarEl}
                            </div>
                        )
                    }

                    return avatarEl
                })()}
                <span className="font-medium text-[var(--color-text-main)]">{player.username}</span>
                {showReadyBadge && player.isReady && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Ready</span>
                )}
            </div>
        </div>
    )
}
