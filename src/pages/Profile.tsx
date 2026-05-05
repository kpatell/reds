import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit2, Check, X, Loader2, Trophy, TrendingDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { PRESET_AVATARS } from '@/lib/avatars'
import type { Database } from '@/types/supabase'

type Profile = Database['public']['Tables']['profiles']['Row']

interface MatchRecord {
    game_id: string
    created_at: string
    won: boolean
    opponent_id: string | null
    opponent_username: string | null
    opponent_avatar_url: string | null
}

interface H2H {
    wins: number
    losses: number
}

function AvatarCircle({ username, avatarUrl, size = 'lg' }: { username: string | null; avatarUrl: string | null; size?: 'sm' | 'lg' }) {
    const dim = size === 'lg' ? 'w-16 h-16 text-2xl' : 'w-7 h-7 text-xs'
    if (avatarUrl) {
        return <img src={avatarUrl} alt={username ?? ''} className={`${dim} rounded-full object-cover border-2 border-[var(--color-border)] bg-stone-100`} />
    }
    return (
        <div className={`${dim} rounded-full bg-[var(--color-primary)] text-white font-bold flex items-center justify-center shrink-0`}>
            {(username ?? '?')[0].toUpperCase()}
        </div>
    )
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
    return (
        <div className={`flex flex-col items-center p-4 rounded-xl border ${accent ? 'border-[var(--color-primary)] bg-red-50' : 'border-[var(--color-border)] bg-[var(--color-surface)]'}`}>
            <span className={`text-2xl font-bold ${accent ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-main)]'}`}>{value}</span>
            <span className="text-xs text-[var(--color-text-muted)] mt-0.5 uppercase tracking-wider">{label}</span>
        </div>
    )
}

