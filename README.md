# Shotclock web

## Authentication setup

Copy `.env.example` to `.env.local`. Set `APP_ORIGIN` to the exact public origin of the web app and `AUTH_API_URL` to the NestJS API origin. Use HTTPS for both in production and configure the API's `FRONTEND_URL` to the same public web origin. Start the API on port 3001 and the web app with `pnpm dev` on port 3000 in local development. See the API README for database, SMTP, signing-secret, and migration setup.

New users must verify their email before signing in. Verification and password-reset links carry their one-time token in the URL fragment, which is not sent to the web server. Authentication cookies are host-only and HTTP-only; in production they require HTTPS. The web app's server must be able to reach the API.

By default the API rate-limits the gateway's shared peer address. For individual client limits, configure the API's trusted gateway addresses and shared secret, and configure the web app's matching `AUTH_GATEWAY_SECRET` and `AUTH_TRUSTED_CLIENT_IP_HEADER`. Enable this only when a trusted ingress strips incoming copies of that header, writes exactly one verified client IP, and prevents direct access that bypasses the ingress. Otherwise leave both unset and size the aggregate limit with independent ingress abuse controls. See the API README for details.

Run the lightweight security checks with `node --test tests/auth-security.test.ts`. To exercise the gateway against its mock API, start Next.js with `APP_ORIGIN=http://localhost:3100` and `AUTH_API_URL=http://localhost:3101` on port 3100, then run `node --test tests/auth-gateway.test.mjs`.

## Frontend state

TanStack Query manages client-side server state, and Redux Toolkit manages shared mutable client UI state. `components/app-providers.tsx` supplies both providers. The session-restore status check uses TanStack Query without caching credentials or retrying requests; Redux currently controls the dashboard sidebar. Sign-in and sign-out clear the query cache and reset shared UI state. Passwords and tokens must not be placed in Redux or query/mutation caches.

Run focused state checks with `node --test tests/client-state.test.ts tests/client-session.test.ts`.

## Security

- Every page response carries a per-request nonce Content-Security-Policy from `proxy.ts`; `next.config.mjs` adds nosniff, frame denial, a strict referrer policy, a permissions policy and, in production, HSTS. Scripts without the nonce are blocked.
- New package versions install only after they are a day old (`minimumReleaseAge`), except Next.js security releases.
- CI fails on high or critical `pnpm audit` findings; CodeQL, gitleaks and Dependabot run on GitHub.

### Production checklist

- Serve over HTTPS with `APP_ORIGIN` and `AUTH_API_URL` set to HTTPS origins.
- Configure `AUTH_GATEWAY_SECRET` and `AUTH_TRUSTED_CLIENT_IP_HEADER` behind an ingress that writes one verified client IP, and the matching API settings, so rate limits apply per client.
- Keep the API reachable only from the web app's network.
