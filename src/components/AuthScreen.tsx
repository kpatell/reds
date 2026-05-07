import { useState } from 'react'
import { Loader2, Mail, Lock, AlertCircle } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'

type Mode = 'signin' | 'signup'

export function AuthScreen() {
    const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth()

    const [mode, setMode] = useState<Mode>('signin')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [googleLoading, setGoogleLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [confirmationSent, setConfirmationSent] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)

        try {
            if (mode === 'signin') {
                await signInWithEmail(email, password)
            } else {
                const { needsConfirmation } = await signUpWithEmail(email, password)
                if (needsConfirmation) setConfirmationSent(true)
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Something went wrong.')
        } finally {
            setLoading(false)
        }
    }

    const handleGoogle = async () => {
        setError(null)
        setGoogleLoading(true)
        try {
            await signInWithGoogle()
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Google sign-in failed.')
            setGoogleLoading(false)
        }
    }

    if (confirmationSent) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4 relative">
                <div className="max-w-sm w-full text-center space-y-4">
                    <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                        <Mail className="w-6 h-6 text-emerald-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-[var(--color-text-main)]">Check your email</h2>
                    <p className="text-sm text-[var(--color-text-muted)] break-words px-2">
                        We sent a confirmation link to <strong className="break-all">{email}</strong>. Click it to activate your account, then sign in.
                    </p>
                    <button
                        onClick={() => { setConfirmationSent(false); setMode('signin') }}
                        className="text-sm text-[var(--color-primary)] hover:underline cursor-pointer"
                    >
                        Back to sign in
                    </button>
                </div>
                <p className="absolute bottom-4 left-0 right-0 text-center text-xs text-[var(--color-text-muted)] opacity-50 select-none pointer-events-none">
                    made with ❤️ by krishan patel © 2026
                </p>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 relative">
            <div className="max-w-sm w-full space-y-6">
                <div className="text-center">
                    <h1 className="text-5xl font-bold tracking-tighter text-[var(--color-primary)] mb-1 font-serif">REDS</h1>
                    <p className="text-sm text-[var(--color-text-muted)]">A strategic card game for two players.</p>
                </div>

                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-sm p-6 space-y-4">
                    {/* Mode tabs */}
                    <div className="flex rounded-lg overflow-hidden border border-[var(--color-border)]">
                        <button
                            onClick={() => { setMode('signin'); setError(null) }}
                            className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer ${mode === 'signin'
                                ? 'bg-[var(--color-text-main)] text-white'
                                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
                                }`}
                        >
                            Sign In
                        </button>
                        <button
                            onClick={() => { setMode('signup'); setError(null) }}
                            className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer ${mode === 'signup'
                                ? 'bg-[var(--color-text-main)] text-white'
                                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'
                                }`}
                        >
                            Sign Up
                        </button>
                    </div>

                    {mode === 'signup' && (
                        <p className="text-xs text-[var(--color-text-muted)] text-center break-words whitespace-normal">
                            You'll choose your gamertag and avatar after signing up.
                        </p>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-3">
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                            <input
                                type="email"
                                placeholder="Email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                className="w-full pl-9 pr-3 py-2.5 text-sm bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent placeholder:text-[var(--color-text-muted)]"
                            />
                        </div>

                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                minLength={6}
                                className="w-full pl-9 pr-3 py-2.5 text-sm bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent placeholder:text-[var(--color-text-muted)]"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-white font-medium py-2.5 rounded-lg transition-colors"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {mode === 'signin' ? 'Sign In' : 'Create Account'}
                        </button>
                    </form>

                    <div className="relative py-1">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-[var(--color-border)]" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase tracking-wider">
                            <span className="bg-[var(--color-surface)] px-2 text-[var(--color-text-muted)]">or</span>
                        </div>
                    </div>

                    <button
                        onClick={handleGoogle}
                        disabled={googleLoading}
                        className="w-full flex items-center justify-center gap-3 border border-[var(--color-border)] bg-[var(--color-background)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer py-2.5 rounded-lg transition-colors text-sm font-medium text-[var(--color-text-main)]"
                    >
                        {googleLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                        )}
                        Continue with Google
                    </button>
                </div>
            </div>
            <p className="absolute bottom-4 left-0 right-0 text-center text-xs text-[var(--color-text-muted)] opacity-50 select-none pointer-events-none">
                made with ❤️ by krishan patel © 2026
            </p>
        </div>
    )
}
