import type { GameState, PlayerState, Card } from './types.ts'

export type PlayTurnAction =
  | { type: 'draw'; source: 'deck' | 'discard'; forceCardRank?: string }
  | { type: 'discard' }
  | { type: 'swap'; cardId: string }
  | { type: 'ready' }
  | { type: 'resolve_power'; targetCardId: string }
  | { type: 'finish_peek' }
  | { type: 'power_look_swap_decision'; decision: 'swap' | 'keep' }
  | { type: 'skip_power' }

export function applyAction(state: GameState, playerId: string, action: PlayTurnAction): GameState {
  switch (action.type) {
    case 'draw': return drawCard(state, playerId, action)
    case 'discard': return discardDrawnCard(state, playerId)
    case 'swap': return swapCard(state, playerId, action.cardId)
    case 'ready': return setPlayerReady(state, playerId)
    case 'resolve_power': return resolvePower(state, playerId, action.targetCardId)
    case 'finish_peek': return finishPeek(state, playerId)
    case 'power_look_swap_decision': return resolvePowerLookSwapDecision(state, playerId, action.decision)
    case 'skip_power': return skipPower(state, playerId)
    default: {
      const _exhaustive: never = action
      throw new Error(`Unknown action type`)
    }
  }
}

function resolvePower(state: GameState, playerId: string, targetCardId: string): GameState {
  switch (state.turnPhase) {
    case 'power_peek_self': return resolvePowerPeekSelf(state, playerId, targetCardId)
    case 'power_peek_opponent': return resolvePowerPeekOpponent(state, playerId, targetCardId)
    case 'power_blind_swap': return resolvePowerBlindSwap(state, playerId, targetCardId)
    case 'power_look_swap': return resolvePowerLookSwap(state, playerId, targetCardId)
    default: throw new Error(`Cannot resolve power in phase: ${state.turnPhase}`)
  }
}

function isValidMove(state: GameState, playerId: string): boolean {
  if (state.status !== 'playing' && state.status !== 'final_turn') return false
  if (state.currentTurnPlayerId !== playerId) return false
  if (state.pendingStackTransfer) return false
  return true
}

export function setPlayerReady(state: GameState, playerId: string): GameState {
  const newState = structuredClone(state)
  const player = newState.players[playerId]
  player.isReady = true

  const allReady = Object.values(newState.players).every((p: PlayerState) => p.isReady)
  if (allReady && newState.turnPhase === 'peek') {
    newState.turnPhase = 'draw'
  }

  newState.lastActionAt = new Date().toISOString()
  return newState
}

export function drawCard(state: GameState, playerId: string, action: { source: 'deck' | 'discard'; forceCardRank?: string }): GameState {
  if (!isValidMove(state, playerId)) throw new Error('Not your turn')
  if (state.turnPhase !== 'draw') throw new Error('Invalid phase')

  const { source, forceCardRank } = action
  const newState = structuredClone(state)
  let card: Card | undefined

  if (source === 'deck') {
    if (forceCardRank) {
      const needle = forceCardRank.trim().toLowerCase()
      const idx = newState.deck.findIndex((c: Card) => c.rank.toLowerCase() === needle)
      card = idx !== -1 ? newState.deck.splice(idx, 1)[0] : newState.deck.pop()
    } else {
      card = newState.deck.pop()
    }

    if (newState.deck.length === 0 && newState.discardPile.length > 0) {
      const topDiscard = newState.discardPile.pop()
      const cardsToRecycle = [...newState.discardPile]

      for (let i = cardsToRecycle.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cardsToRecycle[i], cardsToRecycle[j]] = [cardsToRecycle[j], cardsToRecycle[i]]
      }

      newState.deck = cardsToRecycle
      newState.discardPile = topDiscard ? [topDiscard] : []
    }
  } else {
    card = newState.discardPile.pop()
  }

  if (!card) throw new Error('Source is empty')

  newState.drawnCard = card
  newState.drawnCardSource = source
  newState.turnPhase = 'action'
  newState.lastGameAction = null
  newState.lastActionAt = new Date().toISOString()

  return newState
}

