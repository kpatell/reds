import { describe, it, expect } from 'vitest'
import {
  initializeGame, drawCard, discardDrawnCard, swapCard, setPlayerReady,
  resolvePowerPeekSelf, resolvePowerPeekOpponent, finishPeek,
  resolvePowerBlindSwap, resolvePowerLookSwap, resolvePowerLookSwapDecision,
  skipPower,
} from './engine'
import type { GameState } from './types'

describe('Game Engine', () => {
  const players = [
    { id: 'p1', username: 'Player 1' },
    { id: 'p2', username: 'Player 2' }
  ]

  it('initializes game correctly', () => {
    const game = initializeGame('game-1', players)
    
    expect(game.id).toBe('game-1')
    expect(game.status).toBe('playing')
    expect(game.players['p1'].hand.length).toBe(4)
    expect(game.players['p2'].hand.length).toBe(4)
    expect(game.deck.length).toBe(54 - 8) // 54 - 8 dealt (no discard)
    expect(game.discardPile.length).toBe(0)
    expect(game.currentTurnPlayerId).toBe('p1')
    expect(game.turnPhase).toBe('peek')
    expect(game.drawnCard).toBeNull()
  })

  it('allows player to draw a card', () => {
    let game = initializeGame('game-1', players)
    // Transition to draw phase
    game = setPlayerReady(game, 'p1')
    game = setPlayerReady(game, 'p2')
    
    game = drawCard(game, 'p1', 'deck')

    expect(game.turnPhase).toBe('action')
    expect(game.drawnCard).toBeDefined()
    expect(game.deck.length).toBe(54 - 8 - 1)
  })

  it('allows player to discard drawn card', () => {
    let game = initializeGame('game-1', players)
    game = setPlayerReady(game, 'p1')
    game = setPlayerReady(game, 'p2')
    
    game = drawCard(game, 'p1', 'deck')
    // Force a non-power card to ensure standard discard behavior
    game.drawnCard = { ...game.drawnCard!, rank: '2' }
    const drawnCardId = game.drawnCard!.id
    
    game = discardDrawnCard(game, 'p1')

    expect(game.turnPhase).toBe('draw')
    expect(game.drawnCard).toBeNull()
    expect(game.currentTurnPlayerId).toBe('p2')
    expect(game.discardPile[game.discardPile.length - 1].id).toBe(drawnCardId)
  })

  it('allows player to swap card', () => {
    let game = initializeGame('game-1', players)
    game = setPlayerReady(game, 'p1')
    game = setPlayerReady(game, 'p2')

    const handCardId = game.players['p1'].hand[0]!.id

    game = drawCard(game, 'p1', 'deck')
    const drawnCardId = game.drawnCard!.id

    const newState2 = swapCard(game, 'p1', handCardId)

    expect(newState2.turnPhase).toBe('draw')
    expect(newState2.drawnCard).toBeNull()
    expect(newState2.currentTurnPlayerId).toBe('p2')

    // Check swap
    expect(newState2.players['p1'].hand[0]!.id).toBe(drawnCardId)
    expect(newState2.discardPile[newState2.discardPile.length - 1].id).toBe(handCardId)
  })
})

// ─── helpers ────────────────────────────────────────────────────────────────

const players = [
  { id: 'p1', username: 'Player 1' },
  { id: 'p2', username: 'Player 2' },
]

/** Returns a game state sitting in the given power phase after p1 drew and
 *  discarded a card of the specified rank. */
function setupPowerPhase(rank: '7' | '8' | '9' | '10'): GameState {
  let game = initializeGame('g', players)
  game = setPlayerReady(game, 'p1')
  game = setPlayerReady(game, 'p2')
  game = drawCard(game, 'p1', 'deck')
  game.drawnCard = { ...game.drawnCard!, rank }
  return discardDrawnCard(game, 'p1')
}

// ─── Power 7 — Peek Self ─────────────────────────────────────────────────────

