import type { Card, GameState } from './types'

export const CARD_POINTS = {
  JOKER: 0,
  ACE: 1,
  JACK: 11,
  QUEEN: 12,
  KING_RED: -2,
  KING_BLACK: 13,
} as const

// Explicitly checks both rank AND suit — do not rely on card.value alone
export function getCardScore(card: Card): number {
  if (card.rank === 'Joker') return CARD_POINTS.JOKER
  if (card.rank === 'A') return CARD_POINTS.ACE
  if (card.rank === 'J') return CARD_POINTS.JACK
  if (card.rank === 'Q') return CARD_POINTS.QUEEN
  if (card.rank === 'K') {
    return card.suit === 'hearts' || card.suit === 'diamonds'
      ? CARD_POINTS.KING_RED
      : CARD_POINTS.KING_BLACK
  }
  return parseInt(card.rank, 10)
}

export function calculateHandScore(hand: (Card | null)[]): number {
  return hand.reduce<number>((total, card) => {
    if (!card) return total
    return total + getCardScore(card)
  }, 0)
}

export interface ScoreResult {
  scores: Record<string, number>
  winnerId: string
}

export function determineWinner(
  players: GameState['players'],
  callerId: string
): ScoreResult {
  const playerIds = Object.keys(players)
  const scores: Record<string, number> = {}

  for (const pid of playerIds) {
    scores[pid] = calculateHandScore(players[pid].hand)
  }

  const callerScore = scores[callerId]
  const opponentId = playerIds.find(id => id !== callerId)!
  const opponentScore = scores[opponentId]

  // Caller wins only if strictly less than opponent; ties go to the non-caller
  const winnerId = callerScore < opponentScore ? callerId : opponentId

  return { scores, winnerId }
}
