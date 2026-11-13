# Shotclock project context

Snapshot verified against the workspace and local database on 2026-11-08. The shared workspace documentation is in `../docs/`; start with its `README.md`, `project-overview.md`, and `progress.md` when available. This file remains a standalone overview for checkouts without that directory. Documentation is a guide, not a substitute for inspecting current code, migrations, configuration, and the user's latest instructions. Update both the relevant workspace docs and this snapshot when durable product or architecture facts change. Do not record credentials, personal data, or temporary session details here.

The optional skill catalog at `../docs/agent-skills.md` describes the user's installed agent skills and when they may help. Skills are installed per user and may be unavailable in another environment; consult the current session's available skills and read relevant instructions on demand.

## Product

Shotclock is a basketball league management system. An organization uses it to manage its leagues. The current data model covers organizations, leagues, league members, seasons, teams, players, season rosters, venues, games, and player game statistics. The organization is the top-level business context; membership and operational authorization must be designed and enforced as features are built.

An organization currently has one owner user reference and can have multiple leagues. A user can own multiple organizations. The schema records membership at the league level; it does not currently have an organization-membership table. The existence of a database table does not mean the corresponding UI, API, permissions, or complete business workflow exists.

## Workspace and repositories

The workspace contains two **independent Git repositories** and their uncommitted changes must be handled separately:

| Directory | Responsibility |
| --- | --- |
| `shotclock/` | Next.js web application, frontend authentication gateway, UI, assets, and frontend tests. This document lives here. |
| `shotclock-api/` | NestJS HTTP API, authentication, PostgreSQL/Kysely database setup, migrations, generated database types, and API tests. |

When working from this repository, the API is normally at `../shotclock-api/`. When working from the API repository, the web app and this document are normally at `../shotclock/`. Confirm the paths exist; each repository can also be opened independently. Both use pnpm and have separate `package.json` and `pnpm-lock.yaml` files.

## Current implementation

