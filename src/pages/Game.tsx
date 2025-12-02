import { useParams } from 'react-router-dom'

export default function Game() {
    const { gameId } = useParams()

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                <h1 className="text-2xl font-bold mb-4 text-[var(--color-text-main)]">Game Room</h1>
                <p className="text-[var(--color-text-muted)] font-mono bg-[var(--color-surface)] px-3 py-1 rounded border border-[var(--color-border)] inline-block">ID: {gameId}</p>
                <p className="mt-4 text-sm text-[var(--color-text-muted)] animate-pulse">Waiting for opponent...</p>
            </div>
        </div>
    )
}
