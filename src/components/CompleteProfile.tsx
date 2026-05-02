import { useState } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { PRESET_AVATARS } from '@/lib/avatars'

export function CompleteProfile() {
    const { user, refreshProfile } = useAuth()
    const [gamertag, setGamertag] = useState('')
    const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSave = async () => {
        if (!user) return
        const tag = gamertag.trim()
        if (tag.length < 3) { setError('Gamertag must be at least 3 characters.'); return }
        if (tag.length > 20) { setError('Gamertag must be 20 characters or fewer.'); return }
        if (!selectedAvatar) { setError('Please choose an avatar.'); return }

        setSaving(true)
        setError(null)

        const { error: saveError } = await supabase
            .from('profiles')
            .upsert({
                id: user.id,
                username: tag,
                avatar_url: selectedAvatar,
                updated_at: new Date().toISOString(),
            })

        if (saveError) {
            if (saveError.code === '23505') {
                setError('That gamertag is already taken. Try another.')
            } else {
                setError(saveError.message)
            }
            setSaving(false)
            return
        }

        await refreshProfile()
        setSaving(false)
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[var(--color-background)]">
            <div className="max-w-sm w-full space-y-8">
                <div className="text-center space-y-1">
                    <h1 className="text-4xl font-bold tracking-tighter text-[var(--color-primary)] font-serif">REDS</h1>
                    <h2 className="text-lg font-semibold text-[var(--color-text-main)]">Create Your Profile</h2>
                    <p className="text-sm text-[var(--color-text-muted)]">Choose a gamertag and avatar before you play.</p>
                </div>

                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-sm p-6 space-y-6">
                    {/* Gamertag */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                            Gamertag
                        </label>
                        <input
                            type="text"
                            value={gamertag}
                            onChange={e => setGamertag(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                            placeholder="Min 3, max 20 characters"
                            maxLength={20}
                            autoFocus
                            className="w-full px-3 py-2.5 text-sm bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
                        />
                    </div>

                    {/* Avatar picker */}
                    <div className="space-y-2">
                        <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                            Choose an Avatar
                        </label>
                        <div className="grid grid-cols-6 gap-2">
                            {PRESET_AVATARS.map((url, i) => (
                                <button
                                    key={url}
                                    type="button"
                                    onClick={() => setSelectedAvatar(url)}
                                    aria-label={`Avatar option ${i + 1}`}
                                    className={`
                                        relative rounded-full overflow-hidden border-2 transition-all aspect-square cursor-pointer
                                        ${selectedAvatar === url
                                            ? 'border-[var(--color-primary)] scale-110 shadow-md'
                                            : 'border-[var(--color-border)] hover:border-stone-400'
                                        }
                                    `}
                                >
                                    <img
                                        src={url}
                                        alt={`Avatar ${i + 1}`}
                                        className="w-full h-full object-cover bg-stone-100"
                                    />
                                </button>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        onClick={handleSave}
                        disabled={saving || gamertag.trim().length < 3 || !selectedAvatar}
                        className="w-full flex items-center justify-center gap-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-white font-medium py-3 rounded-xl transition-colors"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        Enter the Lobby
                    </button>
                </div>
            </div>
        </div>
    )
}
