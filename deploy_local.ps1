# deploy_local.ps1
# Starts Vite frontend + Express backend together, streams logs with [FE]/[BE] prefixes.
# Ctrl+C cleanly stops both jobs.
# Usage: .\deploy_local.ps1

# ---------- Log control flags -------------------------------------------------
# Toggle to silence noisy output. Comment out = OFF, uncomment = ON.
#
# $showFrontendLogs = $true          # [FE] Vite output (hot-reload, build errors)
$showBackendLogs = $true             # [BE] Express HTTP request lines
# $showBackendDetailLogs = $true     # [BE] Full verbose Express output
# ------------------------------------------------------------------------------

# Guard: .env must exist
if (-not (Test-Path ".env")) {
    Write-Host "[WARN] .env not found. Copy .env.example and fill in values." -ForegroundColor Yellow
}

# Auto-install deps
if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] node_modules missing - running npm install..." -ForegroundColor Cyan
    npm install
}

# Kill existing processes on used ports
foreach ($port in @(5173, 5174, 3001)) {
    $pids = netstat -ano | Select-String ":$port " | ForEach-Object {
        ($_ -split "\s+")[-1]
    } | Where-Object { $_ -match "^\d+$" -and $_ -ne "0" } | Sort-Object -Unique
    foreach ($p in $pids) {
        try { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } catch {}
    }
}

# Load .env into this process so Express inherits all vars
Get-Content ".env" | Where-Object { $_ -match "^[^#\s]" } | ForEach-Object {
    if ($_ -match "^(.+?)=(.*)$") {
        [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), "Process")
    }
}
$env:VITE_API_URL = "http://localhost:3001"

# Banner
Write-Host ""
Write-Host "======================================================" -ForegroundColor DarkGray
Write-Host "  Atino Booking Webapp - Local Dev"                     -ForegroundColor White
Write-Host "  Frontend : http://localhost:5173  (Vite)"             -ForegroundColor Green
Write-Host "  Backend  : http://localhost:3001  (Express)"          -ForegroundColor Green
Write-Host "  Health   : http://localhost:3001/api/health"          -ForegroundColor Cyan
Write-Host "  Supabase : https://deuuuibkqletkkbrsmxd.supabase.co"  -ForegroundColor DarkGray
Write-Host "  Ctrl+C   : stops both services cleanly"               -ForegroundColor DarkGray
Write-Host "======================================================"  -ForegroundColor DarkGray
Write-Host ""

# Capture env pairs before jobs start (jobs don't inherit parent env)
$env_pairs = [System.Environment]::GetEnvironmentVariables("Process").GetEnumerator() |
    ForEach-Object { [PSCustomObject]@{ Key = $_.Key; Value = $_.Value } }

# Start frontend job
$feJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    & cmd /c "npm run dev" 2>&1
}

# Start backend job
$beJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    foreach ($kv in $using:env_pairs) {
        [System.Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, "Process")
    }
    & cmd /c "npm run server:dev" 2>&1
}

# Wait briefly then hit health endpoint
Start-Sleep -Seconds 3
try {
    $health = Invoke-RestMethod "http://localhost:3001/api/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "[BE] Health: $($health | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "[BE] Health check pending (server still starting)..." -ForegroundColor DarkGray
}

# Stream logs
Write-Host "[INFO] Streaming logs (Ctrl+C to stop)..." -ForegroundColor DarkGray
Write-Host ""

try {
    while ($true) {
        # Frontend logs
        if ($feJob.HasMoreData) {
            $feLines = Receive-Job $feJob 2>$null
            if ($showFrontendLogs -and $feLines) {
                foreach ($line in $feLines) {
                    Write-Host "[FE] $line" -ForegroundColor DarkCyan
                }
            }
        }

        # Backend logs
        if ($beJob.HasMoreData) {
            $beLines = Receive-Job $beJob 2>$null
            if ($showBackendLogs -and $beLines) {
                foreach ($line in $beLines) {
                    if ($showBackendDetailLogs -or
                        $line -match "^(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD) " -or
                        $line -match "^\[server\]" -or
                        $line -match "^INFO:" -or
                        $line -match "Express running") {
                        Write-Host "[BE] $line" -ForegroundColor Yellow
                    }
                }
            }
        }

        # Exit if both jobs died unexpectedly
        if ($feJob.State -ne 'Running' -and $beJob.State -ne 'Running') {
            Write-Host "[WARN] Both services stopped unexpectedly." -ForegroundColor Red
            break
        }

        Start-Sleep -Milliseconds 200
    }
} finally {
    Write-Host ""
    Write-Host "[INFO] Stopping services..." -ForegroundColor Cyan
    Stop-Job  $feJob, $beJob -ErrorAction SilentlyContinue
    Remove-Job $feJob, $beJob -Force -ErrorAction SilentlyContinue

    foreach ($port in @(5173, 3001)) {
        $pids = netstat -ano | Select-String ":$port " | ForEach-Object {
            ($_ -split "\s+")[-1]
        } | Where-Object { $_ -match "^\d+$" -and $_ -ne "0" } | Sort-Object -Unique
        foreach ($p in $pids) {
            try { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } catch {}
        }
    }
    Write-Host "[INFO] Done." -ForegroundColor Green
}