export function discardDrawnCard(state: GameState, playerId: string): GameState {
  if (!isValidMove(state, playerId)) throw new Error('Not your turn')
  if (state.turnPhase !== 'action') throw new Error('Invalid phase')
  if (!state.drawnCard) throw new Error('No card drawn')

  const newState = structuredClone(state)
  const card = newState.drawnCard!

  newState.discardPile.push(card)
  newState.drawnCard = null

  if (newState.drawnCardSource === 'discard') {
    newState.turnPhase = 'draw'
    newState.drawnCardSource = null
    newState.lastGameAction = null
    newState.lastActionAt = new Date().toISOString()
    return newState
  }

  const source = newState.drawnCardSource
  newState.drawnCardSource = null

  if (source === 'deck') {
    const opponentId = Object.keys(newState.players).find(id => id !== playerId)
    const playerHasCards = newState.players[playerId].hand.some((c: Card | null) => c !== null)
    const opponentHasCards = opponentId
      ? newState.players[opponentId].hand.some((c: Card | null) => c !== null)
      : false

    if (card.rank === '7' && playerHasCards) {
      newState.turnPhase = 'power_peek_self'
      newState.lastGameAction = null
      newState.lastActionAt = new Date().toISOString()
      return newState
    }
    if (card.rank === '8' && opponentHasCards) {
      newState.turnPhase = 'power_peek_opponent'
      newState.lastGameAction = null
      newState.lastActionAt = new Date().toISOString()
      return newState
    }
    if (card.rank === '9' && playerHasCards && opponentHasCards) {
      newState.turnPhase = 'power_blind_swap'
      newState.lastGameAction = null
      newState.lastActionAt = new Date().toISOString()
      return newState
    }
    if (card.rank === '10' && playerHasCards && opponentHasCards) {
      newState.turnPhase = 'power_look_swap'
      newState.lastGameAction = null
      newState.lastActionAt = new Date().toISOString()
      return newState
    }
  }

  return endTurn(newState)
}

export function resolvePowerBlindSwap(state: GameState, playerId: string, targetCardId: string): GameState {
  if (!isValidMove(state, playerId)) throw new Error('Not your turn')
  if (state.turnPhase !== 'power_blind_swap') throw new Error('Invalid phase')

  const newState = structuredClone(state)
  const player = newState.players[playerId]

  if (!player.swapSourceCardId) {
    const card = player.hand.find((c: Card | null) => c?.id === targetCardId)
    if (!card) throw new Error('Must select one of your own cards first')
    player.swapSourceCardId = targetCardId
    newState.lastActionAt = new Date().toISOString()
    return newState
  }

  let opponentId: string | undefined
  let opponentCardIndex = -1

  for (const pid of Object.keys(newState.players)) {
    if (pid === playerId) continue
    const idx = newState.players[pid].hand.findIndex((c: Card | null) => c?.id === targetCardId)
    if (idx !== -1) {
      opponentId = pid
      opponentCardIndex = idx
      break
    }
  }

  if (!opponentId || opponentCardIndex === -1) {
    const myCard = player.hand.find((c: Card | null) => c?.id === targetCardId)
    if (myCard) {
      player.swapSourceCardId = targetCardId
      newState.lastActionAt = new Date().toISOString()
      return newState
    }
    throw new Error('Must select an opponent card to swap with')
  }

  const opponent = newState.players[opponentId]
  const myCardIndex = player.hand.findIndex((c: Card | null) => c?.id === player.swapSourceCardId)
  if (myCardIndex === -1) throw new Error('Selected source card not found')

  const myCard = player.hand[myCardIndex]
  const opponentCard = opponent.hand[opponentCardIndex]

  player.hand[myCardIndex] = opponentCard
  opponent.hand[opponentCardIndex] = myCard

  newState.lastGameAction = {
    playerId,
    actionType: 'power_blind_swap',
    description: 'Swapped cards (Blind Swap)',
    metadata: {
      swapSourceCardId: player.swapSourceCardId,
      swapTargetCardId: targetCardId,
      highlightedCardIds: [player.swapSourceCardId!, targetCardId],
    },
  }

  player.swapSourceCardId = null
  return endTurn(newState)
}

