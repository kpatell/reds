import { describe, it, expect } from 'vitest'
import { getCardScore, calculateHandScore, determineWinner, CARD_POINTS } from './scoring'
import type { Card, PlayerState } from './types'

function makeCard(rank: Card['rank'], suit: Card['suit']): Card {
  return { id: `${rank}-${suit}`, suit, rank, value: 0, isFaceUp: false }
}

function makePlayer(id: string, hand: (Card | null)[]): PlayerState {
  return { id, username: id, hand, isReady: true, hasCalledReds: false, roundsWon: 0 }
}

describe('getCardScore', () => {
  it('scores Joker as 0', () => {
    expect(getCardScore(makeCard('Joker', 'joker'))).toBe(CARD_POINTS.JOKER)
  })

  it('scores Ace as 1', () => {
    expect(getCardScore(makeCard('A', 'spades'))).toBe(CARD_POINTS.ACE)
  })

  it.each([2, 3, 4, 5, 6, 7, 8, 9, 10] as const)('scores %d as face value', (n) => {
    expect(getCardScore(makeCard(String(n) as Card['rank'], 'clubs'))).toBe(n)
  })

  it('scores Jack as 11', () => {
    expect(getCardScore(makeCard('J', 'diamonds'))).toBe(CARD_POINTS.JACK)
  })

  it('scores Queen as 12', () => {
    expect(getCardScore(makeCard('Q', 'hearts'))).toBe(CARD_POINTS.QUEEN)
  })

  it('scores red King (hearts) as -2', () => {
    expect(getCardScore(makeCard('K', 'hearts'))).toBe(CARD_POINTS.KING_RED)
  })

  it('scores red King (diamonds) as -2', () => {
    expect(getCardScore(makeCard('K', 'diamonds'))).toBe(CARD_POINTS.KING_RED)
  })

  it('scores black King (spades) as 13', () => {
    expect(getCardScore(makeCard('K', 'spades'))).toBe(CARD_POINTS.KING_BLACK)
  })

  it('scores black King (clubs) as 13', () => {
    expect(getCardScore(makeCard('K', 'clubs'))).toBe(CARD_POINTS.KING_BLACK)
  })
})

describe('calculateHandScore', () => {
  it('returns 0 for an empty hand', () => {
    expect(calculateHandScore([])).toBe(0)
  })

  it('skips null slots', () => {
    expect(calculateHandScore([null, makeCard('A', 'spades'), null])).toBe(1)
  })

  it('sums all card scores correctly', () => {
    const hand: (Card | null)[] = [
      makeCard('A', 'spades'),   // 1
      makeCard('5', 'hearts'),   // 5
      makeCard('K', 'hearts'),   // -2
      makeCard('K', 'spades'),   // 13
    ]
    expect(calculateHandScore(hand)).toBe(17)
  })

  it('handles a hand of all nulls', () => {
    expect(calculateHandScore([null, null, null, null])).toBe(0)
  })

  it('scores a hand of all Jokers as 0', () => {
    const hand = [makeCard('Joker', 'joker'), makeCard('Joker', 'joker')]
    expect(calculateHandScore(hand)).toBe(0)
  })
})

describe('determineWinner', () => {
  it('caller wins when their score is strictly less', () => {
    const players = {
      caller:   makePlayer('caller',   [makeCard('A', 'spades'), makeCard('2', 'clubs')]),    // 3
      opponent: makePlayer('opponent', [makeCard('5', 'hearts'), makeCard('6', 'diamonds')]), // 11
    }
    const { winnerId, scores } = determineWinner(players, 'caller')
    expect(winnerId).toBe('caller')
    expect(scores['caller']).toBe(3)
    expect(scores['opponent']).toBe(11)
  })

  it('opponent wins when caller score is higher', () => {
    const players = {
      caller:   makePlayer('caller',   [makeCard('K', 'spades'), makeCard('Q', 'clubs')]),    // 25
      opponent: makePlayer('opponent', [makeCard('2', 'hearts'), makeCard('3', 'diamonds')]), // 5
    }
    const { winnerId } = determineWinner(players, 'caller')
    expect(winnerId).toBe('opponent')
  })

  it('opponent wins on a tie — non-caller wins ties', () => {
    const players = {
      caller:   makePlayer('caller',   [makeCard('5', 'spades'), makeCard('5', 'clubs')]),    // 10
      opponent: makePlayer('opponent', [makeCard('5', 'hearts'), makeCard('5', 'diamonds')]), // 10
    }
    const { winnerId } = determineWinner(players, 'caller')
    expect(winnerId).toBe('opponent')
  })

  it('correctly uses suit to distinguish red vs black Kings', () => {
    const players = {
      caller:   makePlayer('caller',   [makeCard('K', 'hearts'), makeCard('K', 'diamonds')]),   // -4
      opponent: makePlayer('opponent', [makeCard('A', 'spades'),  makeCard('A', 'clubs')]),      //  2
    }
    const { winnerId, scores } = determineWinner(players, 'caller')
    expect(scores['caller']).toBe(-4)
    expect(winnerId).toBe('caller')
  })

  it('handles null slots in both hands', () => {
    const players = {
      caller:   makePlayer('caller',   [makeCard('A', 'spades'), null]),  // 1
      opponent: makePlayer('opponent', [makeCard('2', 'hearts'), null]),  // 2
    }
    const { winnerId } = determineWinner(players, 'caller')
    expect(winnerId).toBe('caller')
  })
})
