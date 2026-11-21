# SIGMATA

This repository is an incomplete backend foundation. Complaint endpoints, complaint permissions, database migrations, and Go-to-inference integration are not implemented. The API deliberately reports not ready. Do not deploy it as a working complaint system.

## Local containers

Copy `.env.example` to `.env`, set unique PostgreSQL and Keycloak admin passwords, then run `docker compose up --build -d`. The API is at http://localhost:8080, Keycloak at http://localhost:8081, and Redis, PostgreSQL and inference are internal. Data persists in named volumes. Keycloak uses its development file database and HTTP; this setup is for local development only. Production requires a supported persistent database, HTTPS, an appropriate hostname, managed secrets, and a deployment-specific configuration.

Keycloak imports `infra/keycloak/sigmata-realm.json` only when the realm does not already exist. Editing the file does not update an existing realm; manage an existing realm through Keycloak administration or intentionally recreate the local Keycloak data after backing it up. The bootstrap admin password applies on initial creation, not as an automatic password update. Postgres credentials similarly apply only on initial database creation.

## Identity and API

The Go API is a shared backend-for-frontend (BFF) for the citizen and internal interfaces. Keycloak keeps the two public clients `citizenWeb` and `internalWeb` with authorization code and PKCE S256. The BFF sends users to Keycloak for login or citizen registration and exchanges the code on the server. It verifies access-token signatures, issuer, expiry, API audience and client; it verifies the ID token signature, issuer, expiry, client audience, subject and nonce. Redis stores the Keycloak tokens and short-lived login state. The browser receives an opaque HttpOnly, SameSite=Lax session cookie. The local Compose configuration disables Secure cookies only for the two localhost development origins.

The realm has `citizen`, `operator`, `opdStaff`, and `admin` roles. Self-registration grants only the citizen role. Staff accounts and privileged role assignments must be created by a trusted Keycloak administrator. Registration is realm-wide, so a citizen can also authenticate through the internal client; it does not give them a staff role. The internal client is configured for password and OTP. Privileged routes must use the session middleware followed by `requireRoles`, and must only be registered for internal access. There are no staff or complaint endpoints yet.

The local clients allow exact callback URLs: `http://localhost:5173/api/auth/citizen/callback` and `http://localhost:5174/api/auth/internal/callback`. Realm imports do not update existing realms: update existing client redirect and post-logout redirect settings in Keycloak before testing these routes.

For a Go API outside Compose, set `REDIS_ADDR`, `OIDC_ISSUER`, `OIDC_JWKS_URL`, `OIDC_TOKEN_URL`, and `OIDC_AUDIENCE`. The Keycloak issuer must be the browser-facing realm URL; the JWKS and token URLs must be reachable by Go. Set `CITIZEN_ORIGIN` and `INTERNAL_ORIGIN` for the frontend origins, and register their corresponding callback and logout URLs in Keycloak. Run `go test ./...` in `apps/api`.

Production requires HTTPS, Secure cookies, a trusted same-origin reverse proxy for each frontend and its `/api` routes, appropriate Keycloak hostname settings, and secured Redis storage and transport. Redis contains access and refresh tokens, so restrict access and protect backups. The server rejects unsafe authenticated requests and logout when their Origin does not match the configured frontend origin. Apply session and authorization middleware to every future protected route; complaint-level authorization is not yet implemented. The current clients are public and use PKCE; confidential BFF clients with managed secrets should be configured for production.

## Frontends

Each app has its own npm lockfile: run `npm ci` and `npm run dev` from its directory. The internal web app runs at http://localhost:5174 and the citizen PWA at http://localhost:5173, matching the Keycloak realm's configured origins and redirect URIs. Both proxy `/api` to the local Go API during development. Only the citizen app registers a PWA service worker. The current PWA manifest references placeholder PNG icons that still need to be provided.

Both apps use Tailwind CSS v4 and have their own shadcn configuration, `cn` utility and Button component. Add components from the relevant app directory with `npx shadcn@latest add <component>`.

Both apps have a basic authentication test screen. From the citizen app, navigate the browser to `/api/auth/citizen/login` to log in or `/api/auth/citizen/login?action=register` to register. From the internal app, navigate to `/api/auth/internal/login`. Keycloak redirects back to the matching app after login. Call `GET /api/auth/citizen/session` or `GET /api/auth/internal/session` to get `{ subject, roles }`, with `401` when unauthenticated. Tokens are never returned to the frontend.

Log out by submitting a same-origin HTML form with method `POST` to `/api/auth/citizen/logout` or `/api/auth/internal/logout`; this removes the Go session and redirects the browser through Keycloak logout, which may ask for confirmation. Each app must use its own path. The session lasts up to eight hours, subject to Keycloak refresh-token expiry or logout. The API refreshes access tokens as needed. Keycloak-side logout or account changes do not immediately invalidate other existing BFF sessions; they can remain usable until their access token expires or refresh fails. Browser flows, Keycloak import, Redis integration, and logout still need end-to-end verification against a running Compose stack.
