import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/Card'
import { calculateHandScore } from '@/lib/game/scoring'
import type { Card as CardType, GameState, PlayerState } from '@/lib/game/types'

interface ShowdownOverlayProps {
  gameState: GameState
  currentUserId: string
  onVoteRematch: () => void
  onLeave: () => void
}

// Same split logic as PlayerHand.tsx — top row: 0,1,4,6,… / bottom row: 2,3,5,7,…
function splitIntoRows(length: number): [number[], number[]] {
  const top: number[] = []
  const bottom: number[] = []
  for (let i = 0; i < length; i++) {
    if (i < 2) top.push(i)
    else if (i < 4) bottom.push(i)
    else if (i % 2 === 0) top.push(i)
    else bottom.push(i)
  }
  return [top, bottom]
}

function HandGrid({ hand }: { hand: (CardType | null)[] }) {
  // Mirror the normalization PlayerHand applies
  const visualHand: (CardType | null)[] = [...hand]
  while (visualHand.length < 4) visualHand.push(null)
  while (visualHand.length > 4 && visualHand[visualHand.length - 1] === null) visualHand.pop()
  if (visualHand.length % 2 !== 0) visualHand.push(null)

  const [topIndices, bottomIndices] = splitIntoRows(visualHand.length)

  const renderSlot = (index: number) => {
    const card = visualHand[index]
    if (!card) {
      return (
        <div
          key={`empty-${index}`}
          className="h-[var(--card-h)] aspect-[2/3] sm:h-24 sm:w-16 sm:aspect-auto rounded-xl border-2 border-dashed border-stone-300 opacity-40 shrink-0"
        />
      )
    }
    return <Card key={card.id} card={{ ...card, isFaceUp: true }} className="shrink-0 cursor-default sm:h-24 sm:w-16 sm:aspect-auto" />
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex flex-col gap-1.5 w-fit mx-auto">
        <div className="flex gap-1.5">
          {topIndices.map(renderSlot)}
        </div>
        <div className="flex gap-1.5">
          {bottomIndices.map(renderSlot)}
        </div>
      </div>
    </div>
  )
}

interface FrozenState {
  players: Record<string, PlayerState>
  winnerId: string | null
  callerId: string | null
}

export function ShowdownOverlay({ gameState, currentUserId, onVoteRematch, onLeave }: ShowdownOverlayProps) {
  // Frozen snapshot of the game state the moment it first enters 'finished'.
  // Once set, it's never downgraded — protects against the opponent leaving and
  // triggering a realtime update that removes them from gameState.players.
  const [frozen, setFrozen] = useState<FrozenState | null>(null)

  useEffect(() => {
    if (gameState.status === 'finished') {
      setFrozen(prev => {
        if (!prev) {
          // Initial capture
          return { players: gameState.players, winnerId: gameState.winnerId, callerId: gameState.callerId ?? null }
        }
        // Upgrade if this update has more players (e.g. snapshot arrived before opponent left)
        return Object.keys(gameState.players).length > Object.keys(prev.players).length
          ? { players: gameState.players, winnerId: gameState.winnerId, callerId: gameState.callerId ?? null }
          : prev
      })
    } else {
      // New round started — clear snapshot
      setFrozen(null)
    }
  }, [gameState.status, gameState.players, gameState.winnerId, gameState.callerId])

  if (gameState.status !== 'finished') return null

  // Use frozen players for display; fall back to live state if snapshot not yet set
  const displayPlayers = frozen?.players ?? gameState.players
  const displayWinnerId = frozen?.winnerId ?? gameState.winnerId
  const displayCallerId = frozen?.callerId ?? gameState.callerId

  const me = displayPlayers[currentUserId]
  const frozenOpponentId = Object.keys(displayPlayers).find(id => id !== currentUserId)
  const displayOpponent = frozenOpponentId ? displayPlayers[frozenOpponentId] : null

  if (!me) return null

  // Live game state drives interactive elements only
  const liveOpponentId = Object.keys(gameState.players).find(id => id !== currentUserId)
  const opponentLeft = !liveOpponentId

  const myScore = calculateHandScore(me.hand)
  const opponentScore = displayOpponent ? calculateHandScore(displayOpponent.hand) : 0
  const iWin = displayWinnerId === currentUserId
  const callerIsMe = displayCallerId === currentUserId

  const rematchVotes = gameState.rematchVotes ?? []
  const myVote = rematchVotes.includes(currentUserId)
  const opponentVoted = liveOpponentId ? rematchVotes.includes(liveOpponentId) : false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
      <div className="card-game bg-stone-100 rounded-2xl shadow-2xl w-[95vw] max-w-lg flex flex-col gap-2 sm:gap-3 p-3 sm:p-5 border border-stone-300 my-auto">

        {/* Result banner */}
        <div className={cn(
          'rounded-xl py-2 sm:py-3 text-center font-bold text-lg sm:text-xl tracking-widest uppercase',
          iWin ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'
        )}>
          {iWin ? 'You Win!' : 'Opponent Wins'}
        </div>

        {/* REDS caller attribution */}
        <p className="text-center text-xs font-medium text-stone-500 -mt-1">
          {callerIsMe ? 'You' : (displayOpponent?.username ?? 'Opponent')} called REDS
        </p>

        {/* Opponent hand */}
        {displayOpponent ? (
          <HandSection player={displayOpponent} score={opponentScore} isWinner={!iWin} label={displayOpponent.username} />
        ) : (
          <div className="text-center text-sm text-stone-400 py-6 border-2 border-dashed border-stone-300 rounded-xl">
            Opponent left the game
          </div>
        )}

        <div className="border-t border-stone-300" />

        {/* My hand */}
        <HandSection player={me} score={myScore} isWinner={iWin} label="You" />

        {/* Consensus play-again */}
        <div className="flex flex-col gap-2">
          {opponentLeft ? (
            <p className="text-center text-sm font-bold text-slate-900 bg-stone-200 border border-stone-300 rounded-xl py-3 px-4">
              Opponent has left the game
            </p>
          ) : (
            <>
              {opponentVoted && !myVote && (
                <p className="text-center text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg py-1.5 px-3">
                  Opponent wants to play again!
                </p>
              )}
              {myVote ? (
                <div className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-wide text-center text-stone-400 bg-stone-100 border border-stone-200 cursor-not-allowed select-none">
                  Waiting for opponent...
                </div>
              ) : (
                <button
                  onClick={onVoteRematch}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold text-sm uppercase tracking-wide focus-visible:ring-2 focus-visible:ring-red-400 transition-colors shadow-md cursor-pointer"
                >
                  Play Again
                </button>
              )}
            </>
          )}
          <button
            onClick={onLeave}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-stone-600 hover:text-stone-900 bg-transparent hover:bg-stone-200 border border-stone-300 transition-colors cursor-pointer"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    </div>
  )
}

function HandSection({ player, score, isWinner, label }: {
  player: PlayerState
  score: number
  isWinner: boolean
  label: string
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-stone-600">{label}</span>
        <span className={cn('text-xl font-bold', isWinner ? 'text-red-600' : 'text-slate-900')}>
          {score} <span className="text-xs font-medium text-stone-500">pts</span>
        </span>
      </div>
      <HandGrid hand={player.hand} />
    </div>
  )
}
