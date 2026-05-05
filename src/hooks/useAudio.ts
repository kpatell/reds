import { useCallback, useEffect, useRef, useState } from 'react'

const MUTE_STORAGE_KEY = 'reds_audio_muted'

type SoundName = 'draw' | 'swap' | 'error' | 'reds'

const SOUND_PATHS: Record<SoundName, string> = {
  draw: '/sounds/draw.mp3',
  swap: '/sounds/swap.mp3',
  error: '/sounds/error.mp3',
  reds: '/sounds/reds.mp3',
}

export function useAudio() {
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MUTE_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const isMutedRef = useRef(isMuted)
  useEffect(() => { isMutedRef.current = isMuted }, [isMuted])

  const audioRefs = useRef<Partial<Record<SoundName, HTMLAudioElement>>>({})

  useEffect(() => {
    const entries = Object.entries(SOUND_PATHS) as [SoundName, string][]
    for (const [name, path] of entries) {
      const audio = new Audio(path)
      audio.preload = 'auto'
      audioRefs.current[name] = audio
    }
    return () => {
      for (const audio of Object.values(audioRefs.current)) {
        audio?.pause()
      }
      audioRefs.current = {}
    }
  }, [])

  // Stable reference — reads isMutedRef so it never needs to be recreated
  const play = useCallback((name: SoundName) => {
    if (isMutedRef.current) return
    const audio = audioRefs.current[name]
    if (!audio) return
    audio.currentTime = 0
    audio.play().catch(() => { /* autoplay policy — silently ignore */ })
  }, [])

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev
      try {
        localStorage.setItem(MUTE_STORAGE_KEY, String(next))
      } catch { /* quota exceeded — ignore */ }
      return next
    })
  }, [])

  return {
    isMuted,
    toggleMute,
    playDraw: useCallback(() => play('draw'), [play]),
    playSwap: useCallback(() => play('swap'), [play]),
    playError: useCallback(() => play('error'), [play]),
    playReds: useCallback(() => play('reds'), [play]),
  }
}