### Web application

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/ui using Base UI and the `base-vega` style, TanStack Query for client-side server state, and Redux Toolkit for shared mutable client UI state. Existing components and aliases are defined by `components.json`.
- Browser and Apple touch icons use the Shotclock mark from `public/shotclock-mark.svg`.
- `/` is the protected dashboard with a responsive shell, Shotclock logo, current user, sign-out, and management navigation. It shows the selected division's registered-team count, upcoming games, results, and standings.
- After sign-in, `/organizations` prompts users to choose or create an organization before entering the dashboard. The sidebar footer shows the current organization and links to this picker; its account menu provides sign-out. The selected organization ID is stored in tab-scoped session storage across refreshes and cleared on sign-in/sign-out; the owner-scoped API list validates the selection and API authorization remains authoritative.
- The desktop sidebar collapses to an icon rail that retains the Shotclock mark, navigation, organization switcher, and account avatar; mobile uses a full navigation drawer.
- Management screens use the selected organization without displaying it beside the league and season filters. If the choice is missing or inaccessible after the organization list loads, they redirect to the picker and return to the original management URL after selection. Lookup failures show a retry option; no different organization is selected automatically.
- The Seasons page defaults to all leagues in the chosen organization and lists league, status, and separate start and end dates. League and status filters apply immediately, name search is debounced, and the API applies all filters to its owner-checked database query. Its server-side pagination defaults to 10 rows and offers 20 when more than 10 match; other season selectors use the existing unpaginated response. Creating a season uses the league selected in the header, independently of the list filter.
- Required form labels use a red asterisk, including required date and selection controls; optional fields remain unmarked.
- The Divisions page uses an Open division toggle for unrestricted categories and otherwise requires an inclusive minimum age, an exclusive upper age limit, or both; every season starts with Open. Teams & rosters defaults to all division registrations in the selected season, offers a division filter, and has a table/card view switch saved in browser local storage. Both views use server-side pagination, search and actions. Creating a team uses the selected league and draft or active season, with one or more divisions chosen in the modal. Teams can register once per division per season; each registration has its own roster, opened from the team’s actions menu in table or card view. Organizers create organization players with a birth date and optional position when adding them to a roster; the form does not currently offer existing-player selection. A player record can join one team per season; roster team and division corrections are not offered in the interface, and active-season transfers are blocked. Age-limited registration checks the season start date. Existing Open rosters without birth dates are preserved.
- The Games page defaults to all divisions in the selected season and filters scheduled games and final results by division and local date. The manual scheduling dialog displays division, teams, date, time and venue together; changing divisions clears only the team choices. Organizers preview, adjust and atomically save single or double round robins across eligible divisions using shared availability, venues, duration, rest, time zone and playoff settings. Existing games block generation only for their own division and remain court conflicts; divisions with fewer than four teams receive no playoffs. Each team plays its preliminary rounds in order; other teams may use open slots meanwhile. All ready divisions generate their next playoff stage together. Team registrations are locked while a generated schedule exists. Eligible unplayed games can be removed, and score corrections cannot invalidate downstream playoff participants. Organizers choose pacing (weekly by default: a team's games are at least 7 days apart; spread evenly across the dates; or as early as possible), a games-per-team-per-day limit (default 1), court changeover minutes (default 0), blackout dates and team unavailable dates for each generation. Placement balances teams' tip-off times and venues and falls back to earliest slots when balancing would leave a game unplaced. The bounded greedy search can still miss an arrangement that exists; games it cannot place are listed with a reason instead of failing the whole preview.
- Preliminary schedule generation uses a dedicated page for the header's selected league and season; playoff scheduling remains a dialog. Organizers are warned before an unsaved preview is discarded. When organizers request a preview, they see required games by division and an upper bound for free court slots after existing bookings. A proven shortfall blocks preview and explains what to change. A day/week calendar shows proposed games and read-only bookings at selected venues; in week view, proposed games can be dragged to another day, keeping their time. Editing uses the grouped list and runs live server conflict checks that name the related draft or existing game and team, with a summary by conflict type. Find open slots suggests up to three valid times for a draft or unplaced game. Games the organizer moves are kept, can be reverted to the generated slot, and stay fixed when the other games are regenerated. Unplaced games must be placed before saving. Saving independently rechecks the full batch under the existing locks.
- Organizers can mark an absent team as forfeiting an unplayed active-season game, awarding the opponent a 20–0 win that counts in standings and playoffs. Forfeits are labeled and can be corrected under existing playoff protections; a regular score replaces the forfeit. Edit schedule checks venue and division-registration conflicts, asks for game duration (defaulting unrecorded duration to 60 minutes), and records time, venue and duration changes in schedule history. History is removed when an eligible game is deleted.
- The Standings page shows the selected division's registered teams ranked by preliminary wins, head-to-head wins among teams tied on wins, head-to-head point difference, overall point difference, team name, and ID. It highlights up to three leaders after final results exist and displays the full table, including zero records before the first final score. The dashboard links to the full standings.
- The Venues page lists venues in the workspace league with a debounced name search and league scope handled by the owner-scoped API. Owners can add and edit venue names and optional addresses in dialogs; venues remain in their original leagues.
- Organization creation and renaming happen in the picker. The separate Organizations management page was removed; `/manage/organizations` redirects to `/organizations` for existing links.
- Login, registration, email verification, verification resend, forgot-password, and password-reset pages use a separate authentication layout. The current visual direction is clean and professional, with restrained basketball-court linework and the reusable vector mark at `public/shotclock-mark.svg`.
- Main entry points include `app/page.tsx`, `app/manage/[section]/page.tsx`, `components/league-workspace.tsx`, `components/authenticated-shell.tsx`, `components/app-sidebar.tsx`, `components/login-form.tsx`, and `app/api/league/[...path]/route.ts`.
- `components/app-providers.tsx` supplies the QueryClient and Redux store. A fresh, non-retrying TanStack Query checks session status during restore; Redux manages shared sidebar and selected organization/league/season state. Successful sign-in and sign-out clear the query cache and reset UI state. Credentials and tokens must not be placed in either cache or Redux.
- The authenticated header selects league and season; the dashboard, games, and standings offer division selection within each page. A sole selection or sole active season is selected automatically; ambiguous choices require user selection. Browser local storage remembers choices, validated against owner-scoped API results. Venues follows the selected league. The roster detail identifies its own season and division.
- League queries remain fresh in memory until a related successful mutation invalidates them. `lib/league-cache.ts` maps changes to affected query families and notifies other same-origin tabs through `BroadcastChannel` where available; session changes clear those tabs' caches and reload them. A reload clears the in-memory cache. External changes and changes on other devices are not pushed to the browser and require a reload; server session and authorization checks remain authoritative.
- Owners can create and edit organizations, leagues, seasons, divisions, teams and players, register division teams, manage rosters, create venues, schedule games, enter and correct final scores, and see standings. Empty draft divisions, eligible draft team or roster registrations, and eligible unplayed games can be removed. No invitations, player accounts, statistics, birth-certificate uploads, live scoring, payments, or other deletion workflows are included. Duplicate player records can bypass the per-player registration check.

### API and authentication

- NestJS on Node.js, PostgreSQL, Kysely, `kysely-ctl`, and `kysely-codegen`. `src/app.module.ts` registers authentication and league modules; `src/database/database.service.ts` owns the database connection. League endpoints validate the active session and scope all operations through the organization owner.
- Email/password registration requires email verification before login. Passwords are hashed with Argon2id. Verification and password-reset tokens are single-use and time-limited; passwords are 12–128 characters for registration and reset.
- The API exposes `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/forgot-password`, `/auth/reset-password`, and `GET /auth/me`. See the API `README.md` and `src/auth/auth.controller.ts` for request and response details.
- Access tokens are signed and short-lived (15 minutes). Opaque refresh tokens rotate transactionally; replay revokes the session family. A session has a seven-day idle limit and a 30-day absolute limit. Logout revokes a session; password reset revokes all the user's sessions. Token digests, not raw refresh or action tokens, are stored in the database.
- Authentication rate limits are database-backed. Per-client IP attestation is optional and only safe when a trusted ingress strips and overwrites the configured header; see the API README before changing this behavior. Email is sent asynchronously over SMTP, without a durable delivery queue. Verification and reset links carry tokens in URL fragments.

### Browser/API boundary

The browser calls Next.js route handlers under `/api/auth/[action]` and `/api/league/[...path]`; the Next.js server calls the NestJS API. The gateway keeps tokens in host-only HTTP-only cookies, with `SameSite=Lax` and `Secure` in production, and checks the configured origin plus a custom request header for state-changing requests. Do not expose access or refresh tokens to browser storage, logs, URLs, or client-side JavaScript. Verification and reset action tokens are intentionally carried in URL fragments and submitted by the client.

`lib/auth-server.ts` performs the authoritative API session check. The authenticated shell handles anonymous, restore, and unavailable states. `components/session-actions.tsx` coordinates refresh across tabs with Web Locks before retrying; keep refresh rotation and replay handling in sync when changing this flow. Backend authorization must not rely solely on hiding frontend controls or on cookie presence.

## Data model

The migrations under `../shotclock-api/src/database/migrations/`, including the league MVP constraints migration, and generated types at `../shotclock-api/src/database/db.d.ts` are the current implementation references.

### Identity: `auth`

- `auth.users`: shared account identity, normalized email, password hash, optional name, and email-verification state.
- `auth.sessions`: per-user session expiry and revocation state.
- `auth.refresh_tokens`: hashed refresh tokens and their session relationship.
- `auth.action_tokens`: hashed verification and password-reset tokens with purpose, expiry, and use state.
- `auth.rate_limits`: shared authentication rate-limit windows.

### Basketball domain: `league`

| Table | Role and relationships |
| --- | --- |
| `organizations` | Organization name and `owner_user_id` referencing `auth.users`. |
| `leagues` | Belongs to an organization; stores name and optional location. |
| `league_members` | Associates a user with a league and a text role. |
| `seasons` | Belongs to a league; stores name, optional dates, and status; defaults to `draft`. |
| `divisions` | Belongs to a season; stores a name and optional inclusive minimum and exclusive upper age limits. |
| `teams` | Belongs to a league; stores name and optional abbreviation. |
| `season_teams` | Connects a season, division, and team in the same league; status defaults to `pending`. |
| `players` | Player identity with optional unique account link, name, birth date, and position. |
| `organization_players` | Associates reusable players with organizations. |
| `rosters` | Connects a player to a season team, with optional nonnegative jersey number and a status defaulting to `pending`. |
| `venues` | Belongs to a league; stores name and optional address. |
| `games` | Belongs to a season; references home and away season teams, optional venue/schedule/scores, and status defaulting to `scheduled`. Scores must be nonnegative when present. |
| `division_schedules` | Captures the generated round-robin format, playoff settings and division-registration snapshot. Games store their stage, round and duration; existing games default to preliminary. |
| `game_schedule_changes` | Records an editor and the previous and updated time, venue and duration; removed with its game. Games optionally identify a forfeiting registration with a constrained 20–0 final score. |
| `player_game_stats` | Connects a game and roster entry, with nonnegative points, rebounds, assists, steals, blocks, turnovers, and fouls. |

Composite foreign keys enforce league, season, and division consistency. Constraints enforce one team registration per division, one player record per season, distinct game teams, valid scores, and unique non-null jersey numbers per roster. The API also requires the venue to belong to the game's league. Stat eligibility and additional roles remain undefined.

Seasons transition draft → active → completed; completion requires at least one game and every game finalized, including the championship and optional third-place game for generated playoff schedules. Optional season dates are calendar-date strings (`YYYY-MM-DD`) and do not use time-zone conversion. Score corrections remain allowed after completion when they do not change downstream playoff participants. Preliminary standings sort by wins, tied-group head-to-head wins and point difference, overall point difference, team name and ID. Game times are stored as UTC and shown in browser-local time.

## Local development and migrations

- Review each repository's `README.md`, `.env.example`, and package scripts. Actual `.env` and `.env.local` files contain local configuration and may contain secrets; never print their values or copy them into documentation.
- The last configured local setup used the web app on `http://localhost:3100`, API on `http://localhost:3101`, and a local MailDev inbox on `http://localhost:1080` with SMTP on `127.0.0.1:1026`. Ports and running processes may change; inspect them before starting or stopping anything. MailDev captures messages locally; it is not production email delivery.
- Example commands from their respective repositories: `pnpm exec next dev -p 3100` for the web app and `pnpm start:dev` for the API. Use the actual local configuration rather than assuming example defaults.
- API CLI scripts load settings in this order: process environment, `.env.local`, then `.env`. `scripts/load-db-env.cjs` derives the codegen connection URL from `DB_*`, so migration and generated types use the same target. Verify the exact target before executing database operations.
- Create migrations with `pnpm migrate:create <name>`, apply with `pnpm migrate:latest`, and regenerate with `pnpm generate:schema`. Do not edit applied migrations or hand-edit `src/database/db.d.ts`. Use schema-qualified Kysely/SQL names and check both schemas are present in generated types.
- The existing schema migration moves authentication tables and has a rollback that **drops all league tables and their data**. Exercise destructive rollback only on a disposable database. Coordinate any migration that changes auth tables with API deployment/restart so running code and database schema remain compatible.
- Database integration tests use explicitly named disposable `shotclock_auth_dev_test_<hex>` databases and opt-in environment flags. The API README documents the separate authentication and migration up/down test setups. Never point destructive migration tests at a real development or production database.

## Verification and user preferences

- Do not run a whole-project typecheck by default. Small changes: lint changed files and run the tests relevant to the change. Run a full typecheck only for shared types, API contracts, many files, or an explicit request.
- Run any full typecheck alone, not alongside Jest, builds, or other heavy commands. Set `NODE_OPTIONS=--max-old-space-size=2048` and invoke the local `node_modules/.bin/tsc` directly. Report only errors in files touched by the change. After stopping a long-running check, confirm its Node process exited.
- Frontend examples: `pnpm exec eslint <changed files>` and `node --test tests/auth-security.test.ts`; see the web README for gateway tests. Backend examples: `pnpm exec oxlint <changed files>`, `pnpm test --runInBand`, and `pnpm test:e2e --runInBand`. Use the API README's isolated PostgreSQL instructions when testing database behavior.
- The frontend has had unrelated pre-existing type errors; verify the current state instead of assuming a full-project typecheck is clean. The existing Next.js configuration skips TypeScript validation during its build, so a successful build is not evidence that typechecking passed.
- Prefer clean, professional product UI and existing project patterns. Do not present sample dashboard metrics as actual league data. Maintain accessibility, responsive behavior, and clear loading, empty, and error states when building operational screens.
- Preserve work already present in each repository. Do not commit, deploy, or alter external environments unless requested or otherwise authorized. Keep this document current when product direction or implemented behavior changes; avoid inventing requirements for unfinished features.


Draft registration corrections: organizers can register an existing league team in a chosen division, move a draft team registration when its roster is eligible and no games reference it, and remove a draft team registration using the separate Remove team action only if no roster or game depends on it. Draft roster entries can be removed without deleting the player record, unless game statistics reference the entry. Active-season transfers and removal remain locked.

The app header selects league and season. Teams & rosters defaults to registrations for all divisions in the selected season, with a division filter and Division table column; the dashboard, Games, and Standings retain page-level division selectors.

Roster tables display each player’s position and age at the season start date. Age is unavailable when the birth date or season start date is missing.

The edit-player dialog also allows changing the jersey number for that roster entry.

The team-row Add to division action registers the team only in another division of its current season.
