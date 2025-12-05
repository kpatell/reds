import { useEffect, useRef, useState } from 'react'

interface ScaleContainerProps {
    children: React.ReactNode
    className?: string
}

export function ScaleContainer({ children, className }: ScaleContainerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [scale, setScale] = useState(1)

    useEffect(() => {
        const handleResize = () => {
            if (!containerRef.current) return

            const windowHeight = window.innerHeight
            const windowWidth = window.innerWidth

            // Target dimensions (based on max-w-6xl and reasonable height)
            const targetWidth = 1152 // max-w-6xl
            const targetHeight = 800 // reasonable minimum height for the game board

            // Calculate scale
            const scaleX = windowWidth / targetWidth
            const scaleY = windowHeight / targetHeight

            // Use the smaller scale to fit both dimensions, but cap at 1 (don't upscale too much)
            // Also ensure we don't scale down too aggressively on mobile (min 0.5 maybe?)
            const newScale = Math.min(Math.min(scaleX, scaleY), 1)

            // On mobile portrait, we might want to be more lenient or use a different logic
            // But for now, fitting to screen is the goal.

            setScale(newScale)
        }

        handleResize()
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
        <div
            ref={containerRef}
            className={className}
            style={{
                width: '100%',
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
            }}
        >
            <div
                style={{
                    transform: `scale(${scale})`,
                    transformOrigin: 'center center',
                    width: '100%',
                    maxWidth: '1152px', // max-w-6xl
                    height: '100%',
                    maxHeight: '800px', // approximate height of game board
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                {children}
            </div>
        </div>
    )
}
