import { describe, it, expect } from 'vitest'
import { initializeGame, drawCard, discardDrawnCard, swapCard } from './engine'

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
    expect(game.deck.length).toBe(54 - 8 - 1) // 54 - 8 dealt - 1 discard
    expect(game.discardPile.length).toBe(1)
    expect(game.currentTurnPlayerId).toBe('p1')
    expect(game.turnPhase).toBe('draw')
    expect(game.drawnCard).toBeNull()
  })

  it('allows player to draw a card', () => {
    let game = initializeGame('game-1', players)
    game = drawCard(game, 'p1', 'deck')

    expect(game.turnPhase).toBe('action')
    expect(game.drawnCard).toBeDefined()
    expect(game.deck.length).toBe(54 - 8 - 1 - 1)
  })

  it('allows player to discard drawn card', () => {
    let game = initializeGame('game-1', players)
    game = drawCard(game, 'p1', 'deck')
    const drawnCardId = game.drawnCard!.id
    
    game = discardDrawnCard(game, 'p1')

    expect(game.turnPhase).toBe('draw')
    expect(game.drawnCard).toBeNull()
    expect(game.currentTurnPlayerId).toBe('p2')
    expect(game.discardPile[game.discardPile.length - 1].id).toBe(drawnCardId)
  })

  it('allows player to swap card', () => {
    let game = initializeGame('game-1', players)
    const handCardId = game.players['p1'].hand[0].id
    
    game = drawCard(game, 'p1', 'deck')
    const drawnCardId = game.drawnCard!.id
    
    game = swapCard(game, 'p1', handCardId)

    expect(game.turnPhase).toBe('draw')
    expect(game.drawnCard).toBeNull()
    expect(game.currentTurnPlayerId).toBe('p2')
    
    // Check swap
    expect(game.players['p1'].hand[0].id).toBe(drawnCardId)
    expect(game.discardPile[game.discardPile.length - 1].id).toBe(handCardId)
  })
})
