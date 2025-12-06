import type { GameState, PlayerState, Card } from './types'
import { createDeck, shuffleDeck, dealCards } from './deck'

/**
 * Initializes a new game state.
 */
export function initializeGame(gameId: string, players: { id: string; username: string }[]): GameState {
  const deck = shuffleDeck(createDeck())
  const playerIds = players.map(p => p.id)
  const { hands, remainingDeck } = dealCards(deck, playerIds)
  
  // Create discard pile with NO cards (User Request #4)
  const discardPile: Card[] = []

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
    turnPhase: 'peek', // Start in Peek phase (User Request #5)
    drawnCard: null,
    lastActionAt: new Date().toISOString(),
    winnerId: null
  }
}

/**
 * Sets a player as ready (used for Peek phase).
 */
export function setPlayerReady(state: GameState, playerId: string): GameState {
    const newState = structuredClone(state)
    const player = newState.players[playerId]
    player.isReady = true
    
    // Check if all players are ready
    const allReady = Object.values(newState.players).every(p => p.isReady)
    
    if (allReady && newState.turnPhase === 'peek') {
        newState.turnPhase = 'draw'
        // Reset ready status for future rounds if needed, or keep it?
        // For now, keep it true to show they joined.
    }
    
    newState.lastActionAt = new Date().toISOString()
    return newState
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
    // DEBUG: Force Draw
    if (typeof window !== 'undefined') {
        const debugRank = localStorage.getItem('debug_next_card')
        if (debugRank) {
            const index = newState.deck.findIndex(c => c.rank === debugRank)
            if (index !== -1) {
                const [forced] = newState.deck.splice(index, 1)
                card = forced
                console.log(`[DEBUG] Forced draw: ${card.rank}`)
                localStorage.removeItem('debug_next_card')
            } else {
                card = newState.deck.pop()
            }
        } else {
             card = newState.deck.pop()
        }
    } else {
         card = newState.deck.pop()
    }
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
  
  const source = newState.drawnCardSource
  newState.drawnCardSource = null

  // Check for Power Cards (7 or 8 or 9 or 10) - ONLY if drawn from DECK
  if (source === 'deck') {
      if (card.rank === '7') {
          newState.turnPhase = 'power_peek_self'
          newState.lastActionAt = new Date().toISOString()
          return newState
      }
      
      if (card.rank === '8') {
          newState.turnPhase = 'power_peek_opponent'
          newState.lastActionAt = new Date().toISOString()
          return newState
      }

      if (card.rank === '9') {
          newState.turnPhase = 'power_blind_swap'
          newState.lastActionAt = new Date().toISOString()
          return newState
      }

      if (card.rank === '10') {
          newState.turnPhase = 'power_look_swap'
          newState.lastActionAt = new Date().toISOString()
          return newState
      }
  }

  return endTurn(newState)
}

/**
 * Resolves the "Blind Swap" power (9).
 * Step 1: Select own card (sets swapSourceCardId).
 * Step 2: Select opponent card (performs swap).
 */
export function resolvePowerBlindSwap(state: GameState, playerId: string, targetCardId: string): GameState {
    if (!isValidMove(state, playerId)) throw new Error('Not your turn')
    if (state.turnPhase !== 'power_blind_swap') throw new Error('Invalid phase')

    const newState = structuredClone(state)
    const player = newState.players[playerId]

    // Step 1: Select own card
    if (!player.swapSourceCardId) {
        const card = player.hand.find(c => c.id === targetCardId)
        if (!card) throw new Error('Must select one of your own cards first')
        
        player.swapSourceCardId = targetCardId
        newState.lastActionAt = new Date().toISOString()
        return newState
    }

    // Step 2: Select opponent card and swap
    let opponentId: string | undefined
    let opponentCardIndex: number = -1

    for (const pid of Object.keys(newState.players)) {
        if (pid === playerId) continue
        const idx = newState.players[pid].hand.findIndex(c => c.id === targetCardId)
        if (idx !== -1) {
            opponentId = pid
            opponentCardIndex = idx
            break
        }
    }

    if (!opponentId || opponentCardIndex === -1) {
        // Allow changing own selection if they click their own card again?
        const myCard = player.hand.find(c => c.id === targetCardId)
        if (myCard) {
            player.swapSourceCardId = targetCardId // Change selection
            newState.lastActionAt = new Date().toISOString()
            return newState
        }
        throw new Error('Must select an opponent card to swap with')
    }

    const opponent = newState.players[opponentId]
    const myCardIndex = player.hand.findIndex(c => c.id === player.swapSourceCardId)
    
    if (myCardIndex === -1) throw new Error('Selected source card not found')

    const myCard = player.hand[myCardIndex]
    const opponentCard = opponent.hand[opponentCardIndex]

    // Perform Swap
    player.hand[myCardIndex] = opponentCard
    opponent.hand[opponentCardIndex] = myCard

    // Clear selection
    player.swapSourceCardId = null
    
    newState.lastGameAction = {
        playerId,
        actionType: 'power_blind_swap',
        description: 'Swapped cards (Blind Swap)'
    }
    
    return endTurn(newState)
}

