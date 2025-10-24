# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

News-CHECK is a Next.js 15 application (App Router) for team communication and news management. It combines news distribution, team collaboration features (TeamHub), quality assurance tracking, and administrative tools. The app uses Supabase for authentication/storage and a direct PostgreSQL connection for data operations.

## Key Technologies

- **Framework**: Next.js 15 (App Router, React 19)
- **Database**: PostgreSQL via `postgres` library (direct connection)
- **Auth/Storage**: Supabase (used for auth and file storage only)
- **UI**: Tailwind CSS with shadcn/ui components, TipTap for rich text
- **Real-time**: Supabase Realtime for live updates in TeamHub
- **AI**: OpenAI API for news agent and feedback summarization

## Development Commands

```bash
# Development server (with file watching for devcontainers)
npm run dev

# Build production bundle
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## Architecture & Data Access Patterns

### Dual Database Strategy

The application uses two database access patterns:

1. **Direct PostgreSQL (`lib/db.ts`)**: Primary data access method
   - Used in API routes and server components for CRUD operations
   - Import: `import { sql } from '@/lib/db'`
   - Example: `const rows = await sql\`SELECT * FROM posts WHERE id = ${id}\``
   - Supports transactions: `await sql.begin(async tx => { ... })`

2. **Supabase Client (`lib/supabase-server.ts`, `lib/supabase/client.ts`)**:
   - Used for authentication (`supabase.auth.getUser()`)
   - Used for real-time subscriptions in client components
   - Used for file storage operations
   - Server: `import { createClient } from '@/lib/supabase-server'`
   - Client: `import { createClient } from '@/lib/supabase/client'`

### Authentication System

Multi-layer authentication approach:

1. **JWT-based (`lib/auth.ts`)**:
   - Custom JWT tokens stored in `auth` cookie
   - Functions: `signSession()`, `verifyToken()`, `getUserFromCookies()`
   - Roles: `admin`, `moderator`, `teamleiter`, `user`

2. **Middleware (`middleware.ts`)**:
   - Role-based route protection
   - Public paths: `/login`, `/register`, API endpoints
   - Admin areas: `/admin/*`, `/api/admin/*` (accessible by admin/moderator/teamleiter)
   - Admin-only: `/admin/news-agent`, `/admin/kpis`, `/admin/checkiade`, `/admin/feedback` (admin/teamleiter only)

3. **API Route Protection**:
   - Use `requireAdmin()` from `lib/requireAdmin.ts` for admin endpoints
   - Use `getUserFromCookies()` from `lib/auth.ts` for user context

### App Structure

**Route Groups**:
- `app/(site)/*`: User-facing pages (news, events, teams, teamhub, quality, feedback)
- `app/(auth)/*`: Login and registration pages
- `app/admin/*`: Admin dashboard and management pages
- `app/api/*`: API routes organized by feature

**Key API Patterns**:
- REST endpoints follow pattern: `app/api/<resource>/[id]/route.ts`
- Protected routes check auth via `getUserFromCookies()` or `requireAdmin()`
- Cron-triggered endpoints validate via `isCronAuthorized()` from `lib/server/cronSecret.ts`

## Core Features

### 1. News System
- Posts with categories, badges, and vendors
- Rich text content via TipTap editor (`app/components/RichTextEditor.tsx`)
- Image galleries with lightbox (`app/components/LightboxGallery.tsx`)
- Automated news agent (`lib/newsAgent.ts`) that fetches and creates posts via OpenAI

### 2. TeamHub
- Team-based collaboration spaces with configurable widgets
- Real-time threads and comments via Supabase subscriptions
- Custom hooks: `hooks/useThreadRealtime.ts`, `hooks/useThreadListRealtime.ts`
- Features: polls, boards (kanban), QA tracking, feedback, roster/presence

### 3. Quality Assurance (QA)
- User-specific QA items tracked per user
- AI coach for feedback via OpenAI
- Import/export functionality for QA data

### 4. Checkiade
- Gamification system with scores, leaderboards, and widgets
- Team-based scoring and rankings

### 5. Events & Calendar
- FullCalendar integration for event display
- iCal support for external calendar feeds
- Attendee tracking

## Important Conventions

### Database Tables
- Table name constants in `lib/tables.ts` (use `T.posts`, `T.vendors`, etc.)
- User table: `app_users` (not `users` - that's Supabase auth table)
- All IDs are integers except `user_id` which is UUID

### Type Safety
- TypeScript strict mode enabled
- Types for TeamHub in `types/teamhub.ts`
- Role type: `'admin' | 'moderator' | 'teamleiter' | 'user'`

### Server/Client Components
- Use `'use server'` directive for server actions
- Use `'use client'` directive for client components
- Database queries (`sql`) only work in server components/routes
- Supabase client subscriptions only work in client components

### Environment Variables
Required in `.env.local`:
- `DATABASE_URL`: PostgreSQL connection string
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `AUTH_SECRET`: JWT signing secret
- `OPENAI_API_KEY`: OpenAI API key for news agent
- `NEWS_API_KEY`: NewsAPI.org key
- `CRON_SECRET`: Secret for cron endpoint authorization

### CSS & Styling
- Tailwind with custom theme in `tailwind.config.js`
- Dark mode via class strategy (`dark:` prefix)
- shadcn/ui components in `components/ui/`
- Custom components in `app/components/`

## News Agent (Automated News)

The news agent (`lib/newsAgent.ts`) automatically fetches and creates news posts:
- Triggered via cron or manual admin action: `POST /api/admin/news-agent/run`
- Uses NewsAPI.org to fetch articles based on configured keywords
- Uses OpenAI to summarize and format articles
- Configuration stored in database `news_agent_config` table
- Logs stored in `news_agent_logs` table

## Testing & Debugging

- ESLint configured but ignored during builds (`next.config.ts`)
- Use `?debug=1` query param on some API routes for verbose error info
- Supabase logs available in Supabase dashboard for auth/storage issues

## Common Gotchas

1. **Auth Cookies**: The app uses both custom JWT (`auth` cookie) and Supabase cookies. `getUserFromCookies()` handles fallback between them.

2. **Database Connection**: Use `sql` from `lib/db.ts`, not Supabase client, for data queries. Supabase client is only for auth/storage/realtime.

3. **User ID**: Always use UUID format for `user_id`. The `app_users` table user_id must match Supabase auth user id.

4. **Real-time Subscriptions**: Must be in client components. Use hooks from `hooks/` directory.

5. **Middleware Redirect Loop**: Ensure public paths are properly defined in `middleware.ts` to avoid redirect loops.

6. **Path Aliases**: Use `@/` prefix for imports (maps to project root via tsconfig.json).