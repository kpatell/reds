import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

type ProfileRow = Database['public']['Tables']['profiles']['Row']

interface AuthContextType {
    user: User | null
    session: Session | null
    profile: ProfileRow | null
    loading: boolean
    profileLoading: boolean
    signInWithEmail: (email: string, password: string) => Promise<void>
    signUpWithEmail: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>
    signInWithGoogle: () => Promise<void>
    signInAnonymously: () => Promise<void>
    signOut: () => Promise<void>
    refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    profile: null,
    loading: true,
    profileLoading: false,
    signInWithEmail: async () => { },
    signUpWithEmail: async () => ({ needsConfirmation: false }),
    signInWithGoogle: async () => { },
    signInAnonymously: async () => { },
    signOut: async () => { },
    refreshProfile: async () => { },
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [session, setSession] = useState<Session | null>(null)
    const [profile, setProfile] = useState<ProfileRow | null>(null)
    const [loading, setLoading] = useState(true)
    const [profileLoading, setProfileLoading] = useState(false)

    const loadProfile = useCallback(async (userId: string) => {
        setProfileLoading(true)
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single()
        setProfile(data ?? null)
        setProfileLoading(false)
    }, [])

    useEffect(() => {
        let mounted = true

        const init = async () => {
            const { data: { session: s } } = await supabase.auth.getSession()
            if (!mounted) return
            setSession(s)
            setUser(s?.user ?? null)
            if (s?.user) {
                await loadProfile(s.user.id)
            }
            if (mounted) setLoading(false)
        }
        init()

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
            setSession(s)
            setUser(s?.user ?? null)
            if (s?.user) {
                setProfileLoading(true)
                loadProfile(s.user.id)
            } else {
                setProfile(null)
                setProfileLoading(false)
            }
        })

        return () => {
            mounted = false
            subscription.unsubscribe()
        }
    }, [loadProfile])

    const signInWithEmail = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
    }

    const signUpWithEmail = async (email: string, password: string) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: window.location.origin
            }
        })
        if (error) throw error
        return { needsConfirmation: !data.session }
    }

    const signInWithGoogle = async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
        })
        if (error) throw error
    }

    const signInAnonymously = async () => {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) throw error
    }

    const signOut = async () => {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
        setProfile(null)
    }

    const refreshProfile = useCallback(async () => {
        if (user) await loadProfile(user.id)
    }, [user, loadProfile])

    return (
        <AuthContext.Provider value={{
            user, session, profile, loading, profileLoading,
            signInWithEmail, signUpWithEmail, signInWithGoogle, signInAnonymously, signOut, refreshProfile,
        }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