/**
 * Resolves the "Look & Swap" power (10).
 * Step 1: Select own card (sets swapSourceCardId).
 * Step 2: Select opponent card (sets viewingCardId and transitions to decision).
 */
export function resolvePowerLookSwap(state: GameState, playerId: string, targetCardId: string): GameState {
    if (!isValidMove(state, playerId)) throw new Error('Not your turn')
    if (state.turnPhase !== 'power_look_swap') throw new Error('Invalid phase')

    const newState = structuredClone(state)
    const player = newState.players[playerId]

    // Step 1: Select own card
    if (!player.swapSourceCardId) {
        const card = player.hand.find(c => c.id === targetCardId)
        if (!card) throw new Error('Must select one of your own cards first')
        
        // Reveal my card to ME (add to knownBy)
        if (!card.knownBy) card.knownBy = []
        if (!card.knownBy.includes(playerId)) card.knownBy.push(playerId)

        player.swapSourceCardId = targetCardId
        player.viewingCardId = targetCardId // Reveal to self
        newState.lastActionAt = new Date().toISOString()
        return newState
    }

    // Step 2: Select opponent card
    let opponentId: string | undefined
    let opponentCard: Card | undefined

    for (const pid of Object.keys(newState.players)) {
        if (pid === playerId) continue
        const card = newState.players[pid].hand.find(c => c.id === targetCardId)
        if (card) {
            opponentId = pid
            opponentCard = card
            break
        }
    }

    if (!opponentId || !opponentCard) {
        // Allow changing own selection
        const myCard = player.hand.find(c => c.id === targetCardId)
        if (myCard) {
            // Reveal new card
            if (!myCard.knownBy) myCard.knownBy = []
            if (!myCard.knownBy.includes(playerId)) myCard.knownBy.push(playerId)
            
            player.swapSourceCardId = targetCardId
            newState.lastActionAt = new Date().toISOString()
            return newState
        }
        throw new Error('Must select an opponent card')
    }

    // Reveal opponent card to ME
    if (!opponentCard.knownBy) opponentCard.knownBy = []
    if (!opponentCard.knownBy.includes(playerId)) opponentCard.knownBy.push(playerId)

    // Set viewing card and transition to decision
    newState.turnPhase = 'power_look_swap_decision' // Transition to decision phase
    player.viewingCardId = targetCardId // Reveal opponent card
    newState.lastActionAt = new Date().toISOString()

    return newState
}

/**
 * Resolves the decision for "Look & Swap" (10).
 */
export function resolvePowerLookSwapDecision(state: GameState, playerId: string, action: 'swap' | 'keep'): GameState {
    if (!isValidMove(state, playerId)) throw new Error('Not your turn')
    if (state.turnPhase !== 'power_look_swap_decision') throw new Error('Invalid phase')

    const newState = structuredClone(state)
    const player = newState.players[playerId]
    
    if (!player.swapSourceCardId || !player.viewingCardId) throw new Error('Invalid state for decision')

    if (action === 'swap') {
        const myCardIndex = player.hand.findIndex(c => c.id === player.swapSourceCardId)
        
        // Find opponent card
        let opponentId: string | undefined
        let opponentCardIndex: number = -1

        for (const pid of Object.keys(newState.players)) {
            if (pid === playerId) continue
            const idx = newState.players[pid].hand.findIndex(c => c.id === player.viewingCardId)
            if (idx !== -1) {
                opponentId = pid
                opponentCardIndex = idx
                break
            }
        }

        if (myCardIndex !== -1 && opponentId && opponentCardIndex !== -1) {
            const opponent = newState.players[opponentId]
            const myCard = player.hand[myCardIndex]
            const opponentCard = opponent.hand[opponentCardIndex]

            // Perform Swap
            player.hand[myCardIndex] = opponentCard
            opponent.hand[opponentCardIndex] = myCard
        }
    }

    // Clear state
    player.swapSourceCardId = null
    player.viewingCardId = null

    newState.lastGameAction = {
        playerId,
        actionType: 'power_look_swap',
        description: action === 'swap' ? 'Swapped cards (Look & Swap)' : 'Kept own card (Look & Swap)'
    }

    return endTurn(newState)
}