export default function ProfilePage() {
    const navigate = useNavigate()
    const { user, profile: authProfile, refreshProfile, signOut } = useAuth()

    const [profile, setProfile] = useState<Profile | null>(authProfile)
    const [editMode, setEditMode] = useState(false)
    const [editUsername, setEditUsername] = useState('')
    const [editAvatar, setEditAvatar] = useState<string>('')
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([])
    const [loadingHistory, setLoadingHistory] = useState(true)
    const [h2hMap, setH2hMap] = useState<Record<string, H2H>>({})

    useEffect(() => {
        if (!user) { navigate('/'); return }
        setProfile(authProfile)
    }, [authProfile, user, navigate])

    useEffect(() => {
        if (!user) return
        fetchHistory()
    }, [user])

    const fetchHistory = async () => {
        if (!user) return
        setLoadingHistory(true)
        const { data } = await supabase.rpc('get_match_history', { p_player_id: user.id })
        if (data && Array.isArray(data)) {
            const records = data as unknown as MatchRecord[]
            setMatchHistory(records)
            computeH2H(records)
        }
        setLoadingHistory(false)
    }

    const computeH2H = (records: MatchRecord[]) => {
        const map: Record<string, H2H> = {}
        for (const r of records) {
            if (!r.opponent_id) continue
            if (!map[r.opponent_id]) map[r.opponent_id] = { wins: 0, losses: 0 }
            if (r.won) map[r.opponent_id].wins++
            else map[r.opponent_id].losses++
        }
        setH2hMap(map)
    }

    const startEdit = () => {
        setEditUsername(profile?.username ?? '')
        setEditAvatar(profile?.avatar_url ?? '')
        setSaveError(null)
        setEditMode(true)
    }

    const cancelEdit = () => {
        setEditMode(false)
        setSaveError(null)
    }

    const saveProfile = async () => {
        if (!user) return
        if (editUsername.trim().length < 3) {
            setSaveError('Username must be at least 3 characters.')
            return
        }
        setSaving(true)
        setSaveError(null)
        const { error } = await supabase
            .from('profiles')
            .update({
                username: editUsername.trim(),
                avatar_url: editAvatar || null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', user.id)

        if (error) {
            if (error.code === '23505') setSaveError('That username is already taken.')
            else setSaveError(error.message)
        } else {
            await refreshProfile()
            setEditMode(false)
        }
        setSaving(false)
    }

    const winRatio = (() => {
        const total = (profile?.total_wins ?? 0) + (profile?.total_losses ?? 0)
        if (total === 0) return '—'
        return ((profile?.total_wins ?? 0) / total * 100).toFixed(0) + '%'
    })()

    const opponents = Object.entries(h2hMap).map(([id, stats]) => {
        const lastMatch = matchHistory.find(m => m.opponent_id === id)
        return { id, stats, username: lastMatch?.opponent_username ?? null, avatarUrl: lastMatch?.opponent_avatar_url ?? null }
    })

    if (!user) return null

    return (
        <div className="min-h-screen p-4 max-w-lg mx-auto space-y-6 pt-6">
            {/* Back nav */}
            <div className="flex items-center justify-between">
                <Link to="/" className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Lobby
                </Link>
                <button
                    onClick={() => signOut().then(() => navigate('/'))}
                    className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
                >
                    Sign out
                </button>
            </div>

            {/* Profile card */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 shadow-sm">
                {editMode ? (
                    <div className="space-y-4">
                        {/* Avatar picker */}
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Avatar</p>
                            <div className="grid grid-cols-6 gap-2">
                                {PRESET_AVATARS.map((url, i) => (
                                    <button
                                        key={url}
                                        type="button"
                                        onClick={() => setEditAvatar(url)}
                                        aria-label={`Avatar option ${i + 1}`}
                                        className={`
                                            rounded-full overflow-hidden border-2 transition-all aspect-square cursor-pointer
                                            ${editAvatar === url
                                                ? 'border-[var(--color-primary)] scale-110 shadow-sm'
                                                : 'border-[var(--color-border)] hover:border-stone-400'
                                            }
                                        `}
                                    >
                                        <img src={url} alt="" className="w-full h-full object-cover bg-stone-100" />
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Username */}
                        <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Gamertag</p>
                            <input
                                type="text"
                                value={editUsername}
                                onChange={e => setEditUsername(e.target.value)}
                                placeholder="Username"
                                maxLength={20}
                                autoFocus
                                className="w-full px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] bg-[var(--color-background)]"
                            />
                        </div>

                        {saveError && <p className="text-xs text-red-600">{saveError}</p>}

                        <div className="flex gap-2">
                            <button
                                onClick={saveProfile}
                                disabled={saving}
                                className="flex items-center gap-1 px-3 py-1.5 bg-[var(--color-primary)] text-white text-xs font-medium rounded-lg hover:bg-[var(--color-primary-hover)] disabled:opacity-50 cursor-pointer transition-colors"
                            >
                                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Save
                            </button>
                            <button
                                onClick={cancelEdit}
                                className="flex items-center gap-1 px-3 py-1.5 border border-[var(--color-border)] text-xs rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
                            >
                                <X className="w-3 h-3" />
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-4">
                        <AvatarCircle username={profile?.username ?? null} avatarUrl={profile?.avatar_url ?? null} />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-bold text-[var(--color-text-main)] truncate">{profile?.username ?? 'Loading…'}</h2>
                                <button onClick={startEdit} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] rounded-md hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer">
                                    <Edit2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">{user.email}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Stats */}
            <div>
                <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Global Stats</h3>
                <div className="grid grid-cols-3 gap-3">
                    <StatCard label="Wins" value={profile?.total_wins ?? 0} />
                    <StatCard label="Losses" value={profile?.total_losses ?? 0} />
                    <StatCard label="Win Rate" value={winRatio} accent />
                </div>
            </div>

            {/* Head-to-Head */}
            {opponents.length > 0 && (
                <div>
                    <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Head-to-Head</h3>
                    <div className="space-y-2">
                        {opponents.map(opp => (
                            <div key={opp.id} className="flex items-center justify-between bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3">
                                <div className="flex items-center gap-2.5">
                                    <AvatarCircle username={opp.username} avatarUrl={opp.avatarUrl} size="sm" />
                                    <span className="text-sm font-medium text-[var(--color-text-main)]">{opp.username ?? 'Unknown'}</span>
                                </div>
                                <div className="flex items-center gap-1 text-sm">
                                    <span className="font-bold text-emerald-600">{opp.stats.wins}W</span>
                                    <span className="text-[var(--color-text-muted)]">–</span>
                                    <span className="font-bold text-red-600">{opp.stats.losses}L</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Match History */}
            <div>
                <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Match History</h3>
                {loadingHistory ? (
                    <div className="flex items-center justify-center py-8 text-[var(--color-text-muted)]">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Loading…
                    </div>
                ) : matchHistory.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-[var(--color-border)] rounded-xl">
                        <p className="text-sm text-[var(--color-text-muted)]">No finished games yet.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {matchHistory.map(match => (
                            <div
                                key={match.game_id}
                                className={`flex items-center justify-between p-3 rounded-xl border ${match.won ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}`}
                            >
                                <div className="flex items-center gap-2.5">
                                    {match.won
                                        ? <Trophy className="w-4 h-4 text-emerald-600 shrink-0" />
                                        : <TrendingDown className="w-4 h-4 text-red-600 shrink-0" />
                                    }
                                    <AvatarCircle username={match.opponent_username} avatarUrl={match.opponent_avatar_url} size="sm" />
                                    <div>
                                        <p className={`text-sm font-semibold ${match.won ? 'text-emerald-700' : 'text-red-700'}`}>
                                            {match.won ? 'Win' : 'Loss'}
                                        </p>
                                        <p className="text-xs text-[var(--color-text-muted)]">
                                            vs {match.opponent_username ?? 'Unknown'}
                                        </p>
                                    </div>
                                </div>
                                <span className="text-xs text-[var(--color-text-muted)]">
                                    {new Date(match.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
