import { cn } from '@/lib/utils'
import { Card } from '@/components/Card'
import { calculateHandScore } from '@/lib/game/scoring'
import type { Card as CardType, GameState, PlayerState } from '@/lib/game/types'

interface ShowdownOverlayProps {
  gameState: GameState
  currentUserId: string
  onVoteRematch: () => void
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
          className="w-16 h-24 rounded-xl border-2 border-dashed border-stone-300 opacity-40 shrink-0"
        />
      )
    }
    return <Card key={card.id} card={{ ...card, isFaceUp: true }} size="sm" className="shrink-0" />
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

export function ShowdownOverlay({ gameState, currentUserId, onVoteRematch }: ShowdownOverlayProps) {
  if (gameState.status !== 'finished') return null

  const me = gameState.players[currentUserId]
  const opponentId = Object.keys(gameState.players).find(id => id !== currentUserId)
  const opponent = opponentId ? gameState.players[opponentId] : null

  if (!me || !opponent) return null

  const myScore = calculateHandScore(me.hand)
  const opponentScore = calculateHandScore(opponent.hand)
  const iWin = gameState.winnerId === currentUserId
  const callerIsMe = gameState.callerId === currentUserId

  const rematchVotes = gameState.rematchVotes ?? []
  const myVote = rematchVotes.includes(currentUserId)
  const opponentVoted = opponentId ? rematchVotes.includes(opponentId) : false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
      <div className="bg-stone-100 rounded-2xl shadow-2xl w-[95vw] max-w-lg flex flex-col gap-4 p-5 border border-stone-300 my-auto">

        {/* Result banner */}
        <div className={cn(
          'rounded-xl py-3 text-center font-bold text-xl tracking-widest uppercase',
          iWin ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'
        )}>
          {iWin ? 'You Win!' : 'Opponent Wins'}
        </div>

        {/* REDS caller attribution */}
        <p className="text-center text-xs font-medium text-stone-500 -mt-1">
          {callerIsMe ? 'You' : opponent.username} called REDS
        </p>

        {/* Opponent hand */}
        <HandSection player={opponent} score={opponentScore} isWinner={!iWin} label={opponent.username} />

        <div className="border-t border-stone-300" />

        {/* My hand */}
        <HandSection player={me} score={myScore} isWinner={iWin} label="You" />

        {/* Consensus play-again */}
        <div className="flex flex-col gap-2">
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
              className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold text-sm uppercase tracking-wide focus-visible:ring-2 focus-visible:ring-red-400 transition-colors shadow-md"
            >
              Play Again
            </button>
          )}
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
    <div className="flex flex-col gap-3">
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
