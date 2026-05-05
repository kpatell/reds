import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface EmotePayload {
  sender_id: string
  emote_id: string
}

export interface IncomingEmote {
  emoteId: string
  nonce: number
}

const EMOTE_DISMISS_MS = 3000

export function useEmotes(gameId: string | null, currentUserId: string | null) {
  const [incomingEmote, setIncomingEmote] = useState<IncomingEmote | null>(null)
  const [localEmote, setLocalEmote] = useState<IncomingEmote | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const localClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nonceRef = useRef(0)

  useEffect(() => {
    if (!gameId || !currentUserId) return

    const channel = supabase
      .channel(`emotes:${gameId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'emote' }, (msg) => {
        const data = msg.payload as EmotePayload
        if (data.sender_id === currentUserId) return
        if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
        setIncomingEmote({ emoteId: data.emote_id, nonce: ++nonceRef.current })
        clearTimerRef.current = setTimeout(() => setIncomingEmote(null), EMOTE_DISMISS_MS)
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
      if (localClearTimerRef.current) clearTimeout(localClearTimerRef.current)
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [gameId, currentUserId])

  const sendEmote = useCallback((emoteId: string) => {
    if (!channelRef.current || !currentUserId) return
    // Immediately echo on the sender's own avatar without waiting for a broadcast round-trip
    if (localClearTimerRef.current) clearTimeout(localClearTimerRef.current)
    setLocalEmote({ emoteId, nonce: ++nonceRef.current })
    localClearTimerRef.current = setTimeout(() => setLocalEmote(null), EMOTE_DISMISS_MS)
    channelRef.current.send({
      type: 'broadcast',
      event: 'emote',
      payload: { sender_id: currentUserId, emote_id: emoteId },
    })
  }, [currentUserId])

  return { sendEmote, incomingEmote, localEmote }
}
