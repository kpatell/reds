export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs' | 'joker'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'Joker'

export interface Card {
  id: string // Unique ID for every card instance
  suit: Suit
  rank: Rank
  value: number // Numeric value for scoring (-2 to 13)
  isFaceUp: boolean
  knownBy?: string[] // IDs of players who have peeked at this card
}

export type Deck = Card[]

export interface PlayerState {
  id: string
  username: string
  hand: Card[] // 4 cards
  isReady: boolean
  hasCalledReds: boolean
  roundsWon: number
}

export type TurnPhase = 'peek' | 'draw' | 'action' | 'discard_power' | 'power_peek_self' | 'power_peek_opponent'

export interface GameState {
  id: string
  status: 'waiting' | 'playing' | 'finished'
  deck: Deck
  discardPile: Deck
  players: Record<string, PlayerState>
  currentTurnPlayerId: string | null
  turnPhase: TurnPhase
  drawnCard: Card | null // The card currently drawn by the active player
  drawnCardSource?: 'deck' | 'discard' | null
  lastActionAt: string // ISO timestamp
  winnerId: string | null
}
