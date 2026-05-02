import { useEffect, useState } from 'react'
import { RulesModal } from '@/components/RulesModal'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, Loader2, AlertCircle, Users, UserCircle2, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { AuthScreen } from '@/components/AuthScreen'
import { Modal } from '@/components/Modal'
import type { Database } from '@/types/supabase'

type Game = Database['public']['Tables']['games']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

interface LobbyGame extends Game {
    host: Pick<Profile, 'username' | 'avatar_url'> | null
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000

function AvatarBubble({ username, avatarUrl, size = 'sm' }: { username: string | null; avatarUrl: string | null; size?: 'sm' | 'md' }) {
    const dim = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
    if (avatarUrl) {
        return <img src={avatarUrl} alt={username ?? ''} className={`${dim} rounded-full object-cover border border-[var(--color-border)]`} />
    }
    return (
        <div className={`${dim} rounded-full bg-[var(--color-primary)] text-white font-bold flex items-center justify-center shrink-0`}>
            {(username ?? '?')[0].toUpperCase()}
        </div>
    )
}

function playerCount(players: Game['players']): number {
    if (!players || typeof players !== 'object' || Array.isArray(players)) return 0
    return Object.keys(players as Record<string, unknown>).length
}

export default function Lobby() {
    const navigate = useNavigate()
    const { user, profile, loading: authLoading, signOut } = useAuth()

    const [games, setGames] = useState<LobbyGame[]>([])
    const [loadingGames, setLoadingGames] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Create game modal state
    const [createOpen, setCreateOpen] = useState(false)
    const [gameTitle, setGameTitle] = useState('')
    const [isCreating, setIsCreating] = useState(false)

    // Join by code state
    const [joinCode, setJoinCode] = useState('')
    const [rulesOpen, setRulesOpen] = useState(false)

    useEffect(() => {
        if (!user) return
        fetchGames()

        const channel = supabase
            .channel('lobby:games')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => fetchGames())
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [user])

    const fetchGames = async () => {
        const staleThreshold = new Date(Date.now() - SIX_HOURS_MS).toISOString()

        const { data: gamesData } = await supabase
            .from('games')
            .select('*')
            .eq('status', 'waiting')
            .gt('last_action_at', staleThreshold)
            .order('created_at', { ascending: false })

        if (!gamesData) { setLoadingGames(false); return }

        const hostIds = [...new Set(gamesData.map(g => g.host_id).filter((id): id is string => !!id))]

        let profileMap: Record<string, Pick<Profile, 'username' | 'avatar_url'>> = {}
        if (hostIds.length > 0) {
            const { data: profileRows } = await supabase
                .from('profiles')
                .select('id, username, avatar_url')
                .in('id', hostIds)
            profileRows?.forEach(p => { profileMap[p.id] = p })
        }

        setGames(gamesData.map(g => ({
            ...g,
            host: g.host_id ? (profileMap[g.host_id] ?? null) : null,
        })))
        setLoadingGames(false)
    }

    const openCreateModal = () => {
        setGameTitle(`${profile?.username ?? 'Player'}'s Game`)
        setCreateOpen(true)
    }

    const handleCreateGame = async () => {
        if (!user) return
        setIsCreating(true)
        setError(null)
        try {
            const { data, error: insertError } = await supabase
                .from('games')
                .insert({
                    status: 'waiting',
                    players: {},
                    title: gameTitle.trim() || `${profile?.username ?? 'Player'}'s Game`,
                    host_id: user.id,
                    last_action_at: new Date().toISOString(),
                })
                .select()
                .single()

            if (insertError) throw insertError
            if (data) {
                const dest = data.short_code ?? data.id
                navigate(`/game/${dest}`)
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create game')
        } finally {
            setIsCreating(false)
        }
    }

    const handleJoinByCode = () => {
        const code = joinCode.trim().toUpperCase()
        if (!code) return
        navigate(`/game/${code}`)
    }

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
            </div>
        )
    }

