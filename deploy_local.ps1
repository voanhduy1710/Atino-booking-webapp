# deploy_local.ps1
# Run the local Atino Booking frontend and backend in one terminal.

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try { chcp 65001 | Out-Null } catch {}

$frontendPort = 5173
$backendPort = 3001
$repoRoot = (Get-Location).Path

function Stop-PortProcess {
    param([int]$Port)

    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if (-not $connections) {
        Write-Host "  Port $Port is already free" -ForegroundColor DarkGray
        return
    }

    $processIds = $connections |
        Select-Object -ExpandProperty OwningProcess -Unique |
        Where-Object { $_ -and $_ -ne 0 }

    if (-not $processIds) {
        Write-Host "  Port $Port has no stoppable process" -ForegroundColor DarkGray
        return
    }

    foreach ($processId in $processIds) {
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            Write-Host "  Killed process on port $Port (PID: $processId)" -ForegroundColor Yellow
        } catch {
            Write-Host "  Could not kill process on port $Port (PID: $processId)" -ForegroundColor Red
        }
    }
}

function Write-ServiceLine {
    param(
        [object]$Line,
        [ConsoleColor]$Color
    )

    $text = [string]$Line
    if ([string]::IsNullOrWhiteSpace($text)) {
        return
    }

    # dotenv v17 prints a decorative tip line; on Windows it can render as mojibake.
    if ($text -match "injected env" -and $text -match "from \.env") {
        return
    }

    Write-Host $text -ForegroundColor $Color
}

Write-Host "Starting deploy_local.ps1..." -ForegroundColor Green
Write-Host "Starting local development environment..." -ForegroundColor Green

if (-not (Test-Path ".env")) {
    Write-Host "[WARN] .env not found. Copy .env.example and fill in values." -ForegroundColor Yellow
}

if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] node_modules missing - running npm install..." -ForegroundColor Cyan
    npm install
}

Write-Host "Checking for existing processes on ports $backendPort and $frontendPort..." -ForegroundColor Yellow
Stop-PortProcess -Port $backendPort
Stop-PortProcess -Port $frontendPort
Start-Sleep -Milliseconds 1500

if (Test-Path ".env") {
    Get-Content ".env" | Where-Object { $_ -match "^[^#\s]" } | ForEach-Object {
        if ($_ -match "^(.+?)=(.*)$") {
            [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), "Process")
        }
    }
}

# Leave VITE_API_URL empty so Vite proxies /api/* to the backend and prints [FE→BE] timing logs.
[System.Environment]::SetEnvironmentVariable("VITE_API_URL", $null, "Process")
$env:DOTENV_CONFIG_QUIET = "true"

$envPairs = [System.Environment]::GetEnvironmentVariables("Process").GetEnumerator() |
    ForEach-Object { [PSCustomObject]@{ Key = $_.Key; Value = $_.Value } }

Write-Host "Starting Frontend (Vite on port $frontendPort)..." -ForegroundColor Cyan
$frontendJob = Start-Job -ScriptBlock {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    Set-Location $using:repoRoot
    foreach ($kv in $using:envPairs) {
        [System.Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, "Process")
    }
    & cmd /c "npm run dev -- --host 0.0.0.0 --port 5173" 2>&1
}

Write-Host "Starting Backend (Express on port $backendPort)..." -ForegroundColor Cyan
$backendJob = Start-Job -ScriptBlock {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    Set-Location $using:repoRoot
    foreach ($kv in $using:envPairs) {
        [System.Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, "Process")
    }
    & cmd /c "npm run server:dev" 2>&1
}

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Local development environment started!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Frontend: http://localhost:$frontendPort" -ForegroundColor Cyan
Write-Host "API:      http://localhost:$backendPort/api" -ForegroundColor Cyan
Write-Host "Health:   http://localhost:$backendPort/api/health" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green
Write-Host "Streaming logs below. Press Ctrl+C to stop all."
Write-Host ""

try {
    while ($true) {
        if ($frontendJob.HasMoreData) {
            Receive-Job -Job $frontendJob 2>$null | ForEach-Object {
                Write-ServiceLine -Line $_ -Color Cyan
            }
        }

        if ($backendJob.HasMoreData) {
            Receive-Job -Job $backendJob 2>$null | ForEach-Object {
                Write-ServiceLine -Line $_ -Color White
            }
        }

        if ($frontendJob.State -ne "Running" -and $backendJob.State -ne "Running") {
            Write-Host "[WARN] Both services stopped unexpectedly." -ForegroundColor Red
            break
        }

        Start-Sleep -Milliseconds 200
    }
} finally {
    Write-Host ""
    Write-Host "Stopping services..." -ForegroundColor Yellow
    Stop-Job -Job $frontendJob, $backendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $frontendJob, $backendJob -Force -ErrorAction SilentlyContinue
    Stop-PortProcess -Port $backendPort
    Stop-PortProcess -Port $frontendPort
    Write-Host "Services stopped." -ForegroundColor Green
}
