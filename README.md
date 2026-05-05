# Reds

A real-time, two-player card game built on React, TypeScript, and Supabase. Players compete to hold the lowest-value hand by drawing, swapping, and using special power cards. A unique out-of-turn **Stacking** mechanic lets any player discard a matching card at any moment — rewarding fast reflexes and knowledge of your own hand.

---

## Contents

- [Gameplay](#gameplay)
- [Tech Stack](#tech-stack)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [Database Migrations](#database-migrations)
- [Running Tests](#running-tests)
- [Deployment](#deployment)
- [Project Structure](#project-structure)

---

## Gameplay

Each player holds a hand of cards (face-down). On your turn you draw from either the deck or the discard pile, then either swap the drawn card with one in your hand or discard it. After the drawn card is discarded, power cards (7–10) trigger special abilities:

| Card | Power |
|------|-------|
| 7 | Peek at one of your own cards |
| 8 | Peek at one of your opponent's cards |
| 9 | Blind-swap any card from your hand with any from your opponent's |
| 10 | Look at both cards involved before deciding to swap or keep |

When you feel you have the lowest hand, call **REDS**. Your opponent gets one final turn. Both hands are then revealed and scored — aces are 1, face cards are 10 (except the King of Hearts/-2, King of Spades/0 wildcards). Lowest total wins.

**Stacking:** at any point during the game, if the top of the discard pile matches a card in your hand (by rank), you may slam it down. Success removes it from your hand; failure (race condition or wrong card) earns a penalty card.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5, Vite 7 |
| Styling | TailwindCSS 4, Framer Motion 12 |
| Client state | Zustand 5 |
| Server state | TanStack Query 5 |
| Backend | Supabase (PostgreSQL, Auth, Realtime, RPCs) |
| Auth | Supabase Auth (Google OAuth + Anonymous) |
| Linting | ESLint 9, typescript-eslint |
| Git hooks | Husky + commitlint (Conventional Commits) |
| Tests | Vitest |

---

## Local Setup

### Prerequisites

- **Node.js** 18+
- **npm** 8+
- A [Supabase](https://supabase.com) project (free tier works)
- **Docker Desktop** — only needed for the optional local stack path (`make setup-local`)

### Quickstart (remote Supabase)

```bash
git clone https://github.com/kpatell/reds.git
cd reds
make setup          # installs deps + scaffolds .env
```

Edit `.env` with your Supabase credentials (see [Environment Variables](#environment-variables)), then:

```bash
make dev            # starts Vite at http://localhost:5173
```

### Local Supabase stack (optional)

If you want a fully self-contained environment with Docker:

```bash
make setup-local    # installs deps, starts local Supabase, applies all migrations
```

The CLI will print local API URL and anon key — paste them into `.env`. Then:

```bash
make dev
```

### All make targets

```
make help           # print this list

make install        # npm install
make dev            # vite dev server
make build          # tsc + vite production build
make test           # vitest
make lint           # eslint

make db-start       # supabase start (Docker required)
make db-stop        # supabase stop
make db-reset       # wipe and reapply all migrations
make db-migrate     # apply pending migrations
make db-types       # regenerate src/types/supabase.ts from linked project
```

---

## Environment Variables

Create `.env` by copying the example:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your project's REST URL — `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Public anon key from **Project Settings → API** |

Both values are safe to expose in the browser bundle (they are restricted by Row Level Security policies on the database). Never commit `.env`.

---

## Database Migrations

Migrations live in `supabase/migrations/` and are applied in filename order. Each file is idempotent.

| Migration | What it adds |
|-----------|-------------|
| `20260420000000_initial_setup` | `profiles`, `games` tables, RLS policies, Realtime publication |
| `20260421000000_attempt_stack` | `attempt_stack` RPC |
| `20260424*` | Stack penalty fixes |
| `20260428000000_cap_penalty_at_12` | Hand size cap |
| `20260430140000_call_reds` | `call_reds` RPC |
| `20260430150000_rematch_votes` | Rematch voting |
| `20260430180000_auth_profiles_lobby` | Profile trigger, win/loss stats, match history RPCs |
| `20260501000000_short_code` | 6-character `short_code` on games |
| `20260502000000_beta_whitelist_*` | Private beta allow-list, `vote_rematch` RPC |
| `20260503000000_leave_game_rpc` | `leave_game`, `player_disconnected` RPCs |
| `20260504000000_reveal_pending` | `vote_reveal` RPC, `reveal_pending` status |
| `20260505000000_connected_players` | `connected_players` presence column |
| `20260506000000_remove_auto_abandon` | Removes the auto-abandon cron |

Apply to local stack:

```bash
make db-migrate
```

Apply to remote: push migrations via the Supabase dashboard or `supabase db push --linked`.

---

## Running Tests

```bash
make test
```

Unit tests cover the pure game logic in `src/lib/game/`. The test runner is Vitest; no browser or Supabase connection is required.

---

## Deployment

The app is a static SPA — any CDN host that supports single-page routing works.

### Vercel (recommended)

1. Import the GitHub repo in the Vercel dashboard.
2. Set **Framework Preset** to `Vite`.
3. Add environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) under **Project Settings → Environment Variables**.
4. Deploy. Vercel auto-detects the `vite build` output in `dist/`.

### Manual

```bash
make build          # outputs to dist/
```

Upload `dist/` to any static host. Configure your host to serve `index.html` for all unmatched routes (SPA fallback).

### Supabase

All database changes are applied via migrations — there is no separate deploy step for the backend. Push new migrations with:

```bash
supabase db push --linked
```

---

## Project Structure

```
src/
├── App.tsx                  # Router + AuthProvider + ProfileGate
├── components/              # Shared UI components
│   ├── AuthProvider.tsx     # Supabase auth context
│   ├── Card.tsx             # Card face/back rendering
│   ├── ErrorBoundary.tsx    # React error boundary
│   ├── GameBoard.tsx        # Main game canvas
│   ├── PlayerHand.tsx       # Hand layout + drag targets
│   └── ShowdownOverlay.tsx  # End-of-round reveal + scoring
├── hooks/
│   ├── useGameState.ts      # Supabase Realtime subscription + state sync
│   ├── useAudio.ts          # ElevenLabs / Web Audio sound effects
│   ├── useEmotes.ts         # In-game emote broadcasts
│   └── usePresence.ts       # Opponent connection tracking
├── lib/
│   ├── supabase.ts          # Typed Supabase client
│   └── game/
│       ├── deck.ts          # Deck creation, shuffling, dealing
│       ├── engine.ts        # Pure game state transitions
│       ├── engine.test.ts   # Vitest unit tests
│       ├── scoring.ts       # Hand scoring logic
│       ├── scoring.test.ts
│       └── types.ts         # GameState, Card, PlayerState types
├── pages/
│   ├── Lobby.tsx            # Game list, create/join, leaderboard
│   ├── Game.tsx             # In-game page — action handlers
│   └── Profile.tsx          # User profile + match history
└── types/
    └── supabase.ts          # Generated Supabase database types

supabase/
└── migrations/              # Ordered SQL migrations
```

---

## License

MIT