    if (!user) return <AuthScreen />

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
            <RulesModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} />

            <Modal isOpen={!!error} onClose={() => setError(null)} title="Error">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3 text-red-600">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="text-sm">{error}</p>
                    </div>
                    <button
                        onClick={() => setError(null)}
                        className="w-full bg-[var(--color-text-main)] hover:bg-neutral-800 text-white py-2 rounded-lg transition-colors text-sm cursor-pointer"
                    >
                        Close
                    </button>
                </div>
            </Modal>

            {/* Create game modal */}
            <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create Game">
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">Game Title</label>
                        <input
                            type="text"
                            value={gameTitle}
                            onChange={e => setGameTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleCreateGame() }}
                            maxLength={60}
                            className="w-full px-3 py-2.5 text-sm bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
                            autoFocus
                        />
                    </div>
                    <button
                        onClick={handleCreateGame}
                        disabled={isCreating}
                        className="w-full flex items-center justify-center gap-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-white font-medium py-2.5 rounded-lg transition-colors"
                    >
                        {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Create Game
                    </button>
                </div>
            </Modal>

            <div className="max-w-2xl w-full space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h1 className="text-4xl font-bold tracking-tighter text-[var(--color-primary)] font-serif">REDS</h1>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setRulesOpen(true)}
                            className="px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
                        >
                            How to Play
                        </button>
                        <Link
                            to="/profile"
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] transition-colors text-sm text-[var(--color-text-main)]"
                        >
                            {profile?.avatar_url ? (
                                <img src={profile.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                            ) : (
                                <UserCircle2 className="w-5 h-5 text-[var(--color-text-muted)]" />
                            )}
                            <span className="font-medium">{profile?.username ?? 'Profile'}</span>
                        </Link>
                        <button
                            onClick={() => signOut()}
                            className="px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
                        >
                            Sign out
                        </button>
                    </div>
                </div>

                {/* Join via Code + Create Game (same row) */}
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={joinCode}
                        onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                        onKeyDown={e => { if (e.key === 'Enter') handleJoinByCode() }}
                        placeholder="Enter code (e.g. A7B2F9)"
                        maxLength={6}
                        className="flex-1 px-3 py-2.5 text-sm font-mono tracking-widest bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent placeholder:font-sans placeholder:tracking-normal"
                    />
                    <button
                        onClick={handleJoinByCode}
                        disabled={joinCode.length === 0}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border border-[var(--color-border)] text-[var(--color-text-main)] font-medium text-sm rounded-xl transition-colors shrink-0"
                    >
                        Join
                        <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                        onClick={openCreateModal}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium text-sm rounded-xl transition-colors shrink-0 active:scale-[0.98] cursor-pointer"
                    >
                        <Plus className="w-4 h-4" />
                        New Game
                    </button>
                </div>

                {/* Open Lobby divider */}
                <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-[var(--color-border)]" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase tracking-wider">
                        <span className="bg-[var(--color-background)] px-2 text-[var(--color-text-muted)]">Open Lobby</span>
                    </div>
                </div>

                {/* Game list */}
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {loadingGames ? (
                        <div className="flex items-center justify-center py-12 text-[var(--color-text-muted)]">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" />
                            Loading games…
                        </div>
                    ) : games.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-[var(--color-border)] rounded-xl">
                            <p className="text-[var(--color-text-muted)]">No open games.</p>
                            <p className="text-sm text-[var(--color-text-muted)] opacity-70 mt-1">Be the first to create one!</p>
                        </div>
                    ) : (
                        games.map(game => {
                            const count = playerCount(game.players)
                            const dest = game.short_code ?? game.id
                            return (
                                <button
                                    key={game.id}
                                    onClick={() => navigate(`/game/${dest}`)}
                                    className="w-full flex items-center justify-between bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] px-5 py-5 rounded-xl transition-all border border-[var(--color-border)] shadow-sm hover:shadow-md cursor-pointer group text-left"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <AvatarBubble username={game.host?.username ?? null} avatarUrl={game.host?.avatar_url ?? null} />
                                        <div className="min-w-0">
                                            <p className="font-medium text-[var(--color-text-main)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                                                {game.title ?? `Game ${dest}`}
                                            </p>
                                            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
                                                {game.host?.username ?? 'Unknown host'}
                                                {game.short_code && (
                                                    <span className="ml-2 font-mono tracking-wider opacity-60">{game.short_code}</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 ml-3">
                                        <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                                            <Users className="w-3.5 h-3.5" />
                                            {count}/2
                                        </span>
                                        <span className="text-xs font-medium bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full border border-emerald-100">
                                            Waiting
                                        </span>
                                    </div>
                                </button>
                            )
                        })
                    )}
                </div>
            </div>
        </div>
    )
}
