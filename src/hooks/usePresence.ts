import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Returns the list of player UUIDs currently present in the game's Presence channel.
// Side-effects: calls player_connected / player_disconnected RPCs to keep the DB in sync
// so the lobby can surface games awaiting rejoin.
export function usePresence(gameId: string | null, currentUserId: string | null): string[] {
  const [connectedIds, setConnectedIds] = useState<string[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!gameId || !currentUserId) return

    // Prevents the SUBSCRIBED callback from calling player_connected after this
    // effect has been cleaned up (e.g. a transient reconnect during unmount would
    // otherwise re-add the player after player_disconnected already removed them).
    let isCleanedUp = false

    const syncIds = (channel: RealtimeChannel) => {
      const raw = channel.presenceState<{ user_id: string }>()
      const ids = Object.values(raw).flat().map((p) => p.user_id)
      setConnectedIds(ids)
    }

    const channel = supabase
      .channel(`presence:${gameId}`)
      .on('presence', { event: 'sync' }, () => syncIds(channel))
      .on('presence', { event: 'join' }, () => syncIds(channel))
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        // When the opponent leaves, this client notifies the DB so the lobby can see it.
        const left = leftPresences as Array<{ user_id: string }>
        const leftId = left[0]?.user_id
        if (leftId && leftId !== currentUserId) {
          supabase.rpc('player_disconnected', {
            p_game_id: gameId,
            p_player_id: leftId,
          }).then()
        }
        syncIds(channel)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && !isCleanedUp) {
          await channel.track({ user_id: currentUserId })
          if (!isCleanedUp) {
            await supabase.rpc('player_connected', {
              p_game_id: gameId,
              p_player_id: currentUserId,
            })
          }
        }
      })

    channelRef.current = channel

    return () => {
      isCleanedUp = true
      supabase.rpc('player_disconnected', {
        p_game_id: gameId,
        p_player_id: currentUserId,
      }).then()
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [gameId, currentUserId])

  return connectedIds
}
