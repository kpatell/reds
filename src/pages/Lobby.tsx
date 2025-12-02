import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { Modal } from '@/components/Modal'
import type { Database } from '@/types/supabase'

type Game = Database['public']['Tables']['games']['Row']
type GameInsert = Database['public']['Tables']['games']['Insert']

export default function Lobby() {
    const navigate = useNavigate()
    const { user, signInAnonymously, loading: authLoading } = useAuth()
    const [isCreating, setIsCreating] = useState(false)
    const [games, setGames] = useState<Game[]>([])
    const [loadingGames, setLoadingGames] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchGames()

        const channel = supabase
            .channel('public:games')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'games', filter: 'status=eq.waiting' },
                () => fetchGames()
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    const fetchGames = async () => {
        const { data } = await supabase
            .from('games')
            .select('*')
            .eq('status', 'waiting')
            .order('created_at', { ascending: false })

        if (data) setGames(data)
        setLoadingGames(false)
    }

    const handleCreateGame = async () => {
        if (!user) {
            try {
                await signInAnonymously()
                const { data: { user: newUser }, error: authError } = await supabase.auth.getUser()
                if (authError || !newUser) {
                    throw new Error('Could not sign in anonymously. Please ensure Anonymous Auth is enabled in your Supabase project settings.')
                }
            } catch (err: any) {
                setError(err.message || 'Failed to sign in')
                return
            }
        }

        setIsCreating(true)
        try {
            const newGame: GameInsert = {
                status: 'waiting',
                players: {},
            }

            const { data, error } = await supabase
                .from('games')
                .insert(newGame as any)
                .select()
                .single()

            if (error) throw error
            if (data) {
                navigate(`/game/${(data as unknown as Game).id}`)
            }
        } catch (error: any) {
            console.error('Error creating game:', error)
            setError(error.message || 'Failed to create game')
        } finally {
            setIsCreating(false)
        }
    }

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-50">
                <Loader2 className="w-8 h-8 animate-spin text-red-500" />
            </div>
        )
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-neutral-950 text-neutral-50">
            <Modal
                isOpen={!!error}
                onClose={() => setError(null)}
                title="Error"
            >
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3 text-red-400">
                        <AlertCircle className="w-6 h-6" />
                        <p className="text-sm">{error}</p>
                    </div>
                    <button
                        onClick={() => setError(null)}
                        className="w-full bg-neutral-800 hover:bg-neutral-700 text-white py-2 rounded-lg transition-colors"
                    >
                        Close
                    </button>
                </div>
            </Modal>

            <div className="max-w-md w-full space-y-8">
                <div className="text-center">
                    <h1 className="text-4xl font-bold tracking-tight text-red-500 mb-2">Reds</h1>
                    <p className="text-neutral-400">A strategic card game for two players.</p>
                    {!user && (
                        <p className="text-sm text-yellow-500 mt-2">
                            You are playing as Guest.
                        </p>
                    )}
                </div>

                <div className="space-y-4">
                    <button
                        onClick={handleCreateGame}
                        disabled={isCreating}
                        className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors cursor-pointer"
                    >
                        {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                        Create Game
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-neutral-800" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-neutral-950 px-2 text-neutral-500">Or join a game</span>
                        </div>
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {loadingGames ? (
                            <div className="text-center text-neutral-500 py-4">Loading games...</div>
                        ) : games.length === 0 ? (
                            <div className="text-center text-neutral-500 py-4">No games found. Create one!</div>
                        ) : (
                            games.map((game) => (
                                <button
                                    key={game.id}
                                    onClick={() => navigate(`/game/${game.id}`)}
                                    className="w-full flex items-center justify-between bg-neutral-900 hover:bg-neutral-800 text-white p-4 rounded-lg transition-colors border border-neutral-800 cursor-pointer"
                                >
                                    <span className="font-mono text-sm">{game.id.slice(0, 8)}...</span>
                                    <span className="text-xs bg-green-900/30 text-green-400 px-2 py-1 rounded">
                                        Waiting
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
