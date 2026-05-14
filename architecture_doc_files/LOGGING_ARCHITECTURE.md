# PowerShell Logging Architecture

## Core Problem

Two services (frontend + backend) run as background jobs in one terminal. Background jobs in PowerShell produce output silently — it accumulates in a buffer and disappears if never read. The logging system solves three problems:

1. How to get output from background jobs into the terminal
2. How to tell frontend lines from backend lines
3. How to reduce noise without losing signal

---

## The Background Job Pattern

PowerShell's `Start-Job` runs a script block in a separate process. Output is buffered, not streamed:

```powershell
$frontendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD      # $using: passes parent scope variables into the job
    Set-Location frontend
    npm run dev 2>&1             # 2>&1 merges stderr into stdout — both captured by the job
}
```

`2>&1` is critical. Without it, stderr (where most dev tools write warnings and errors) is lost entirely. With it, all output — stdout and stderr — flows into the job's output stream.

`$using:PWD` passes the working directory from the calling scope into the job's isolated scope. Jobs do not inherit the parent shell's variables or location.

---

## The Polling Loop

Jobs buffer output. To see it, you must call `Receive-Job` explicitly. The loop does this every 200ms:

```powershell
try {
    while ($true) {
        $feLines = Receive-Job -Job $frontendJob
        if ($feLines) {
            $feLines | ForEach-Object { Write-Host "[FE] $_" -ForegroundColor Cyan }
        }

        $beLines = Receive-Job -Job $backendJob
        if ($beLines) {
            $beLines | ForEach-Object { Write-Host "[BE] $_" -ForegroundColor White }
        }

        Start-Sleep -Milliseconds 200
    }
} finally {
    Stop-Job  -Job $frontendJob, $backendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $frontendJob, $backendJob -ErrorAction SilentlyContinue
}
```

`Receive-Job` drains whatever has accumulated since the last call. If both services produce bursts of output simultaneously, each poll collects the full burst — no interleaving at the character level, only at the line level.

The `finally` block guarantees job cleanup on `Ctrl+C`. Without it, jobs become orphaned processes that continue running invisibly.

**200ms interval** — low enough to feel live, high enough not to burn CPU polling. Tunable without changing the logic.

---

## Service Prefixes

Every line printed gets a prefix that identifies its source:

```
[FE] vite v5.2.0 dev server running
[BE] INFO:     Application startup complete.
```

This is the only disambiguation mechanism. Both services' output lands in the same terminal in the same color scheme, so prefix is essential for reading mixed logs.

Pattern: `"[FE] $_"` and `"[BE] $_"` where `$_` is the current pipeline object (the raw line from the job).

---

## Color Convention

Consistent color-to-meaning mapping across all scripts:

| Color | Meaning | Used for |
|---|---|---|
| `Green` | Success / start | Service started, deployment succeeded, cleanup done |
| `Yellow` | Warning / in-progress | Killing processes, deploying, waiting |
| `Cyan` | Info / FE output | Frontend job lines, URLs, service names |
| `White` | Data / BE output | Backend job lines (raw uvicorn/FastAPI output) |
| `Red` | Error / fatal | Build failed, deploy failed |
| `Gray` | Nothing happened | "Port already free", "No processes found" |
| `DarkGray` | Low-priority detail | Image digests being deleted |
| `Magenta` | Environment marker | Test deployment header — visually distinct from prod |

This color system is independent of log content — it describes **what kind of event is happening**, not what the message says. Green always means good. Red always means stop and look.

---

## The Three Log Flags

Defined near the top of `deploy_local.ps1`, before jobs start:

```powershell
# $showFrontendLogs = $true        ← commented = OFF
# $showBackendDetailLogs = $true   ← commented = OFF
$showBackendLogs = $true           ← uncommented = ON
```

### Flag behavior

**`$showFrontendLogs`**
- ON: all `[FE]` lines print
- OFF (default): frontend block skipped entirely — `Receive-Job` not called, buffer drains silently

**`$showBackendLogs`**
- ON (default): backend block runs
- OFF: backend block skipped — all backend output silently discarded

**`$showBackendDetailLogs`** (only meaningful when `$showBackendLogs` is active)
- ON: every backend line prints regardless of content
- OFF (default): filtered mode — only lines matching:

```powershell
$line -match "^INFO:" -or $line -match "^(GET|POST|PUT|DELETE|PATCH|OPTIONS)"
```

These regex patterns match standard uvicorn/FastAPI log format:
- `INFO:     Application startup complete.`
- `GET /api/v1/approval/summary HTTP/1.1`

Everything else (Python print statements, stack traces, SQLAlchemy queries, debug output) is silently dropped when detail logs are off.

### Why default is "backend only, filtered"

Most sessions need confirmation that the API is responding (HTTP request lines) without noise from ORM queries or print() debug calls. Frontend Vite output (HMR updates, module counts) is rarely useful unless actively debugging a frontend build issue.

### How to toggle

Comment or uncomment the relevant line in the flag block. No other changes needed — the `if ($showFrontendLogs)` checks in the loop read the variable at runtime each iteration.

```powershell
# Default — backend HTTP lines only:
# $showFrontendLogs = $true
# $showBackendDetailLogs = $true
$showBackendLogs = $true

# Full verbosity — everything:
$showFrontendLogs = $true
$showBackendDetailLogs = $true
$showBackendLogs = $true

# Silent — no output at all:
# $showFrontendLogs = $true
# $showBackendDetailLogs = $true
# $showBackendLogs = $true
```

