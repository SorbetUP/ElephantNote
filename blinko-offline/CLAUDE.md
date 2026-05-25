# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Blinko is an open-source, self-hosted note-taking application with AI-powered features. It's a multi-platform application (web, desktop via Tauri, mobile) built with TypeScript/React frontend and Node.js/Express backend.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Tauri (for desktop apps)
- **Backend**: Node.js, Express, tRPC, Prisma ORM
- **Database**: PostgreSQL (web), SQLite (desktop/mobile via SQLx in Rust)
- **Package Manager**: Bun (v1.2.8+)
- **Build Tool**: Turbo (monorepo management)
- **AI**: Multiple AI providers (OpenAI, Anthropic, Google, Azure, Ollama, etc.)
- **Tauri**: Rust-based desktop/mobile application layer with custom plugins

## Project Structure

```
blinko/
├── app/                    # Frontend React application
│   ├── src/               # React source code
│   ├── src-tauri/         # Tauri desktop/mobile app (Rust)
│   │   ├── src/local_api/ # Embedded Axum API server for offline mode
│   │   ├── src/local_db/  # SQLite database layer (SQLx)
│   │   └── src/sync/      # Conflict-free sync engine
│   └── tauri-plugin-blinko/ # Custom Tauri plugin
├── server/                 # Backend Node.js server
│   ├── aiServer/          # AI integration services
│   ├── routerTrpc/        # tRPC API routes
│   └── routerExpress/     # Express API routes
├── prisma/                # PostgreSQL schema and migrations (web mode)
├── shared/                # Shared utilities and types
└── tools/                 # Development and testing utilities
```

## Common Development Commands

### Setup & Installation
```bash
bun install                # Install dependencies
bun run prisma:generate    # Generate Prisma client
bun run prisma:migrate:dev # Run database migrations (web mode)
```

### Development
```bash
bun run dev                # Run Tauri desktop app in development
bun run dev:headless       # Run Tauri app without window
bun run dev:backend        # Run backend server only
bun run dev:frontend       # Run frontend only
bun run prisma:studio      # Open Prisma Studio for database management
```

### Testing
```bash
bun run test               # Run all tests in monorepo
bun run test:unit          # Run frontend unit tests (Vitest)
bun run test:api-local     # Run Rust integration tests for local API
bun run test:integration   # Run Node.js integration smoke tests
bun run test:tools         # Run tool script tests
```

Tests in frontend use Vitest with jsdom environment. Frontend tests are located in `app/src/**/*.test.tsx` and use React Testing Library. The frontend has a custom force-exit reporter to ensure CI/CD completes cleanly.

### Linting
```bash
bun run lint:js            # Lint frontend JavaScript/TypeScript
bun run lint:rust          # Format and lint Rust code (cargo fmt + clippy)
```

### Building
```bash
bun run build:web          # Build web application
bun run build:bundle       # Build Tauri desktop bundle
bun run tauri:desktop:build # Build desktop application
bun run tauri:android:build # Build Android application
```

### Database (Web Mode)
```bash
bun run prisma:migrate:deploy # Deploy migrations to production
bun run seed               # Seed database with initial data
```

### Mobile Development
```bash
bun run tauri:android:dev  # Run Android development build
```

## Architecture & Key Components

### Dual-Mode Architecture: Web vs Offline

Blinko has two distinct runtime modes:

1. **Web Mode**: Traditional client-server architecture
   - Backend: Node.js + Express + tRPC + Prisma + PostgreSQL
   - Frontend: React SPA communicating via tRPC and Express endpoints
   - Port: 1111 (default, configurable)

2. **Offline Mode** (Desktop/Mobile): Embedded architecture
   - Frontend: React SPA compiled into Tauri WebView
   - Local API: Embedded Axum HTTP server (Rust) running on ephemeral port
   - Database: SQLite via SQLx (Rust)
   - Communication: Frontend → Tauri commands → Axum API → SQLite

### Tauri Local API Server

The desktop/mobile app embeds a full REST API server written in Rust (Axum framework):
- Located in `app/src-tauri/src/local_api/`
- Routes defined in `router.rs`, handlers split by domain (auth, notes, files, settings, sync, share, trpc proxy)
- Binds to ephemeral localhost port (127.0.0.1:0), stored in local config
- Serves static Vditor assets (markdown editor) from bundled resources
- Implements authentication via bearer tokens stored in local config

Key handlers:
- `handlers_notes.rs`: CRUD operations for notes
- `handlers_files.rs`: File upload/download with SHA256 verification
- `handlers_sync.rs`: Sync operations with remote server
- `handlers_trpc.rs`: Proxies tRPC requests to remote server when online
- `handlers_auth.rs`: Local authentication and device pairing

### Sync Engine (Offline ↔ Remote)

