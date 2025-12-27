# AG_VALIDATION_RULES.md

## Project Context
**Project:** Reds (Multiplayer Card Game)
**Stack:** React (Vite), TypeScript, TailwindCSS, Zustand, React Query, Supabase (DB + Auth + Realtime).

## 1. General Architecture & File Structure
- **Feature-Based Organization:** Strict separation by feature (e.g., `src/features/game`, `src/features/lobby`).
- **Barrel Exports:** Use `index.ts` for clean imports.
- **Strict File Boundaries:** Game logic (pure functions) must be separate from React Components.
    - `src/features/game/logic/`: Pure TS functions (scoring, shuffling, valid moves).
    - `src/features/game/components/`: UI components.
    - `src/features/game/hooks/`: State integration.

## 2. TypeScript & Type Safety
- **Strict Mode:** `strict: true` in `tsconfig.json`.
- **No `any`:** Forbidden. Use `unknown` with type guards if necessary.
- **Supabase Types:** Use `Database` generated types.
    - *Constraint:* Do not manually type DB responses. Extend DB types only for UI-specific computed properties.
- **Discriminated Unions:** MANDATORY for Game State.
    - Example: `type GameState = { status: 'PREVIEW' } | { status: 'PLAYING'; turn: string } | { status: 'FINISHED'; winner: string }`.

## 3. State Management (Zustand & React Query)
- **Server State (React Query):** Handles `games`, `profiles`.
    - **Stale Time:** Set to `Infinity` for static data, `0` for game state (rely on Realtime subscriptions to invalidate queries).
- **Client State (Zustand):** Handles UI interaction (drag-and-drop state, selected card ID, animation flags).
- **Optimistic Updates:** Crucial for "Stacking".
    - When a player Stacks: 1. Update Zustand UI immediately. 2. Send request to Supabase. 3. If Supabase errors (race condition), rollback Zustand state and show "Too Slow" toast.

## 4. Supabase & Realtime Strategy
- **Postgres Functions (RPC):**
    - **CRITICAL:** Do not perform gameplay logic (like swapping cards) on the client and then patch the row.
    - **Requirement:** Call a Postgres RPC function (e.g., `play_turn`, `attempt_stack`) passing the `card_id` and action. The Database must handle the logic and verification to ensure atomicity.
- **Realtime Subscriptions:**
    - Subscribe to `UPDATE` on the `games` table with a filter `id=eq.{gameId}`.
    - Handle `postgres_changes` payload to update the React Query cache via `queryClient.setQueryData`.

## 5. Game Logic Specifics
- **Card Identity:**
    - Cards are Objects: `{ id: string (UUID), suit: 'hearts', value: 5, rank: '5', power: boolean }`.
    - **NEVER** compare cards by value alone. Always compare by `id`.
- **State Hygiene (Metadata Reset):**
    - **CRITICAL:** When a card is moved between hands (via Swap) or returned to a hand (via Penalty), any "Known/Revealed" flags must be reset to `false`.
    - **Principle:** Knowledge does not travel. A card entering a player's hand is always "Unknown/Face-down" unless explicitly revealed *after* the move.
- **Deck Reshuffling (Auto-Trigger):**
    - If a player attempts to draw from the `DECK` and `deck_count === 0`:
    - The RPC function must automatically:
        1. Take all cards from `DISCARD` *except* the top card.
        2. Shuffle them.
        3. Insert them into `DECK`.
        4. Complete the player's draw action.
- **Dynamic Hand Sizes:**
    - The player's hand is NOT fixed at 4 cards. It is a dynamic array that can shrink (successful stack) or grow (penalties).
- **Public Signaling of Private Actions:**
    - The Game State must include a `last_action` field containing metadata (e.g., `{ type: 'PEEK', target_player: 'p2', target_index: 1 }`).
    - The Frontend must render indicators (eye icon, highlight) on the specific card being interacted with.
- **The "Stacking" Race Condition:**
    - The server is the source of truth.
    - If Player A and Player B stack at the exact same ms, the RPC function processes one first. The second call must return `STACK_FAILED_LATE`.
    - **The "Buried" Draw:** If Player A tries to draw the top card of the Discard pile, but Player B stacks on top of it before the server processes the draw, Player A's draw MUST fail. The UI must refresh, showing the new top card (Player B's card).
    - **Penalty Logic:** The RPC must automatically handle the penalty transaction (dealing a new card to the failed player).

## 6. Styling (TailwindCSS)
- **Mobile First:** All layouts must work on 375px width.
- **Animations:** Use `framer-motion` or CSS transitions for card movements.
- **Conditionals:** Use `clsx` and `tailwind-merge`.

## 7. Anti-Patterns
- **Prop Drilling:** Max 2 levels.
- **Magic Numbers:** Use constants (e.g., `POINTS.RED_KING = -2`).
- **Client-Side Validation Only:** Never trust the client. The DB RPC function must re-validate that the move is legal before mutating data.

## 8. Git & Testing
- **Conventional Commits:** Required.
- **Unit Tests:** All logic in `src/features/game/logic/` must have 100% coverage via Vitest.

## 9. UI/UX & Design System
- **Theme Name:** "Reds Minimalist"
- **Color Palette:**
    - **Backgrounds:** `bg-stone-100` or `#E6DCC3` (Tan/Felt) as the primary board color.
    - **Accents:** `text-red-700` / `bg-red-600` for primary actions (Buttons, "REDS" call) and Heart/Diamond suits.
    - **Neutrals:** `slate-900` (Black) for text, borders, and Club/Spade suits.
    - **Cards:** White card face, simple geometric pattern for card backs (Red/Black/Tan).
- **Typography:**
    - Clean Sans-Serif (e.g., `Inter` or `Geist Sans`).
    - Bold weights for Scores and Game Status.
- **Visual Style:**
    - **Minimalism:** No heavy textures (wood/felt images). Use solid colors and subtle borders.
    - **Focus:** The "Board" should be clean. Only the cards and essential buttons (Draw, Swap, Call Reds) should be prominent.
    - **Indicators:** Use subtle animations (pulsing border) for "Your Turn" rather than massive banners.

## 10. Matchmaking (Lobby)
- **Mechanism:** Simple "Room Code" system.
    - Host creates game -> Generates 4-character code (e.g., `ABCD`).
    - Opponent enters code -> Joins lobby.
- **Requirement:** Do not implement complex matchmaking queues. Keep it manual and simple.