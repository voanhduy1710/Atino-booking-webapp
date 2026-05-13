# Deploy Scripts Reference

Four PowerShell scripts manage local dev and cloud deployment.

---

## Quick Reference

| Script | Purpose | When to use |
|---|---|---|
| `clean_restart.ps1` | Kill all processes, then launch local dev | Backend changes not taking effect |
| `deploy_local.ps1` | Start frontend + backend locally, stream logs | Normal daily dev |
| `deploy_test.ps1` | Build + deploy to Cloud Run **test** service | Pre-prod validation |
| `deploy.ps1` | Build + deploy to Cloud Run **production** | Production release |

---

## `clean_restart.ps1`

**Nuclear reset for the local environment.**

Runs 4 steps in sequence:

1. Kill all `python` processes
2. Kill processes on ports `8000` and `8080` (backend)
3. Kill processes on ports `5173` and `5174` (Vite frontend)
4. Kill all `node` processes

Waits 2 seconds for OS to release ports, then **automatically calls `deploy_local.ps1`** to restart.

**Use when:** You changed backend code but the running server still serves old behavior — a stale uvicorn reload or zombie process is likely holding the port.

```powershell
.\clean_restart.ps1
```

---

## `deploy_local.ps1`

**Runs frontend and backend together in one terminal window.**

### What it does

1. Checks ports `8080` (backend) and `5173` (frontend) — kills any existing processes
2. Waits 1.5 seconds for port release
3. Launches **frontend** (`npm run dev` in `/frontend`) as a background job
4. Launches **backend** (`uvicorn` on port `8080` with `--reload` in `/backend`) as a background job
5. Polls both jobs every 200 ms, prefixes lines with `[FE]` or `[BE]`, and prints to terminal
6. On `Ctrl+C` — stops and removes both jobs cleanly

### Endpoints after start

| Service | URL |
|---|---|
| Frontend | `http://localhost:5173` |
| API | `http://localhost:8080/api/v1` |
| API Docs (Swagger) | `http://localhost:8080/docs` |

```powershell
.\deploy_local.ps1
```

---

## Log Control Flags

**This is the most important section for day-to-day use.**

Near the top of `deploy_local.ps1` (lines 22–27) there is a logging block:

```powershell
# -------------------------------------------------------------------- logging frontend and backend
# Both services run as background jobs, output streamed here with [FE]/[BE] prefixes.
# Toggle these flags to silence output if too noisy.
# $showFrontendLogs = $true
# $showBackendDetailLogs = $true
$showBackendLogs = $true
```

Three flags control what gets printed. Each flag is either **uncommented** (active) or **commented out** (inactive/silent).

### `$showFrontendLogs`

Controls all Vite/React frontend output (`[FE]` lines).

```powershell
# OFF (default) — no frontend output:
# $showFrontendLogs = $true

# ON — show all [FE] lines:
$showFrontendLogs = $true
```

**When to turn on:** Debugging hot-module reload failures, Vite build errors, or import resolution issues.

---

### `$showBackendLogs`

Master switch for all backend output (`[BE]` lines).

```powershell
# OFF — silence all backend output:
# $showBackendLogs = $true

# ON (default) — show backend output:
$showBackendLogs = $true
```

**When to turn off:** You only care about frontend behavior and the backend log stream is noise.

---

### `$showBackendDetailLogs`

Controls **how much** backend output prints — only meaningful when `$showBackendLogs` is active.

```powershell
# OFF (default) — filtered mode, shows only:
#   INFO: ...
#   GET /...   POST /...   PUT /...   DELETE /...   PATCH /...   OPTIONS /...
# $showBackendDetailLogs = $true

# ON — show every line uvicorn/FastAPI prints:
$showBackendDetailLogs = $true
```

**When to turn on:** Debugging Python exceptions, print statements, or sqlalchemy queries.

**When to leave off:** Normal use — HTTP request lines are enough to confirm the API is responding.

---

### Flag Combinations

| Frontend | Backend | Detail | Result |
|---|---|---|---|
| commented | `$showBackendLogs = $true` | commented | **Default** — backend HTTP lines only |
| `$showFrontendLogs = $true` | `$showBackendLogs = $true` | commented | Both services, filtered backend |
| commented | `$showBackendLogs = $true` | `$showBackendDetailLogs = $true` | Full backend verbosity, no frontend |
| `$showFrontendLogs = $true` | `$showBackendLogs = $true` | `$showBackendDetailLogs = $true` | Everything — maximum noise |
| commented | commented | — | Silent — no log output at all |

---

## `deploy_test.ps1`

**Deploys to the isolated Cloud Run test service (`atino-pl-app-test`). Production is never touched.**

Steps:

1. `gcloud builds submit` — builds Docker image, tags it for the test repo path
2. `gcloud run deploy atino-pl-app-test` — deploys to `asia-southeast1` with:
   - 4 GiB memory, 2 CPU, CPU boost
   - **Timeout: 3600 s** (longer than prod — useful for slow test scenarios)
   - Env vars from `cloud-run-env.yaml`
3. Prints the live test URL
4. Cleans up **all untagged images** from Artifact Registry for the test service (keeps only `latest`)

```powershell
.\deploy_test.ps1
```

If build fails → script exits with error, deployment skipped. Production untouched.

---

## `deploy.ps1`

**Deploys to production Cloud Run service (`atino-pl-app`).**

Steps:

1. `gcloud builds submit` — builds Docker image
2. `gcloud run deploy atino-pl-app` — deploys to `asia-southeast1` with:
   - 4 GiB memory, 2 CPU, CPU boost
   - **Timeout: 300 s**
   - Env vars from `cloud-run-env.yaml`
3. Prints the live production URL
4. Cleans up old images from Artifact Registry — **keeps the 3 most recent digests**, deletes the rest

```powershell
.\deploy.ps1
```

If build fails → deployment aborted. Script exits early.

---

## Cloud Config Summary

| Setting | Value |
|---|---|
| GCP Project | `atino-vietnam` |
| Region | `asia-southeast1` |
| Artifact Registry repo | `atino-docker` |
| Prod service | `atino-pl-app` |
| Test service | `atino-pl-app-test` |
| Port | `8080` |
| Memory | `4 GiB` |
| CPU | `2` |
| Env vars file | `cloud-run-env.yaml` |

---

## Typical Workflows

**Normal dev:**
```powershell
.\deploy_local.ps1
```

**Backend not updating:**
```powershell
.\clean_restart.ps1   # kills everything, auto-restarts local dev
```

**Test before prod:**
```powershell
.\deploy_test.ps1     # validate on test URL
.\deploy.ps1          # promote to production
```

**Too much log noise locally:**
Edit lines 25–27 of `deploy_local.ps1` — comment/uncomment `$showFrontendLogs`, `$showBackendLogs`, `$showBackendDetailLogs` as needed.
