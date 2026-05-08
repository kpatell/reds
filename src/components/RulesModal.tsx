import { Modal } from '@/components/Modal'

interface RulesModalProps {
  isOpen: boolean
  onClose: () => void
}

export function RulesModal({ isOpen, onClose }: RulesModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="How to Play">
      <div className="space-y-5 text-sm text-[var(--color-text-main)]">

        <section className="space-y-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Objective</h3>
          <p>Have the <strong>lowest total hand score</strong> when REDS is called. Lowest score wins.</p>
        </section>

        <section className="space-y-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Card Values</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <span>2 – 10</span><span className="text-[var(--color-text-muted)]">Face value</span>
            <span>J, Q</span><span className="text-[var(--color-text-muted)]">10 pts</span>
            <span>Black King (♠ ♣)</span><span className="text-[var(--color-text-muted)]">0 pts</span>
            <span>Red King (♥ ♦)</span><span className="text-red-600 font-semibold">−2 pts</span>
            <span>Ace</span><span className="text-[var(--color-text-muted)]">1 pt</span>
            <span>Joker <span style={{ background: 'linear-gradient(90deg,#ff4d4d,#ffaa00,#22cc66,#4488ff,#aa44ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>♔</span></span>
            <span className="text-[var(--color-text-muted)]">0 pts</span>
          </div>
        </section>

        <section className="space-y-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Your Turn</h3>
          <ol className="list-decimal list-inside space-y-1 text-[var(--color-text-muted)] leading-relaxed">
            <li><strong className="text-[var(--color-text-main)]">Draw</strong> — take the top card from the deck or discard pile.</li>
            <li><strong className="text-[var(--color-text-main)]">Act</strong> — swap it with one of your hand cards, or discard it.</li>
          </ol>
        </section>

        <section className="space-y-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Power Cards (Discard from Deck)</h3>
          <ul className="space-y-1 text-[var(--color-text-muted)] leading-relaxed">
            <li><span className="font-semibold text-[var(--color-text-main)] mr-1">7</span>Peek at one of your own cards.</li>
            <li><span className="font-semibold text-[var(--color-text-main)] mr-1">8</span>Peek at one of your opponent's cards.</li>
            <li><span className="font-semibold text-[var(--color-text-main)] mr-1">9</span>Blind Swap — trade a card with your opponent without looking.</li>
            <li><span className="font-semibold text-[var(--color-text-main)] mr-1">10</span>Look &amp; Swap — see both cards, then decide whether to swap.</li>
          </ul>
        </section>

        <section className="space-y-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Stacking (Out of Turn)</h3>
          <p className="text-[var(--color-text-muted)] leading-relaxed">
            When any card is discarded, <strong className="text-[var(--color-text-main)]">either player</strong> can immediately tap a matching-rank card from their hand — or even the opponent's hand — to stack it. First to tap wins; a wrong card earns a penalty.
          </p>
        </section>

        <section className="space-y-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Calling REDS</h3>
          <p className="text-[var(--color-text-muted)] leading-relaxed">
            On your turn before drawing, tap <strong className="text-red-600">Call REDS</strong> if you believe your hand is the lowest. Your opponent gets one final turn, then hands are revealed. If yours is not the lowest, you lose.
          </p>
        </section>

      </div>
    </Modal>
  )
}