describe('Power 7 — Peek Self', () => {
  it('transitions to power_peek_self phase on discard', () => {
    const game = setupPowerPhase('7')
    expect(game.turnPhase).toBe('power_peek_self')
    expect(game.drawnCard).toBeNull()
  })

  it('reveals the selected card to the peeking player', () => {
    let game = setupPowerPhase('7')
    const target = game.players['p1'].hand[0]!
    game = resolvePowerPeekSelf(game, 'p1', target.id)

    expect(game.turnPhase).toBe('power_peek_viewing')
    expect(game.players['p1'].viewingCardId).toBe(target.id)
    const card = game.players['p1'].hand.find(c => c?.id === target.id)
    expect(card?.knownBy).toContain('p1')
  })

  it('does not reveal the card to the opponent', () => {
    let game = setupPowerPhase('7')
    const target = game.players['p1'].hand[0]!
    game = resolvePowerPeekSelf(game, 'p1', target.id)

    const card = game.players['p1'].hand.find(c => c?.id === target.id)
    expect(card?.knownBy).not.toContain('p2')
  })

  it('ends p1 turn and passes to p2 after finishPeek', () => {
    let game = setupPowerPhase('7')
    const target = game.players['p1'].hand[0]!
    game = resolvePowerPeekSelf(game, 'p1', target.id)
    game = finishPeek(game, 'p1')

    expect(game.turnPhase).toBe('draw')
    expect(game.currentTurnPlayerId).toBe('p2')
    expect(game.players['p1'].viewingCardId).toBeNull()
  })

  it('throws when trying to peek an opponent card', () => {
    const game = setupPowerPhase('7')
    const oppCard = game.players['p2'].hand[0]!
    expect(() => resolvePowerPeekSelf(game, 'p1', oppCard.id)).toThrow('Card not found in your hand')
  })
})

// ─── Power 8 — Peek Opponent ─────────────────────────────────────────────────

describe('Power 8 — Peek Opponent', () => {
  it('transitions to power_peek_opponent phase on discard', () => {
    const game = setupPowerPhase('8')
    expect(game.turnPhase).toBe('power_peek_opponent')
  })

  it('reveals the opponent card to the peeking player, not the opponent', () => {
    let game = setupPowerPhase('8')
    const target = game.players['p2'].hand[0]!
    game = resolvePowerPeekOpponent(game, 'p1', target.id)

    expect(game.turnPhase).toBe('power_peek_viewing')
    expect(game.players['p1'].viewingCardId).toBe(target.id)
    const card = game.players['p2'].hand.find(c => c?.id === target.id)
    expect(card?.knownBy).toContain('p1')
    expect(card?.knownBy).not.toContain('p2')
  })

  it('ends the turn after finishPeek', () => {
    let game = setupPowerPhase('8')
    game = resolvePowerPeekOpponent(game, 'p1', game.players['p2'].hand[0]!.id)
    game = finishPeek(game, 'p1')

    expect(game.currentTurnPlayerId).toBe('p2')
    expect(game.turnPhase).toBe('draw')
  })

  it('throws when targeting own card', () => {
    const game = setupPowerPhase('8')
    const ownCard = game.players['p1'].hand[0]!
    expect(() => resolvePowerPeekOpponent(game, 'p1', ownCard.id)).toThrow('Card not found in opponent hand')
  })
})

// ─── Power 9 — Blind Swap ────────────────────────────────────────────────────

describe('Power 9 — Blind Swap', () => {
  it('transitions to power_blind_swap phase on discard', () => {
    const game = setupPowerPhase('9')
    expect(game.turnPhase).toBe('power_blind_swap')
  })

  it('first click sets swapSourceCardId and stays in phase', () => {
    let game = setupPowerPhase('9')
    const myCard = game.players['p1'].hand[0]!
    game = resolvePowerBlindSwap(game, 'p1', myCard.id)

    expect(game.players['p1'].swapSourceCardId).toBe(myCard.id)
    expect(game.turnPhase).toBe('power_blind_swap')
  })

  it('second click (opponent card) executes the swap and ends the turn', () => {
    let game = setupPowerPhase('9')
    const myCard = game.players['p1'].hand[0]!
    const oppCard = game.players['p2'].hand[0]!

    game = resolvePowerBlindSwap(game, 'p1', myCard.id)
    game = resolvePowerBlindSwap(game, 'p1', oppCard.id)

    expect(game.players['p1'].hand[0]?.id).toBe(oppCard.id)
    expect(game.players['p2'].hand[0]?.id).toBe(myCard.id)
    expect(game.players['p1'].swapSourceCardId).toBeNull()
    expect(game.turnPhase).toBe('draw')
    expect(game.currentTurnPlayerId).toBe('p2')
  })

  it('re-clicking own hand changes the source selection', () => {
    let game = setupPowerPhase('9')
    const first = game.players['p1'].hand[0]!
    const second = game.players['p1'].hand[1]!

    game = resolvePowerBlindSwap(game, 'p1', first.id)
    game = resolvePowerBlindSwap(game, 'p1', second.id)

    expect(game.players['p1'].swapSourceCardId).toBe(second.id)
    expect(game.turnPhase).toBe('power_blind_swap')
  })

  it('skipPower skips the swap and ends the turn', () => {
    let game = setupPowerPhase('9')
    game = skipPower(game, 'p1')

    expect(game.turnPhase).toBe('draw')
    expect(game.currentTurnPlayerId).toBe('p2')
    expect(game.lastGameAction?.actionType).toBe('power_skip')
  })
})

