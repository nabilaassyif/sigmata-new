# SIGMATA

This repository contains the Vite frontend and an **incomplete backend foundation**. The Go service currently exposes only process health; it deliberately reports not ready. Complaint endpoints, authentication, database migrations, governance, SLA, and Go-to-inference integration are not implemented. Do not deploy it as a working complaint system.

The separate FastAPI service reports process health and an unavailable model. Predictions require human review and contain no fabricated classification. No model or LLM fallback is configured.

## Local containers

Install Docker with Compose, copy `.env.example` to `.env`, and replace the password with a unique development value. The password is only applied when the Postgres volume is initialized; changing it later requires changing the database user's password separately. Then run:

```sh
docker compose up --build -d
docker compose ps
docker compose logs -f api
docker compose logs -f inference
```

The API listens on `127.0.0.1:8080`; the database, Redis, and inference service are internal only. Add a local Compose override if direct development access is needed, and bind its ports to `127.0.0.1`. Named volumes persist database and Redis data. The health checks report process availability; model readiness is available separately at `/readyz`. Image tags should be regularly updated and scanned; tags are not immutable digests. The PostgreSQL/PostGIS and Redis versions follow the requested major versions.

Both application images have separate builder and non-root runner stages. Alpine may not support future model dependencies with prebuilt wheels; reassess the Python base when the actual GRACE-LAKSA runtime is integrated.

## Local development

The frontend lives in `apps/web` and needs only Node.js. The backend does not yet implement the frontend contract or a Vite proxy. To run the current Go process, run `go run ./cmd/server` in `apps/api`. For inference, create a Python 3.11+ virtual environment in `services/inference`, install `pip install -e '.[test]'`, and run `uvicorn app.main:app --port 8001`. Run tests with `pytest` from that directory and `go test ./...` from `apps/api`.
