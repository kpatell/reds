# AG_VALIDATION_RULES.md

## Project Context
**Project:** Reds (Multiplayer Card Game)
**Stack:** React (Vite), TypeScript, TailwindCSS, Zustand, React Query, Supabase (DB + Auth + Realtime).

## 1. General Architecture & File Structure
- **Feature-Based Organization:** Organize code by feature (e.g., `src/features/game`, `src/features/lobby`, `src/features/auth`) rather than type. Each feature folder should contain its own components, hooks, and types.
- **Barrel Exports:** Use `index.ts` files for clean imports from feature modules, but avoid circular dependencies.
- **Naming Conventions:**
  - Components: `PascalCase.tsx` (e.g., `CardPile.tsx`)
  - Hooks: `camelCase.ts` (starts with `use`, e.g., `useGameState.ts`)
  - Utilities: `camelCase.ts` (e.g., `cardUtils.ts`)
  - Types: `PascalCase.ts` (e.g., `GameTypes.ts`)

## 2. TypeScript & Type Safety
- **Strict Mode:** `strict: true` is mandatory in `tsconfig.json`.
- **No `any`:** explicit `any` is strictly forbidden. Use `unknown` with narrowing if the type is truly dynamic.
- **Supabase Types:** ALWAYS use Database types generated from the Supabase schema.
  - *Pattern:* `import { Database } from '@/types/supabase'`
- **Discriminated Unions:** Use discriminated unions for game state (e.g., `{ status: 'waiting' } | { status: 'playing', currentTurn: string }`) to prevent invalid states.
- **Prop Interfaces:** Define Component props explicitly using `interface` or `type`.

## 3. React & Performance
- **Functional Components:** Use function declarations for components.
- **Render Logic:** Keep render phases pure. Side effects must be in `useEffect` or event handlers.
- **Memoization:**
  - Use `useMemo` for expensive card logic (e.g., calculating valid moves, sorting hands).
  - Use `useCallback` for functions passed as props to prevent unnecessary child re-renders.
- **Custom Hooks:** Extract logic from UI components. UI components should only worry about display; hooks handle the data layer.

## 4. State Management (Zustand & React Query)
- **Separation of Concerns:**
  - **Server State (React Query):** Use for `games`, `profiles`, and `waiting_rooms` data fetching. Use `staleTime: 0` for real-time game data to ensure freshness, or rely on subscriptions.
  - **Client State (Zustand):** Use for UI-only state (e.g., `isCardSelected`, `animationState`, `localSortingPreferences`).
- **Atomic Selectors:** When using Zustand, select only the specific slice of state needed to prevent re-renders.
  - *Correct:* `const isSelected = useStore(state => state.selectedCardId === id)`
  - *Incorrect:* `const { selectedCardId } = useStore(state => state)`

## 5. Supabase & Realtime
- **Row Level Security (RLS):** Never write logic that assumes the client has full access. Ensure all DB queries handle RLS errors gracefully.
- **Realtime Subscriptions:**
  - Limit subscriptions to the specific `game_id`.
  - ALWAYS clean up subscriptions in the `useEffect` cleanup function.
  - Debounce rapid updates if necessary, but "Stacking" requires immediate transmission.
- **Optimistic Updates:** For "Stacking" mechanics, update the UI immediately upon user action, then reconcile with the server response. If the server rejects (race condition), rollback the UI state with a visual indicator.

## 6. Styling (TailwindCSS)
- **Utility First:** Avoid `@apply` in CSS files unless creating a reusable component base pattern. Use utility classes directly in JSX.
- **Class Merging:** Use `clsx` and `tailwind-merge` (or a `cn()` utility) to handle conditional class names dynamically.
- **Mobile First:** Design for mobile views first, then use `md:` and `lg:` modifiers for desktop.
- **Dark Mode:** Ensure `dark:` variants are used for the "Premium dark mode" aesthetic.

## 7. Game Logic Specifics (Reds)
- **Card Identification:**
  - NEVER rely on `Value + Suit` for uniqueness.
  - ALWAYS use a unique `card_id` (UUID or unique string) because a deck + jokers can have duplicates (if multiple decks are used later) and for precise animation tracking.
- **Stacking Race Conditions:**
  - Implement a `last_action_at` timestamp check in the backend RLS or Edge Function to reject moves made on stale state.
  - Frontend must handle "move rejected" scenarios gracefully.
- **Power Cards (7, 8, 9, 10):**
  - Logic for powers must be encapsulated in pure functions (e.g., `calculateNextGameState(current, action)`).
  - "Peeking" logic must ensure only the requesting player receives the private card data (via RLS or filtered response).

## 8. Anti-Patterns (DO NOT DO)
- **Prop Drilling:** Do not pass game state down more than 2 levels. Use the Zustand store or React Context.
- **Magic Numbers:** Do not use `7`, `8`, `9` directly in code. Use constants `CARD_POWERS.PEEK_SELF` etc.
- **Direct DOM Manipulation:** Do not touch the DOM directly. Use `useRef` if necessary for animations/canvas.
- **Ignoring Loading States:** Every async action (fetching game, playing card) must have a visual loading/pending state.

## 9. Testing Strategy
- **Unit Tests:** Write tests for the `Game Logic` pure functions (shuffling, win condition, power activation) using Vitest.
- **Mocking:** Mock Supabase calls when testing components.

## 10. Git Workflow & Documentation Standards
- **Conventional Commits:** All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.
  - `feat(game): add shuffling logic`
  - `fix(lobby): resolve join button race condition`
  - `style(card): update border radius`
  - `docs(readme): add setup instructions`
- **Branching Strategy:**
  - `main`: Production-ready code only. Protected branch.
  - `dev` (optional): Integration branch.
  - `feat/feature-name`: For new features (Phase 1, 2, 3 tasks).
  - `fix/issue-description`: For bug fixes.
- **Pull Request (PR) Etiquette:**
  - PRs must be small and focused. Avoid massive "Phase 2 Complete" PRs; break them down into "Deck Generation" and "Turn Structure".
  - Include a screenshot or GIF for UI changes.
- **Documentation Hygiene:**
  - **Inline Docs:** Use TSDoc (`/** ... */`) for all exported functions and complex game logic helpers. Explain *why* a calculation is done, not just *what* it does.
  - **Supabase Schema:** Maintain a `DB_SCHEMA.md` or updated `types/supabase.ts` file. Any change to the DB schema must be reflected in the repo immediately.
  - **Implementation Status:** Update `README.md` checklist items as features are completed (Phase 1, Phase 2, etc.) to keep track of progress.