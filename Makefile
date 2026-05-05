.PHONY: help install dev build test lint \
        db-start db-stop db-reset db-migrate db-types \
        setup setup-local

# ── Default ─────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  Reds — development commands"
	@echo ""
	@echo "  First-time setup"
	@echo "  ─────────────────────────────────────────────────────"
	@echo "  make setup          Install deps + apply migrations (remote Supabase)"
	@echo "  make setup-local    Install deps + start local Supabase + apply migrations"
	@echo ""
	@echo "  Daily workflow"
	@echo "  ─────────────────────────────────────────────────────"
	@echo "  make dev            Start Vite dev server"
	@echo "  make build          Production build (tsc + vite)"
	@echo "  make test           Run Vitest unit tests"
	@echo "  make lint           Run ESLint"
	@echo ""
	@echo "  Database"
	@echo "  ─────────────────────────────────────────────────────"
	@echo "  make db-start       Start local Supabase stack (Docker required)"
	@echo "  make db-stop        Stop local Supabase stack"
	@echo "  make db-reset       Reset local DB and re-apply all migrations"
	@echo "  make db-migrate     Apply pending migrations to local DB"
	@echo "  make db-types       Regenerate TypeScript types from linked remote project"
	@echo ""

# ── Dependencies ─────────────────────────────────────────────────────────────
install:
	npm install

# ── Application ──────────────────────────────────────────────────────────────
dev:
	npm run dev

build:
	npm run build

test:
	npm run test

lint:
	npm run lint

# ── Local Supabase stack ──────────────────────────────────────────────────────
db-start:
	npx supabase start

db-stop:
	npx supabase stop

db-reset:
	npx supabase db reset

db-migrate:
	npx supabase migration up

# ── Type generation (runs against the linked remote project) ──────────────────
db-types:
	npx supabase gen types typescript --linked > src/types/supabase.ts
	@echo "Types written to src/types/supabase.ts"

# ── First-time setup shortcuts ────────────────────────────────────────────────

# Remote Supabase workflow: just install deps and point at the hosted project.
setup: install
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo ""; \
		echo "  .env created from .env.example."; \
		echo "  Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then run 'make dev'."; \
		echo ""; \
	else \
		echo "  Dependencies installed. Run 'make dev' to start."; \
	fi

# Local Supabase workflow: Docker must be running.
setup-local: install db-start db-migrate
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo ""; \
		echo "  .env created. Update it with the local credentials printed above."; \
	fi
	@echo ""
	@echo "  Local stack is running. Run 'make dev' to start the app."
	@echo ""