export function resolvePowerLookSwap(state: GameState, playerId: string, targetCardId: string): GameState {
  if (!isValidMove(state, playerId)) throw new Error('Not your turn')
  if (state.turnPhase !== 'power_look_swap') throw new Error('Invalid phase')

  const newState = structuredClone(state)
  const player = newState.players[playerId]

  if (!player.swapSourceCardId) {
    const card = player.hand.find((c: Card | null) => c?.id === targetCardId)
    if (!card) throw new Error('Must select one of your own cards first')
    if (!card.knownBy) card.knownBy = []
    if (!card.knownBy.includes(playerId)) card.knownBy.push(playerId)
    player.swapSourceCardId = targetCardId
    player.viewingCardId = targetCardId
    newState.lastActionAt = new Date().toISOString()
    return newState
  }

  let opponentId: string | undefined
  let opponentCard: Card | undefined

  for (const pid of Object.keys(newState.players)) {
    if (pid === playerId) continue
    const card = newState.players[pid].hand.find((c: Card | null) => c?.id === targetCardId)
    if (card) {
      opponentId = pid
      opponentCard = card
      break
    }
  }

  if (!opponentId || !opponentCard) {
    const myCard = player.hand.find((c: Card | null) => c?.id === targetCardId)
    if (myCard) {
      if (!myCard.knownBy) myCard.knownBy = []
      if (!myCard.knownBy.includes(playerId)) myCard.knownBy.push(playerId)
      player.swapSourceCardId = targetCardId
      newState.lastActionAt = new Date().toISOString()
      return newState
    }
    throw new Error('Must select an opponent card')
  }

  if (!opponentCard.knownBy) opponentCard.knownBy = []
  if (!opponentCard.knownBy.includes(playerId)) opponentCard.knownBy.push(playerId)

  newState.turnPhase = 'power_look_swap_decision'
  player.viewingCardId = targetCardId
  newState.lastActionAt = new Date().toISOString()
  newState.lastGameAction = {
    playerId,
    actionType: 'power_look_swap',
    description: 'Looking at cards to swap',
    metadata: { highlightedCardIds: [player.swapSourceCardId!, targetCardId] },
  }

  return newState
}

export function resolvePowerLookSwapDecision(state: GameState, playerId: string, action: 'swap' | 'keep'): GameState {
  if (!isValidMove(state, playerId)) throw new Error('Not your turn')
  if (state.turnPhase !== 'power_look_swap_decision') throw new Error('Invalid phase')

  const newState = structuredClone(state)
  const player = newState.players[playerId]

  if (!player.swapSourceCardId || !player.viewingCardId) throw new Error('Invalid state for decision')

  if (action === 'swap') {
    const myCardIndex = player.hand.findIndex((c: Card | null) => c?.id === player.swapSourceCardId)
    let opponentId: string | undefined
    let opponentCardIndex = -1

    for (const pid of Object.keys(newState.players)) {
      if (pid === playerId) continue
      const idx = newState.players[pid].hand.findIndex((c: Card | null) => c?.id === player.viewingCardId)
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
      player.hand[myCardIndex] = opponentCard
      opponent.hand[opponentCardIndex] = myCard
    }
  }

  const sourceId = player.swapSourceCardId
  const targetId = player.viewingCardId

  player.swapSourceCardId = null
  player.viewingCardId = null

  newState.lastGameAction = {
    playerId,
    actionType: 'power_look_swap',
    description: action === 'swap' ? 'Swapped cards (Look & Swap)' : 'Kept own card (Look & Swap)',
    metadata: { highlightedCardIds: sourceId && targetId ? [sourceId, targetId] : [] },
  }

  return endTurn(newState)
}

export function resolvePowerPeekSelf(state: GameState, playerId: string, targetCardId: string): GameState {
  if (!isValidMove(state, playerId)) throw new Error('Not your turn')
  if (state.turnPhase !== 'power_peek_self') throw new Error('Invalid phase')

  const newState = structuredClone(state)
  const player = newState.players[playerId]
  const card = player.hand.find((c: Card | null) => c?.id === targetCardId)

  if (!card) throw new Error('Card not found in your hand')

  if (!card.knownBy) card.knownBy = []
  if (!card.knownBy.includes(playerId)) card.knownBy.push(playerId)

  newState.turnPhase = 'power_peek_viewing'
  player.viewingCardId = targetCardId
  newState.lastActionAt = new Date().toISOString()
  newState.lastGameAction = {
    playerId,
    actionType: 'power_peek_self',
    description: 'Peeking at own card',
    metadata: { highlightedCardIds: [targetCardId] },
  }

  return newState
}