---

## Visual Separators

Long horizontal comment lines mark where the logging section begins and ends:

```powershell
# -------------------------------------------------------------------- logging frontend and backend
```

These appear three times in `deploy_local.ps1`:
1. Before the flag declarations
2. At the start of the polling loop body
3. At the end of the polling loop body

Purpose: makes the logging block instantly visible when scrolling through the script. Editor fold markers would serve the same purpose but comments are universal.

---

## Step Counters (clean_restart.ps1)

Multi-step scripts use `[N/Total]` prefixes on each phase:

```powershell
Write-Host "[1/4] Killing all Python processes..." -ForegroundColor Yellow
Write-Host "[2/4] Clearing backend ports..."       -ForegroundColor Yellow
Write-Host "[3/4] Clearing frontend ports..."      -ForegroundColor Yellow
Write-Host "[4/4] Killing Node.js processes..."    -ForegroundColor Yellow
```

User knows exactly where in the sequence they are and the total count. If a step hangs, they know which step is stuck. Format is `[current/total]`.

---

## Outcome Branching (per-step feedback)

Each step reports what actually happened — not just that it ran:

```powershell
if ($pythonProcs) {
    Write-Host "  Killed $($pythonProcs.Count) process(es)" -ForegroundColor Green
} else {
    Write-Host "  No Python processes found"                -ForegroundColor Gray
}
```

Two outcomes, two colors:
- Something was done → `Green`
- Nothing to do → `Gray`

`Gray` is deliberately non-alarming. "Port already free" is good news, not a warning. Using Yellow or Red there would cause false concern.

Indentation (`"  "` prefix with two spaces) visually separates outcome lines from step header lines — step headers are flush left, outcomes are indented.

---

## Exit Code Checks (deploy scripts)

Every destructive or irreversible operation checks `$LASTEXITCODE` immediately after:

```powershell
gcloud builds submit --tag $IMAGE_NAME --project $PROJECT_ID
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "BUILD FAILED -- deployment aborted." -ForegroundColor Red
    exit 1
}
```

Pattern:
1. Run the command
2. Check `$LASTEXITCODE` on the next line — no intervening commands that could reset it
3. Print a Red message that names the failure and its consequence
4. `exit 1` — propagates failure to the calling shell (CI, task runner, etc.)

The message always states both **what failed** and **what was prevented** ("deployment aborted", "Production is untouched"). Operator knows whether anything harmful happened.

---

## Environment Banner (deploy_test.ps1)

Test deployments open with a distinct header before any work starts:

```powershell
Write-Host "=== DEPLOYING TO TEST ENVIRONMENT ===" -ForegroundColor Magenta
Write-Host "Service: $SERVICE_NAME"                -ForegroundColor Magenta
```

`Magenta` is used nowhere else — it's exclusively the test environment marker. This prevents confusing test and prod deploy logs when scrolling terminal history. Prod deploy has no banner (green "Building..." is the first line) so the presence of magenta is unambiguous.

---

## Non-Fatal Warning Pattern

Operations that can fail without breaking the main outcome (e.g., image cleanup after a successful deploy) use try/catch with a Yellow warning instead of Red + exit:

```powershell
try {
    # cleanup work
} catch {
    Write-Host "Warning: Image cleanup failed, but deployment was successful." -ForegroundColor Yellow
}
```

The message explicitly states the main operation succeeded. Yellow signals "look at this but don't panic." `exit` is not called — the script completes normally.

---

## Applying This Pattern to Another Project

### Minimum viable version (two services, one terminal)

```powershell
# --- LOG FLAGS ---
# $showService1Logs = $true
$showService2Logs = $true
# $showService2DetailLogs = $true
# -----------------

$job1 = Start-Job -ScriptBlock { Set-Location $using:PWD; <service1 command> 2>&1 }
$job2 = Start-Job -ScriptBlock { Set-Location $using:PWD; <service2 command> 2>&1 }

Start-Sleep -Seconds 3

try {
    while ($true) {
        if ($showService1Logs) {
            Receive-Job -Job $job1 | ForEach-Object { Write-Host "[S1] $_" -ForegroundColor Cyan }
        }
        if ($showService2Logs) {
            Receive-Job -Job $job2 | ForEach-Object {
                if ($showService2DetailLogs) {
                    Write-Host "[S2] $_" -ForegroundColor White
                } elseif ($_ -match "^INFO:" -or $_ -match "^(GET|POST|PUT|DELETE)") {
                    Write-Host "[S2] $_" -ForegroundColor White
                }
            }
        }
        Start-Sleep -Milliseconds 200
    }
} finally {
    Stop-Job -Job $job1, $job2 -ErrorAction SilentlyContinue
    Remove-Job -Job $job1, $job2 -ErrorAction SilentlyContinue
}
```

### Checklist

- `2>&1` on every job command — captures stderr
- `$using:PWD` or `$using:varName` for every variable needed inside the job
- `finally` block always cleans up jobs
- Three flags: per-service master switch + detail switch for the verbose service
- Filter regex tuned to the specific framework's log format (`^INFO:` is uvicorn — change for other frameworks)
- Color convention: Green=success, Yellow=warning/progress, Red=fatal, Gray=nothing-happened, Magenta=test-env
- Step counter `[N/Total]` for any script with 3+ sequential phases
- Outcome branching: always print what actually happened, not just that the step ran
- `$LASTEXITCODE` check immediately after every external command that can fail fatally
- Non-fatal operations: try/catch + Yellow warning, no exit
