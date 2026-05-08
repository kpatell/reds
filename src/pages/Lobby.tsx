import { useEffect, useState } from 'react'
import { RulesModal } from '@/components/RulesModal'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, Loader2, AlertCircle, Users, UserCircle2, ArrowRight, Trophy, RefreshCw } from 'lucide-react'
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

type LeaderboardEntry = Pick<Profile, 'id' | 'username' | 'avatar_url' | 'total_wins' | 'total_losses'>

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
    const [rejoinGames, setRejoinGames] = useState<Game[]>([])
    const [loadingGames, setLoadingGames] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Create game modal state
    const [createOpen, setCreateOpen] = useState(false)
    const [gameTitle, setGameTitle] = useState('')
    const [isCreating, setIsCreating] = useState(false)

    // Join by code state
    const [joinCode, setJoinCode] = useState('')
    const [rulesOpen, setRulesOpen] = useState(false)

    // Leaderboard state
    const [leaderboardOpen, setLeaderboardOpen] = useState(false)
    const [leaderboardPlayers, setLeaderboardPlayers] = useState<LeaderboardEntry[]>([])
    const [leaderboardLoading, setLeaderboardLoading] = useState(false)

    useEffect(() => {
        if (!user) return
        fetchGames()
        fetchLeaderboard()

        const channel = supabase
            .channel('lobby:games')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => fetchGames())
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [user])

    const fetchGames = async () => {
        const staleThreshold = new Date(Date.now() - SIX_HOURS_MS).toISOString()

        const [{ data: waitingData }, { data: activeData }] = await Promise.all([
            supabase
                .from('games')
                .select('*')
                .eq('status', 'waiting')
                .gt('last_action_at', staleThreshold)
                .order('created_at', { ascending: false }),
            supabase
                .from('games')
                .select('*')
                .in('status', ['preview', 'playing', 'final_turn', 'reveal_pending'])
                .gt('last_action_at', staleThreshold),
        ])

        // Games where the current user has a seat they can rejoin — includes waiting games
        // where the user is already in the players map (e.g. host who navigated back).
        const myGames: Game[] = []
        if (user) {
            const allFetched = [...(waitingData ?? []), ...(activeData ?? [])]
            for (const g of allFetched) {
                const p = g.players as Record<string, unknown> | null
                if (p && Object.prototype.hasOwnProperty.call(p, user.id)) {
                    myGames.push(g)
                }
            }
        }
        setRejoinGames(myGames)

        if (!waitingData) { setLoadingGames(false); return }

        // Exclude games the user is already seated in from the Open Lobby list
        const myGameIds = new Set(myGames.map(g => g.id))
        const openGames = waitingData.filter(g => !myGameIds.has(g.id))

        const hostIds = [...new Set(openGames.map(g => g.host_id).filter((id): id is string => !!id))]

        let profileMap: Record<string, Pick<Profile, 'username' | 'avatar_url'>> = {}
        if (hostIds.length > 0) {
            const { data: profileRows } = await supabase
                .from('profiles')
                .select('id, username, avatar_url')
                .in('id', hostIds)
            profileRows?.forEach(p => { profileMap[p.id] = p })
        }

        setGames(openGames.map(g => ({
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

    const fetchLeaderboard = async () => {
        setLeaderboardLoading(true)
        const { data } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, total_wins, total_losses')
            .order('total_wins', { ascending: false })
            .limit(10)
        if (data) setLeaderboardPlayers(data as LeaderboardEntry[])
        setLeaderboardLoading(false)
    }

    const openLeaderboard = () => {
        setLeaderboardOpen(true)
        fetchLeaderboard()
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
        <div className="h-[100dvh] flex flex-col items-center p-3 sm:p-4 overflow-hidden sm:justify-center">
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

            {/* Leaderboard modal */}
            <Modal isOpen={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} title="Leaderboard">
                {leaderboardLoading ? (
                    <div className="flex items-center justify-center py-8 text-[var(--color-text-muted)]">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Loading…
                    </div>
                ) : leaderboardPlayers.length === 0 ? (
                    <p className="text-center text-sm text-[var(--color-text-muted)] py-6">No players yet.</p>
                ) : (
                    <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                        {leaderboardPlayers.map((player, i) => {
                            const total = (player.total_wins ?? 0) + (player.total_losses ?? 0)
                            const rate = total > 0 ? Math.round((player.total_wins ?? 0) / total * 100) + '%' : '—'
                            const rankColor = i === 0 ? 'text-yellow-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-600' : 'text-[var(--color-text-muted)]'
                            return (
                                <div key={player.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
                                    <span className={`w-5 text-sm font-bold text-center shrink-0 ${rankColor}`}>{i + 1}</span>
                                    <AvatarBubble username={player.username} avatarUrl={player.avatar_url} size="sm" />
                                    <span className="flex-1 text-sm font-medium text-[var(--color-text-main)] truncate">
                                        {player.username ?? 'Unknown'}
                                    </span>
                                    <div className="flex items-center gap-4 shrink-0">
                                        <div className="text-center">
                                            <p className="text-sm font-bold text-[var(--color-text-main)]">{player.total_wins ?? 0}</p>
                                            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">wins</p>
                                        </div>
                                        <div className="text-center w-9">
                                            <p className="text-sm font-bold text-[var(--color-primary)]">{rate}</p>
                                            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide">rate</p>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </Modal>

            <div className="max-w-2xl w-full flex flex-col flex-1 min-h-0 gap-3 sm:gap-5 sm:flex-none">
                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter text-[var(--color-primary)] font-serif shrink-0">REDS</h1>
                    <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
                        <button
                            onClick={() => setRulesOpen(true)}
                            className="px-2 sm:px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                        >
                            <span className="sm:hidden">?</span>
                            <span className="hidden sm:inline">How to Play</span>
                        </button>
                        <button
                            onClick={openLeaderboard}
                            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                        >
                            <Trophy className="w-3.5 h-3.5 shrink-0" />
                            <span className="hidden sm:inline">Leaderboard</span>
                        </button>
                        <Link
                            to="/profile"
                            className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] transition-colors text-sm text-[var(--color-text-main)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                        >
                            {profile?.avatar_url ? (
                                <img src={profile.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                            ) : (
                                <UserCircle2 className="w-5 h-5 text-[var(--color-text-muted)] shrink-0" />
                            )}
                            <span className="font-medium hidden sm:inline truncate max-w-[8rem]">{profile?.username ?? 'Profile'}</span>
                        </Link>
                        <button
                            onClick={async () => { await signOut(); navigate('/') }}
                            className="px-2 sm:px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                        >
                            <span className="sm:hidden">←</span>
                            <span className="hidden sm:inline">Sign out</span>
                        </button>
                    </div>
                </div>

                {/* Join via Code + Create Game — stacks on mobile */}
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        type="text"
                        value={joinCode}
                        onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                        onKeyDown={e => { if (e.key === 'Enter') handleJoinByCode() }}
                        placeholder="Enter code (e.g. A7B2F9)"
                        maxLength={6}
                        className="w-full min-w-0 px-3 py-2.5 text-[16px] sm:text-sm font-mono tracking-widest bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent placeholder:font-sans placeholder:tracking-normal"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={handleJoinByCode}
                            disabled={joinCode.length === 0}
                            className="flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-4 py-2.5 bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border border-[var(--color-border)] text-[var(--color-text-main)] font-medium text-sm rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                        >
                            Join
                            <ArrowRight className="w-4 h-4" />
                        </button>
                        <button
                            onClick={openCreateModal}
                            className="flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium text-sm rounded-xl transition-colors active:scale-[0.98] cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--color-primary-hover)]"
                        >
                            <Plus className="w-4 h-4" />
                            New Game
                        </button>
                    </div>
                </div>

                {/* In-progress games the user can rejoin */}
                {rejoinGames.length > 0 && (
                    <>
                        <div className="relative py-1">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-[var(--color-border)]" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase tracking-wider">
                                <span className="bg-[var(--color-background)] px-2 text-[var(--color-text-muted)]">Your Games</span>
                            </div>
                        </div>
                        <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                            {rejoinGames.filter(game => {
                                const connected = (game.connected_players as string[] | null) ?? []
                                return connected.length > 0
                            }).map(game => {
                                const dest = game.short_code ?? game.id
                                const connected = (game.connected_players as string[] | null) ?? []
                                return (
                                    <button
                                        key={game.id}
                                        onClick={() => navigate(`/game/${dest}`)}
                                        className="w-full flex items-center justify-between bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] px-3 py-3 sm:px-5 sm:py-4 rounded-xl transition-all border border-[var(--color-border)] shadow-sm hover:shadow-md cursor-pointer group text-left"
                                    >
                                        <div className="min-w-0">
                                            <p className="font-medium text-[var(--color-text-main)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                                                {game.title ?? `Game ${dest}`}
                                            </p>
                                            {game.short_code && (
                                                <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono tracking-wider">
                                                    {game.short_code}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 ml-3">
                                            <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                                                <Users className="w-3.5 h-3.5" />
                                                {connected.length}/2
                                            </span>
                                            <span className="flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-700 px-2 py-1 rounded-full border border-amber-200">
                                                <RefreshCw className="w-3 h-3" />
                                                Rejoin
                                            </span>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </>
                )}

                {/* Open Lobby divider */}
                <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-[var(--color-border)]" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase tracking-wider">
                        <span className="bg-[var(--color-background)] px-2 text-[var(--color-text-muted)]">Open Lobby</span>
                    </div>
                </div>

                {/* Game list — takes all remaining viewport height */}
                <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1">
                    {loadingGames ? (
                        <div className="flex items-center justify-center py-12 text-[var(--color-text-muted)]">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" />
                            Loading games…
                        </div>
                    ) : games.length === 0 ? (
                        <div className="text-center py-8 sm:py-12 border-2 border-dashed border-[var(--color-border)] rounded-xl">
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
                                    className="w-full flex items-center justify-between bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] px-3 py-3 sm:px-5 sm:py-4 rounded-xl transition-all border border-[var(--color-border)] shadow-sm hover:shadow-md cursor-pointer group text-left"
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

            <p className="text-center text-xs text-[var(--color-text-muted)] opacity-50 select-none pt-2 pb-1">
                made with ❤️ by krishan patel © 2026
            </p>
        </div>
    )
}
