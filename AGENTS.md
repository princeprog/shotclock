# Shotclock web agent context

Shotclock is a basketball league management system for organizations. This repository is the Next.js frontend; its sibling `../shotclock-api/` contains the NestJS API and PostgreSQL migrations. When available, start with `../docs/project-overview.md` and `../docs/progress.md`, then use `../docs/README.md` and `../docs/features/README.md` to select task-relevant context. `PROJECT_CONTEXT.md` is a standalone context snapshot if the workspace docs are unavailable. Verify current code before relying on documentation. If the sibling repository is unavailable, do not assume its API or database state.

When available, consult `../docs/agent-skills.md` and read relevant available skills on demand; follow the user's instructions and this repository's requirements.

- Use pnpm and existing shadcn/ui components. This project uses Next.js App Router, React, Tailwind CSS, and shadcn's Base UI `base-vega` variant.
- Use TanStack Query for client-side server state and Redux Toolkit for shared mutable client UI state. Create stores per provider/request; do not put credentials or tokens in either store. Keep authoritative session and authorization checks on the server.
- The `/` dashboard is authenticated and displays owner-scoped data for the selected season. Keep authentication and organization boundaries intact.
- The user prefers a clean, professional interface. The existing login uses restrained basketball-court linework and the reusable Shotclock logo; extend the current design intentionally.
- For small changes, use changed-file lint and relevant tests instead of a full-project typecheck. Run a full typecheck only for shared types, API contracts, many files, or an explicit request; run it alone with `NODE_OPTIONS=--max-old-space-size=2048` and the local `node_modules/.bin/tsc`. Report only errors in touched files. After stopping a long-running check, confirm its Node process exited.
- Preserve existing uncommitted changes and never print secrets or tokens. Update the relevant workspace docs and `PROJECT_CONTEXT.md` when durable project facts change.