// ─── Power 10 — Look & Swap ──────────────────────────────────────────────────

describe('Power 10 — Look & Swap', () => {
  it('transitions to power_look_swap phase on discard', () => {
    const game = setupPowerPhase('10')
    expect(game.turnPhase).toBe('power_look_swap')
  })

  it('first click reveals own card and sets swapSourceCardId', () => {
    let game = setupPowerPhase('10')
    const myCard = game.players['p1'].hand[0]!
    game = resolvePowerLookSwap(game, 'p1', myCard.id)

    expect(game.players['p1'].swapSourceCardId).toBe(myCard.id)
    expect(game.turnPhase).toBe('power_look_swap')
    const card = game.players['p1'].hand.find(c => c?.id === myCard.id)
    expect(card?.knownBy).toContain('p1')
  })

  it('second click (opponent card) reveals it to the actor and transitions to decision', () => {
    let game = setupPowerPhase('10')
    const myCard = game.players['p1'].hand[0]!
    const oppCard = game.players['p2'].hand[0]!

    game = resolvePowerLookSwap(game, 'p1', myCard.id)
    game = resolvePowerLookSwap(game, 'p1', oppCard.id)

    expect(game.turnPhase).toBe('power_look_swap_decision')
    expect(game.players['p1'].viewingCardId).toBe(oppCard.id)
    const card = game.players['p2'].hand.find(c => c?.id === oppCard.id)
    expect(card?.knownBy).toContain('p1')
    expect(card?.knownBy).not.toContain('p2')
  })

  it('decision=swap executes the swap and ends the turn', () => {
    let game = setupPowerPhase('10')
    const myCard = game.players['p1'].hand[0]!
    const oppCard = game.players['p2'].hand[0]!

    game = resolvePowerLookSwap(game, 'p1', myCard.id)
    game = resolvePowerLookSwap(game, 'p1', oppCard.id)
    game = resolvePowerLookSwapDecision(game, 'p1', 'swap')

    expect(game.players['p1'].hand[0]?.id).toBe(oppCard.id)
    expect(game.players['p2'].hand[0]?.id).toBe(myCard.id)
    expect(game.currentTurnPlayerId).toBe('p2')
    expect(game.players['p1'].swapSourceCardId).toBeNull()
    expect(game.players['p1'].viewingCardId).toBeNull()
  })

  it('decision=keep leaves hands unchanged and ends the turn', () => {
    let game = setupPowerPhase('10')
    const myCard = game.players['p1'].hand[0]!
    const oppCard = game.players['p2'].hand[0]!

    game = resolvePowerLookSwap(game, 'p1', myCard.id)
    game = resolvePowerLookSwap(game, 'p1', oppCard.id)
    game = resolvePowerLookSwapDecision(game, 'p1', 'keep')

    expect(game.players['p1'].hand[0]?.id).toBe(myCard.id)
    expect(game.players['p2'].hand[0]?.id).toBe(oppCard.id)
    expect(game.currentTurnPlayerId).toBe('p2')
  })
})

// ─── Empty-deck reshuffle ────────────────────────────────────────────────────

