# Booking-Atino Handover

## Production status

- Cloud Run service: `atino-booking-webapp` in `atino-vietnam` / `asia-southeast1`.
- Active revision: `atino-booking-webapp-00044-f5t` at 100% traffic.
- Production URL: `https://atino-booking-webapp-verwwjpm5q-as.a.run.app`.
- Verified after deployment: `/`, `/api/health`, and `/api/product-process` all return HTTP 200.

## Supabase migration

- Booking-Atino moved from `deuuuibkqletkkbrsmxd` to `tlzilbpgwfeushniddkb`.
- The application configuration and deployment scripts use the new project URL.
- Keep credentials only in `.env` / Cloud Run environment variables; they are intentionally not recorded here.
- Do not modify the separate Pheduyet-Atino Supabase project.

## Cloud Run architecture

Cloud Run now uses one Express process to serve both the built frontend and API. This replaced the prior nginx-to-Express proxy arrangement that produced 502 responses when the internal backend was unavailable.

## Validation completed

- TypeScript server check and production frontend build passed.
- Unit tests: 12 passed.
- Local project tester: database, API, and frontend smoke checks passed against the new Supabase project. Its remaining four failures are assertion mismatches for intentional validation/no-op responses.

## Normal workflow

1. Put the new Supabase URL and matching anon/service-role keys in `.env`.
2. Use `./clean_restart.ps1` for local development.
3. Use `./deploy.ps1` for production deployments.
4. After deployment, check `/api/health` and `/api/product-process` before considering the rollout complete.