/**
 * Resolves the "Peek Self" power (7).
 */
export function resolvePowerPeekSelf(state: GameState, playerId: string, targetCardId: string): GameState {
    if (!isValidMove(state, playerId)) throw new Error('Not your turn')
    if (state.turnPhase !== 'power_peek_self') throw new Error('Invalid phase')

    const newState = structuredClone(state)
    const player = newState.players[playerId]
    const card = player.hand.find(c => c.id === targetCardId)

    if (!card) throw new Error('Card not found in your hand')

    // Reveal the card to the player
    if (!card.knownBy) card.knownBy = []
    if (!card.knownBy.includes(playerId)) {
        card.knownBy.push(playerId)
    }

    // Transition to viewing phase
    newState.turnPhase = 'power_peek_viewing'
    player.viewingCardId = targetCardId
    newState.lastActionAt = new Date().toISOString()

    return newState
}

/**
 * Resolves the "Peek Opponent" power (8).
 */
export function resolvePowerPeekOpponent(state: GameState, playerId: string, targetCardId: string): GameState {
    if (!isValidMove(state, playerId)) throw new Error('Not your turn')
    if (state.turnPhase !== 'power_peek_opponent') throw new Error('Invalid phase')

    const newState = structuredClone(state)
    
    // Find the card in ANY opponent's hand
    let targetCard: Card | undefined

    for (const pid of Object.keys(newState.players)) {
        if (pid === playerId) continue
        const card = newState.players[pid].hand.find(c => c.id === targetCardId)
        if (card) {
            targetCard = card
            break
        }
    }

    if (!targetCard) throw new Error('Card not found in opponent hand')

    // Reveal the card to the player (me)
    if (!targetCard.knownBy) targetCard.knownBy = []
    if (!targetCard.knownBy.includes(playerId)) {
        targetCard.knownBy.push(playerId)
    }

    // Transition to viewing phase
    newState.turnPhase = 'power_peek_viewing'
    const player = newState.players[playerId]
    player.viewingCardId = targetCardId
    newState.lastActionAt = new Date().toISOString()

    return newState
}

/**
 * Finishes the peek viewing phase and ends the turn.
 */
export function finishPeek(state: GameState, playerId: string): GameState {
    if (!isValidMove(state, playerId)) throw new Error('Not your turn')
    if (state.turnPhase !== 'power_peek_viewing') throw new Error('Invalid phase')

    const newState = structuredClone(state)
    const player = newState.players[playerId]
    player.viewingCardId = null
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
  // It is known by the player who swapped it in (obviously)
  const newHandCard = { ...newState.drawnCard!, isFaceUp: false, knownBy: [playerId] }
  player.hand[targetIndex] = newHandCard
  
  // Old card goes to discard pile
  oldCard.isFaceUp = true
  newState.discardPile.push(oldCard)
  
  newState.drawnCard = null
  newState.drawnCardSource = null
  
  newState.lastGameAction = {
      playerId,
      actionType: 'swap',
      description: 'Swapped drawn card with hand'
  }

  return endTurn(newState)
}

/**
 * Skips the current power phase and ends the turn.
 * Valid for Power 9 (Blind Swap) as requested.
 */
export function skipPower(state: GameState, playerId: string): GameState {
    if (!isValidMove(state, playerId)) throw new Error('Not your turn')
    // Valid phases to skip: Blind Swap, maybe others if needed?
    if (state.turnPhase !== 'power_blind_swap') throw new Error('Cannot skip this phase')

    const newState = structuredClone(state)
    newState.lastGameAction = {
        playerId,
        actionType: 'power_skip',
        description: 'Skipped power action'
    }
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
