# SIGMATA

This repository is an incomplete backend foundation. Complaint endpoints, complaint permissions, database migrations, and Go-to-inference integration are not implemented. The API deliberately reports not ready. Do not deploy it as a working complaint system.

## Local containers

Copy `.env.example` to `.env`, set unique PostgreSQL and Keycloak admin passwords, then run `docker compose up --build -d`. The API is at http://localhost:8080, Keycloak at http://localhost:8081, and Redis, PostgreSQL and inference are internal. Data persists in named volumes. Keycloak uses its development file database and HTTP; this setup is for local development only. Production requires a supported persistent database, HTTPS, an appropriate hostname, managed secrets, and a deployment-specific configuration.

Keycloak imports `infra/keycloak/sigmata-realm.json` only when the realm does not already exist. Editing the file does not update an existing realm; manage an existing realm through Keycloak administration or intentionally recreate the local Keycloak data after backing it up. The bootstrap admin password applies on initial creation, not as an automatic password update. Postgres credentials similarly apply only on initial database creation.

## Identity and API

The `sigmata` realm has public authorization-code clients `citizenWeb` and `internalWeb`, both requiring PKCE S256, and realm roles `citizen`, `operator`, `opdStaff`, and `admin`. Redirects are local development placeholders: citizen uses `http://localhost:5173/*` and internal uses `http://localhost:5174/*`; configure exact application callbacks and origins for deployment. The web application does not yet implement OIDC login or registration.

Realm self-registration is enabled and grants the citizen role through the default role. Staff accounts and privileged role assignments must be created by a trusted Keycloak administrator; never delegate role-management permissions to citizens. Registration is realm-wide: a citizen can also register or authenticate through the internal client, but registration does not grant staff roles. The internal client requires password and OTP, including OTP setup on first login. This is role separation, not separate identity stores. If policy requires preventing citizens from even using the internal client or registration entry point, implement and verify a controlled registration/client-access flow or use separate realms.

`GET /api/me` requires a Keycloak access token with the `sigmata-api` audience and returns its subject and realm roles. The API verifies RS256 signatures against Keycloak JWKS, issuer, audience, expiry, token type and authorized client. Health endpoints remain public. The reusable `requireRoles` middleware additionally requires the internal client and a matching realm role; apply it after authentication to every future privileged API route. There are no staff routes or role-assignment endpoints yet, and complaint-level authorization is not implemented. JWT validation is offline with respect to user/session revocation: issued tokens remain valid until expiry. Keys are retrieved from Keycloak on each request, so Keycloak must be reachable.

To run the Go API outside Compose, set `OIDC_ISSUER=http://localhost:8081/realms/sigmata`, `OIDC_JWKS_URL=http://localhost:8081/realms/sigmata/protocol/openid-connect/certs`, and `OIDC_AUDIENCE=sigmata-api`, then run `go run ./cmd/server` in `apps/api`. Run its tests with `go test ./...`. The frontend is in `apps/web`. The separate FastAPI inference service reports process health and an unavailable model; predictions require human review.
