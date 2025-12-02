import { v4 as uuidv4 } from 'uuid'
import type { Card, Deck, Rank, Suit } from './types'

export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

/**
 * Calculates the score value of a card based on Reds rules.
 */
export function getCardValue(rank: Rank, suit: Suit): number {
  if (rank === 'Joker') return 0
  if (rank === 'A') return 1
  if (rank === 'J') return 11
  if (rank === 'Q') return 12
  if (rank === 'K') {
    return (suit === 'hearts' || suit === 'diamonds') ? -2 : 13
  }
  return parseInt(rank, 10)
}

/**
 * Creates a standard 54-card deck (52 + 2 Jokers) with unique IDs.
 */
export function createDeck(): Deck {
  const deck: Deck = []

  // Add standard cards
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: uuidv4(),
        suit,
        rank,
        value: getCardValue(rank, suit),
        isFaceUp: false,
      })
    }
  }

  // Add 2 Jokers
  for (let i = 0; i < 2; i++) {
    deck.push({
      id: uuidv4(),
      suit: 'joker',
      rank: 'Joker',
      value: 0,
      isFaceUp: false,
    })
  }

  return deck
}

/**
 * Shuffles a deck using the Fisher-Yates algorithm.
 */
export function shuffleDeck(deck: Deck): Deck {
  const newDeck = [...deck]
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]]
  }
  return newDeck
}

/**
 * Deals initial hands to players.
 * Returns the hands and the remaining deck.
 */
export function dealCards(deck: Deck, playerIds: string[]): { hands: Record<string, Card[]>, remainingDeck: Deck } {
  const hands: Record<string, Card[]> = {}
  const currentDeck = [...deck]

  // Initialize empty hands
  playerIds.forEach(id => {
    hands[id] = []
  })

  // Deal 4 cards to each player
  for (let i = 0; i < 4; i++) {
    playerIds.forEach(id => {
      const card = currentDeck.pop()
      if (card) {
        hands[id].push(card)
      }
    })
  }

  return { hands, remainingDeck: currentDeck }
}
