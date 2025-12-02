import { useParams } from 'react-router-dom'

export default function Game() {
    const { gameId } = useParams()

    return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-50">
            <div className="text-center">
                <h1 className="text-2xl font-bold mb-4">Game Room</h1>
                <p className="text-neutral-400">ID: {gameId}</p>
                <p className="mt-4 text-sm text-neutral-500">Waiting for opponent...</p>
            </div>
        </div>
    )
}
