# Contributing to Reds

We welcome contributions to Reds! Please follow these guidelines to ensure a smooth collaboration process.

## 1. Getting Started
1.  Fork the repository.
2.  Clone your fork: `git clone https://github.com/kpatell/reds.git`
3.  Install dependencies: `npm install`
4.  Create a new branch: `git checkout -b feat/your-feature-name`

## 2. Commit Standards
We follow the **Conventional Commits** specification.
*   `feat`: A new feature
*   `fix`: A bug fix
*   `docs`: Documentation only changes
*   `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc)
*   `refactor`: A code change that neither fixes a bug nor adds a feature
*   `perf`: A code change that improves performance
*   `test`: Adding missing tests or correcting existing tests
*   `chore`: Changes to the build process or auxiliary tools

**Example:** `feat(game): implement deck shuffling logic`

## 3. Code Style & Best Practices
*   **TypeScript:** Strict mode is enabled. Do not use `any`.
*   **Components:** Use functional components and hooks. Keep components small (< 150 lines).
*   **State Management:** Use Zustand for client state, React Query for server state.
*   **Styling:** Use TailwindCSS utility classes. Avoid arbitrary values (e.g., `w-[123px]`).
*   **Supabase:** Always use generated types from `@/types/supabase`.

## 4. Pull Request Process
1.  Ensure your code builds: `npm run build`
2.  Push your branch: `git push origin feat/your-feature-name`
3.  Open a Pull Request against the `main` branch.
4.  Provide a clear description of your changes and include screenshots if applicable.

## 5. Validation
Before submitting, please review `AG_VALIDATION_RULES.md` to ensure your code adheres to our project standards.
