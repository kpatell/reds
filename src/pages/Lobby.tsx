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
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
            </div>
        )
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
            <Modal
                isOpen={!!error}
                onClose={() => setError(null)}
                title="Error"
            >
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3 text-red-600">
                        <AlertCircle className="w-6 h-6" />
                        <p className="text-sm">{error}</p>
                    </div>
                    <button
                        onClick={() => setError(null)}
                        className="w-full bg-[var(--color-text-main)] hover:bg-neutral-800 text-white py-2 rounded-lg transition-colors"
                    >
                        Close
                    </button>
                </div>
            </Modal>

            <div className="max-w-md w-full space-y-8">
                <div className="text-center">
                    <h1 className="text-5xl font-bold tracking-tighter text-[var(--color-primary)] mb-2 font-serif">REDS</h1>
                    <p className="text-[var(--color-text-muted)]">A strategic card game for two players.</p>
                    {!user && (
                        <p className="text-sm text-amber-600 mt-2 font-medium bg-amber-50 inline-block px-3 py-1 rounded-full border border-amber-100">
                            Playing as Guest
                        </p>
                    )}
                </div>

                <div className="space-y-4">
                    <button
                        onClick={handleCreateGame}
                        disabled={isCreating}
                        className="w-full flex items-center justify-center gap-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-xl shadow-sm transition-all active:scale-[0.98] cursor-pointer"
                    >
                        {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                        Create New Game
                    </button>

                    <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-[var(--color-border)]" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase tracking-wider">
                            <span className="bg-[var(--color-background)] px-2 text-[var(--color-text-muted)]">Or join existing</span>
                        </div>
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                        {loadingGames ? (
                            <div className="text-center text-[var(--color-text-muted)] py-8">Loading games...</div>
                        ) : games.length === 0 ? (
                            <div className="text-center py-8 border-2 border-dashed border-[var(--color-border)] rounded-xl">
                                <p className="text-[var(--color-text-muted)]">No games found.</p>
                                <p className="text-sm text-[var(--color-text-muted)] opacity-70">Be the first to create one!</p>
                            </div>
                        ) : (
                            games.map((game) => (
                                <button
                                    key={game.id}
                                    onClick={() => navigate(`/game/${game.id}`)}
                                    className="w-full flex items-center justify-between bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] p-4 rounded-xl transition-all border border-[var(--color-border)] shadow-sm hover:shadow-md cursor-pointer group"
                                >
                                    <div className="flex flex-col items-start">
                                        <span className="font-mono text-xs text-[var(--color-text-muted)]">GAME ID</span>
                                        <span className="font-medium text-[var(--color-text-main)] group-hover:text-[var(--color-primary)] transition-colors">
                                            {game.id.slice(0, 8)}
                                        </span>
                                    </div>
                                    <span className="text-xs font-medium bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full border border-emerald-100">
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