export function resolvePowerPeekOpponent(state: GameState, playerId: string, targetCardId: string): GameState {
  if (!isValidMove(state, playerId)) throw new Error('Not your turn')
  if (state.turnPhase !== 'power_peek_opponent') throw new Error('Invalid phase')

  const newState = structuredClone(state)
  let targetCard: Card | undefined

  for (const pid of Object.keys(newState.players)) {
    if (pid === playerId) continue
    const card = newState.players[pid].hand.find((c: Card | null) => c?.id === targetCardId)
    if (card) {
      targetCard = card
      break
    }
  }

  if (!targetCard) throw new Error('Card not found in opponent hand')

  if (!targetCard.knownBy) targetCard.knownBy = []
  if (!targetCard.knownBy.includes(playerId)) targetCard.knownBy.push(playerId)

  newState.turnPhase = 'power_peek_viewing'
  newState.players[playerId].viewingCardId = targetCardId
  newState.lastActionAt = new Date().toISOString()

  return newState
}

export function finishPeek(state: GameState, playerId: string): GameState {
  if (!isValidMove(state, playerId)) throw new Error('Not your turn')
  if (state.turnPhase !== 'power_peek_viewing') throw new Error('Invalid phase')

  const newState = structuredClone(state)
  newState.players[playerId].viewingCardId = null
  newState.lastGameAction = null
  return endTurn(newState)
}

export function swapCard(state: GameState, playerId: string, targetCardId: string): GameState {
  if (!isValidMove(state, playerId)) throw new Error('Not your turn')
  if (state.turnPhase !== 'action') throw new Error('Invalid phase')
  if (!state.drawnCard) throw new Error('No card drawn')

  const newState = structuredClone(state)
  const player = newState.players[playerId]
  const targetIndex = player.hand.findIndex((c: Card | null) => c?.id === targetCardId)

  if (targetIndex === -1) throw new Error('Card not found in hand')

  const oldCard = player.hand[targetIndex]
  if (!oldCard) throw new Error('Card is null')

  const newHandCard: Card = { ...newState.drawnCard!, isFaceUp: false, knownBy: [playerId] }
  player.hand[targetIndex] = newHandCard

  oldCard.isFaceUp = true
  newState.discardPile.push(oldCard)

  newState.drawnCard = null
  newState.drawnCardSource = null
  newState.lastGameAction = {
    playerId,
    actionType: 'swap',
    description: 'Swapped drawn card with hand',
    metadata: { highlightedCardIds: [newHandCard.id] },
  }

  return endTurn(newState)
}

export function skipPower(state: GameState, playerId: string): GameState {
  if (!isValidMove(state, playerId)) throw new Error('Not your turn')
  if (state.turnPhase !== 'power_blind_swap') throw new Error('Cannot skip this phase')

  const newState = structuredClone(state)
  newState.lastGameAction = {
    playerId,
    actionType: 'power_skip',
    description: 'Skipped power action',
  }
  return endTurn(newState)
}

function endTurn(state: GameState): GameState {
  if (state.status === 'final_turn') {
    state.status = 'reveal_pending'
    state.currentTurnPlayerId = null
    state.turnPhase = 'draw'
    state.revealVotes = []
    state.lastActionAt = new Date().toISOString()
    return state
  }

  const playerIds = Object.keys(state.players).sort()
  const currentIndex = playerIds.indexOf(state.currentTurnPlayerId!)
  const nextIndex = (currentIndex + 1) % playerIds.length
  const nextPlayerId = playerIds[nextIndex]
  const nextPlayer = state.players[nextPlayerId]

  state.currentTurnPlayerId = nextPlayerId
  state.turnPhase = 'draw'
  state.lastActionAt = new Date().toISOString()

  // If the next player has no cards remaining, auto-call REDS on their behalf
  // so they are never stuck with a turn they literally cannot play.
  if (!nextPlayer.hand.some((c: Card | null) => c !== null)) {
    const afterNextIndex = (nextIndex + 1) % playerIds.length
    state.status = 'final_turn'
    state.callerId = nextPlayerId
    state.currentTurnPlayerId = playerIds[afterNextIndex]
    state.lastGameAction = {
      playerId: nextPlayerId,
      actionType: 'call_reds',
      description: `${nextPlayer.username} has no cards — REDS called automatically!`,
    }
  }

  return state
}
