import { useState, useEffect } from 'react'
import { Loader2, Trophy, TrendingDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { Modal } from '@/components/Modal'
import type { Database } from '@/types/supabase'

type ProfileRow = Database['public']['Tables']['profiles']['Row']

interface MatchRecord {
    game_id: string
    created_at: string
    won: boolean
    opponent_id: string | null
    opponent_username: string | null
    opponent_avatar_url: string | null
}

interface H2HRecord {
    wins: number
    losses: number
}

interface PublicProfileModalProps {
    playerId: string | null
    onClose: () => void
}

function AvatarCircle({ username, avatarUrl }: { username: string | null; avatarUrl: string | null }) {
    if (avatarUrl) {
        return <img src={avatarUrl} alt={username ?? ''} className="w-16 h-16 rounded-full object-cover border-2 border-[var(--color-border)] bg-stone-100 shrink-0" />
    }
    return (
        <div className="w-16 h-16 rounded-full bg-[var(--color-primary)] text-white text-2xl font-bold flex items-center justify-center shrink-0">
            {(username ?? '?')[0].toUpperCase()}
        </div>
    )
}

export function PublicProfileModal({ playerId, onClose }: PublicProfileModalProps) {
    const { user } = useAuth()
    const [profile, setProfile] = useState<ProfileRow | null>(null)
    const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([])
    const [h2h, setH2h] = useState<H2HRecord | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!playerId) return
        setLoading(true)
        setProfile(null)
        setMatchHistory([])
        setH2h(null)

        const load = async () => {
            const isOwnProfile = user?.id === playerId
            const [profileRes, historyRes, h2hRes] = await Promise.all([
                supabase.from('profiles').select('*').eq('id', playerId).single(),
                supabase.rpc('get_match_history', { p_player_id: playerId }),
                !isOwnProfile && user
                    ? supabase.rpc('get_head_to_head', { p_player_id: user.id, p_opponent_id: playerId })
                    : Promise.resolve({ data: null, error: null }),
            ])

            setProfile(profileRes.data ?? null)
            if (historyRes.data && Array.isArray(historyRes.data)) {
                setMatchHistory(historyRes.data as unknown as MatchRecord[])
            }
            if (h2hRes.data) {
                setH2h(h2hRes.data as unknown as H2HRecord)
            }
            setLoading(false)
        }

        load()
    }, [playerId, user])

    const winRate = (() => {
        if (!profile) return '—'
        const total = (profile.total_wins ?? 0) + (profile.total_losses ?? 0)
        if (total === 0) return '—'
        return ((profile.total_wins ?? 0) / total * 100).toFixed(0) + '%'
    })()

    const isOwnProfile = user?.id === playerId

    return (
        <Modal isOpen={!!playerId} onClose={onClose} title={profile?.username ?? 'Player Profile'}>
            {loading ? (
                <div className="flex items-center justify-center py-10 text-[var(--color-text-muted)]">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Loading…
                </div>
            ) : !profile ? (
                <p className="text-center text-sm text-[var(--color-text-muted)] py-6">Profile not found.</p>
            ) : (
                <div className="space-y-5">
                    {/* Identity + global stats */}
                    <div className="flex items-center gap-4">
                        <AvatarCircle username={profile.username} avatarUrl={profile.avatar_url} />
                        <div>
                            <h3 className="text-lg font-bold text-[var(--color-text-main)]">{profile.username}</h3>
                            <div className="flex gap-3 mt-1 text-sm">
                                <span className="font-semibold text-emerald-600">{profile.total_wins ?? 0}W</span>
                                <span className="font-semibold text-red-600">{profile.total_losses ?? 0}L</span>
                                <span className="font-semibold text-[var(--color-primary)]">{winRate}</span>
                            </div>
                        </div>
                    </div>

                    {/* Head-to-Head vs logged-in user */}
                    {!isOwnProfile && h2h !== null && (
                        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3">
                            <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Head-to-Head vs You</p>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="font-bold text-emerald-600">{h2h.wins}W</span>
                                <span className="text-[var(--color-text-muted)]">–</span>
                                <span className="font-bold text-red-600">{h2h.losses}L</span>
                                <span className="text-xs text-[var(--color-text-muted)] ml-1">({h2h.wins + h2h.losses} games together)</span>
                            </div>
                        </div>
                    )}

                    {/* Recent match history */}
                    <div>
                        <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Recent Matches</p>
                        {matchHistory.length === 0 ? (
                            <p className="text-sm text-[var(--color-text-muted)] text-center py-4">No finished games yet.</p>
                        ) : (
                            <div className="space-y-1.5 max-h-52 overflow-y-auto">
                                {matchHistory.slice(0, 10).map(match => (
                                    <div
                                        key={match.game_id}
                                        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${match.won ? 'border-emerald-100 bg-emerald-50' : 'border-red-100 bg-red-50'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {match.won
                                                ? <Trophy className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                : <TrendingDown className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                            }
                                            <span className={`font-medium ${match.won ? 'text-emerald-700' : 'text-red-700'}`}>
                                                {match.won ? 'Win' : 'Loss'}
                                            </span>
                                            <span className="text-[var(--color-text-muted)]">vs {match.opponent_username ?? 'Unknown'}</span>
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
            )}
        </Modal>
    )
}
