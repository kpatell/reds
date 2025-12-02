import type { GameState, PlayerState, Card } from './types'
import { createDeck, shuffleDeck, dealCards } from './deck'

/**
 * Initializes a new game state.
 */
export function initializeGame(gameId: string, players: { id: string; username: string }[]): GameState {
  const deck = shuffleDeck(createDeck())
  const playerIds = players.map(p => p.id)
  const { hands, remainingDeck } = dealCards(deck, playerIds)
  
  // Create discard pile with one card
  const discardPile = [remainingDeck.pop()!]

  const playerStates: Record<string, PlayerState> = {}
  players.forEach(p => {
    playerStates[p.id] = {
      id: p.id,
      username: p.username,
      hand: hands[p.id],
      isReady: false,
      hasCalledReds: false,
      roundsWon: 0
    }
  })

  return {
    id: gameId,
    status: 'playing',
    deck: remainingDeck,
    discardPile,
    players: playerStates,
    currentTurnPlayerId: playerIds[0], // Player 1 starts
    turnPhase: 'draw',
    drawnCard: null,
    lastActionAt: new Date().toISOString(),
    winnerId: null
  }
}

/**
 * Checks if a move is valid based on the current state.
 */
export function isValidMove(state: GameState, playerId: string): boolean {
  if (state.status !== 'playing') return false
  if (state.currentTurnPlayerId !== playerId) return false
  return true
}

/**
 * Player draws a card from deck or discard pile.
 */
export function drawCard(state: GameState, playerId: string, source: 'deck' | 'discard'): GameState {
  if (!isValidMove(state, playerId)) throw new Error('Not your turn')
  if (state.turnPhase !== 'draw') throw new Error('Invalid phase')

  const newState = structuredClone(state)
  let card: Card | undefined

  if (source === 'deck') {
    card = newState.deck.pop()
    // TODO: Handle empty deck (end game)
  } else {
    card = newState.discardPile.pop()
  }

  if (!card) throw new Error('Source is empty')

  newState.drawnCard = card
  newState.drawnCardSource = source
  newState.turnPhase = 'action'
  newState.lastActionAt = new Date().toISOString()

  return newState
}

/**
 * Player discards the drawn card.
 */
export function discardDrawnCard(state: GameState, playerId: string): GameState {
  if (!isValidMove(state, playerId)) throw new Error('Not your turn')
  if (state.turnPhase !== 'action') throw new Error('Invalid phase')
  if (!state.drawnCard) throw new Error('No card drawn')

  const newState = structuredClone(state)
  const card = newState.drawnCard!

  newState.discardPile.push(card)
  newState.drawnCard = null
  
  // Refinement: If player drew from discard and discards it again, 
  // it's an "undo". Reset phase to 'draw' so they can choose again.
  if (newState.drawnCardSource === 'discard') {
      newState.turnPhase = 'draw'
      newState.drawnCardSource = null
      newState.lastActionAt = new Date().toISOString()
      return newState
  }
  
  newState.drawnCardSource = null
  return endTurn(newState)
}

/**
 * Player swaps drawn card with a hand card.
 */
export function swapCard(state: GameState, playerId: string, targetCardId: string): GameState {
  if (!isValidMove(state, playerId)) throw new Error('Not your turn')
  if (state.turnPhase !== 'action') throw new Error('Invalid phase')
  if (!state.drawnCard) throw new Error('No card drawn')

  const newState = structuredClone(state)
  const player = newState.players[playerId]
  const targetIndex = player.hand.findIndex(c => c.id === targetCardId)

  if (targetIndex === -1) throw new Error('Card not found in hand')

  const oldCard = player.hand[targetIndex]
  
  // Refinement: Swapped card goes into hand FACE DOWN
  player.hand[targetIndex] = { ...newState.drawnCard!, isFaceUp: false }
  
  // Old card goes to discard pile
  oldCard.isFaceUp = true
  newState.discardPile.push(oldCard)
  
  newState.drawnCard = null
  newState.drawnCardSource = null
  return endTurn(newState)
}

/**
 * Ends the current turn and passes to the next player.
 */
function endTurn(state: GameState): GameState {
  const playerIds = Object.keys(state.players).sort()
  const currentIndex = playerIds.indexOf(state.currentTurnPlayerId!)
  const nextIndex = (currentIndex + 1) % playerIds.length
  
  state.currentTurnPlayerId = playerIds[nextIndex]
  state.turnPhase = 'draw'
  state.lastActionAt = new Date().toISOString()
  
  return state
}