describe('Empty-deck reshuffle', () => {
  it('reshuffles discard (minus top card) into deck after the last card is drawn', () => {
    let game = initializeGame('g', players)
    game = setPlayerReady(game, 'p1')
    game = setPlayerReady(game, 'p2')

    // Reduce deck to a single card so the next draw empties it
    game = { ...game, deck: game.deck.slice(0, 1) }
    game = {
      ...game,
      discardPile: [
        { id: 'old-1', suit: 'hearts',   rank: '3', value: 3,  isFaceUp: true },
        { id: 'old-2', suit: 'clubs',    rank: '5', value: 5,  isFaceUp: true },
        { id: 'top',   suit: 'spades',   rank: '2', value: 2,  isFaceUp: true },
      ],
    }

    game = drawCard(game, 'p1', 'deck')

    expect(game.deck.length).toBe(2)
    expect(game.discardPile).toHaveLength(1)
    expect(game.discardPile[0].id).toBe('top')
    const deckIds = new Set(game.deck.map(c => c.id))
    expect(deckIds.has('old-1')).toBe(true)
    expect(deckIds.has('old-2')).toBe(true)
    expect(deckIds.has('top')).toBe(false)
  })

  it('leaves deck empty when discard is also empty', () => {
    let game = initializeGame('g', players)
    game = setPlayerReady(game, 'p1')
    game = setPlayerReady(game, 'p2')

    game = { ...game, deck: game.deck.slice(0, 1), discardPile: [] }

    game = drawCard(game, 'p1', 'deck')

    expect(game.deck.length).toBe(0)
    expect(game.discardPile.length).toBe(0)
    expect(game.drawnCard).not.toBeNull()
  })

  it('leaves a single-card discard as the top card with empty deck', () => {
    let game = initializeGame('g', players)
    game = setPlayerReady(game, 'p1')
    game = setPlayerReady(game, 'p2')

    game = {
      ...game,
      deck: game.deck.slice(0, 1),
      discardPile: [{ id: 'only', suit: 'hearts', rank: '4', value: 4, isFaceUp: true }],
    }

    game = drawCard(game, 'p1', 'deck')

    // Only card was the top — nothing to recycle, deck stays empty
    expect(game.deck.length).toBe(0)
    expect(game.discardPile).toHaveLength(1)
    expect(game.discardPile[0].id).toBe('only')
  })
})

// ─── final_turn → reveal_pending transition ──────────────────────────────────

describe('final_turn → reveal_pending transition', () => {
  function setupFinalTurn(): GameState {
    let game = initializeGame('g', players)
    game = setPlayerReady(game, 'p1')
    game = setPlayerReady(game, 'p2')
    return { ...game, status: 'final_turn', currentTurnPlayerId: 'p1' }
  }

  it('transitions to reveal_pending after the final-turn player discards', () => {
    let game = setupFinalTurn()
    game = drawCard(game, 'p1', 'deck')
    game.drawnCard = { ...game.drawnCard!, rank: '2' }
    game = discardDrawnCard(game, 'p1')

    expect(game.status).toBe('reveal_pending')
    expect(game.currentTurnPlayerId).toBeNull()
    expect(game.turnPhase).toBe('draw')
    expect(game.revealVotes).toEqual([])
  })

  it('transitions to reveal_pending after the final-turn player swaps', () => {
    let game = setupFinalTurn()
    const handCardId = game.players['p1'].hand[0]!.id
    game = drawCard(game, 'p1', 'deck')
    game = swapCard(game, 'p1', handCardId)

    expect(game.status).toBe('reveal_pending')
    expect(game.currentTurnPlayerId).toBeNull()
  })

  it('transitions to reveal_pending after a power card is used on final_turn', () => {
    let game = setupFinalTurn()
    game = drawCard(game, 'p1', 'deck')
    game.drawnCard = { ...game.drawnCard!, rank: '7' }
    game = discardDrawnCard(game, 'p1')
    // Still in power phase — not yet reveal_pending
    expect(game.turnPhase).toBe('power_peek_self')
    expect(game.status).toBe('final_turn')

    // Finishing the power ends the final turn
    const target = game.players['p1'].hand[0]!
    game = resolvePowerPeekSelf(game, 'p1', target.id)
    game = finishPeek(game, 'p1')

    expect(game.status).toBe('reveal_pending')
    expect(game.currentTurnPlayerId).toBeNull()
  })

  it('does NOT transition to reveal_pending mid-turn on a normal playing turn', () => {
    let game = initializeGame('g', players)
    game = setPlayerReady(game, 'p1')
    game = setPlayerReady(game, 'p2')
    game = drawCard(game, 'p1', 'deck')
    game.drawnCard = { ...game.drawnCard!, rank: '2' }
    game = discardDrawnCard(game, 'p1')

    expect(game.status).toBe('playing')
    expect(game.currentTurnPlayerId).toBe('p2')
  })
})
