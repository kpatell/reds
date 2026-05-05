export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs' | 'joker'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'Joker'

export interface Card {
  id: string
  suit: Suit
  rank: Rank
  value: number
  isFaceUp: boolean
  knownBy?: string[]
}

export type Deck = Card[]

export interface PlayerState {
  id: string
  username: string
  avatar_url?: string | null
  hand: (Card | null)[]
  isReady: boolean
  hasCalledReds: boolean
  roundsWon: number
  viewingCardId?: string | null
  swapSourceCardId?: string | null
}

export type TurnPhase =
  | 'peek'
  | 'draw'
  | 'action'
  | 'power_peek_self'
  | 'power_peek_opponent'
  | 'power_peek_viewing'
  | 'power_blind_swap'
  | 'power_look_swap'
  | 'power_look_swap_decision'

export interface GameState {
  id: string
  status: 'waiting' | 'playing' | 'final_turn' | 'reveal_pending' | 'finished'
  deck: Deck
  discardPile: Deck
  players: Record<string, PlayerState>
  currentTurnPlayerId: string | null
  turnPhase: TurnPhase
  drawnCard: Card | null
  drawnCardSource?: 'deck' | 'discard' | null
  pendingStackTransfer?: {
    playerId: string
    targetPlayerId: string
    slotIndex: number
  } | null
  lastActionAt: string
  lastGameAction?: {
    playerId: string
    actionType: 'draw' | 'discard' | 'swap' | 'power_peek_self' | 'power_peek_opponent' | 'power_blind_swap' | 'power_look_swap' | 'power_skip' | 'stack_success' | 'stack_failed' | 'stack_transfer' | 'call_reds'
    description: string
    metadata?: {
      swapSourceCardId?: string | null
      swapTargetCardId?: string | null
      highlightedCardIds?: string[]
    }
  } | null
  callerId?: string | null
  winnerId: string | null
  rematchVotes?: string[]
  revealVotes?: string[]
}