Conflict-free eventual consistency using operation log and Last-Write-Wins (LWW):
- Located in `app/src-tauri/src/sync/`
- **Oplog**: Records all local changes as timestamped operations
- **Outbox**: Operations pending upload to remote server
- **LWW Conflict Resolution**: Newest timestamp wins; device ID breaks ties
- Entities synced: notes, attachments, settings
- Scheduler: Background sync triggered periodically or manually
- Migration: Initial sync from remote to local on first pairing

### Frontend Architecture
- **State Management**: MobX with custom stores in `/app/src/store/`
  - `blinkoStore.tsx`: Main application state
  - `baseStore.ts`: Base store utilities
  - `standard/PromiseState.ts`: Async state management pattern
- **Routing**: React Router v7
- **UI Components**: Custom components with HeroUI (@heroui/react)
- **Editor**: Vditor for markdown editing, Excalidraw for diagrams
- **Internationalization**: i18next with multiple language support
- **API Communication**:
  - Web mode: tRPC client for type-safe API calls
  - Offline mode: Axios to local Axum API, with fallback tRPC proxy for remote calls
  - Abstraction layer in `lib/axios.ts` and `lib/tauriHelper.ts`

### Backend Architecture (Web Mode)
- **API Layer**: Hybrid approach using both tRPC (type-safe) and Express routes
  - tRPC routes in `/server/routerTrpc/`
  - Express routes in `/server/routerExpress/`
- **Authentication**: Multiple providers (local, OAuth via passport)
- **File Storage**: Local filesystem or S3-compatible storage
- **AI Integration**: Factory pattern for multiple AI providers in `/server/aiServer/providers/`
- **Background Jobs**: Cron-based scheduled tasks
- **Embeddings**: RAG (Retrieval-Augmented Generation) support with @mastra/rag

### Database Schema
- **Web Mode**: PostgreSQL via Prisma
  - Schema: `prisma/schema.prisma`
  - Migrations: `prisma/migrations/`
  - Main entities: accounts, notes, attachments, tags, comments, conversations
- **Offline Mode**: SQLite via SQLx (Rust)
  - Schema: `app/src-tauri/migrations/*.sql`
  - Main tables: notes, attachments, tags, settings, oplog, outbox, conflicts
  - Sync fields: sync_id (UUID), updated_at, device_id

### Custom Tauri Plugin

`app/tauri-plugin-blinko/`: Custom plugin with platform-specific implementations
- `desktop.rs`: Desktop-specific features (clipboard, text selection, hotkeys)
- `mobile.rs`: Mobile-specific features
- `commands.rs`: Tauri commands exposed to frontend

## Environment Configuration

Create a `.env` file in the root directory (see `.env.tmpl` for template):
```
DATABASE_URL=postgresql://user:password@localhost:5432/blinko
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=http://localhost:1111

# Optional S3 storage
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=

# AI Providers (optional)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
# ... other AI provider keys
```

Desktop/mobile apps use local config file instead of .env (stored in app data directory).

## Important Patterns

### Working with Dual Modes
- **Frontend code** must handle both web and offline modes
  - Check `window.__TAURI__` to detect Tauri environment
  - Use `lib/tauriHelper.ts` for platform abstraction
  - Local API base URL obtained via Tauri command `get_local_api_base_url`

### File Operations
- Web mode: Use routes in `/server/routerExpress/file/`
- Offline mode: Use local API handlers in `app/src-tauri/src/local_api/handlers_files.rs`
- Files stored with SHA256 hash for deduplication

### AI Features
- AI providers configured in `/server/aiServer/providers/`
- Desktop app can use local Ollama server managed by Tauri

### Type Safety
- Use tRPC routes when possible for type-safe API calls (web mode)
- Offline mode uses REST API with Zod validation on both ends

### State Management
- Follow MobX patterns in store files
- Use `PromiseState` pattern for async operations

### Sync Considerations
- Always include sync_id, updated_at, device_id when modifying entities
- Conflicts logged to conflicts table for manual resolution
- Soft deletes via deleted_at timestamp

## Deployment

### Docker (Web Mode)
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Manual Deployment (Web Mode)
1. Build the application: `bun run build:web`
2. Run migrations: `bun run prisma:migrate:deploy`
3. Start the server: `bun run start`

### Desktop App Distribution
- macOS: Sign and notarize, or users must run `sudo xattr -rd com.apple.quarantine /Applications/blinko.app`
- Windows: Code signing recommended
- Linux: AppImage or package distribution

## Port Configuration
- Web Mode: 1111 (default, configurable via env)
- Desktop Local API: Ephemeral port (stored in local config)

## Key Dependencies Notes
- Uses Bun as package manager and runtime
- Requires Node.js >= 20.0.0
- Web mode requires PostgreSQL database
- Desktop/mobile use embedded SQLite
- Tauri requires Rust toolchain for desktop/mobile builds
- Cargo dependencies defined in `app/src-tauri/Cargo.toml`
