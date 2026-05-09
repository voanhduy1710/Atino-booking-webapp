# deploy_local.ps1
# Starts the Vite dev server AND the Express backend for local development.
# Usage: .\deploy_local.ps1

# Check .env
if (-not (Test-Path ".env")) {
    Write-Host "[WARN] .env not found. Copy .env.example to .env and fill in your keys." -ForegroundColor Yellow
    Write-Host ""
}

# Auto-install if node_modules missing
if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] node_modules not found - running npm install..." -ForegroundColor Cyan
    npm install
}

# Kill anything already on port 5173 (Vite)
Write-Host "[INFO] Clearing port 5173 (Vite)..." -ForegroundColor Cyan
$procs = netstat -ano | Select-String ":5173 " | ForEach-Object {
    ($_ -split "\s+")[-1]
} | Sort-Object -Unique
foreach ($p in $procs) {
    if ($p -match "^\d+$" -and $p -ne "0") {
        try { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } catch {}
    }
}

# Kill anything already on port 3001 (Express)
Write-Host "[INFO] Clearing port 3001 (Express)..." -ForegroundColor Cyan
$procs2 = netstat -ano | Select-String ":3001 " | ForEach-Object {
    ($_ -split "\s+")[-1]
} | Sort-Object -Unique
foreach ($p in $procs2) {
    if ($p -match "^\d+$" -and $p -ne "0") {
        try { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } catch {}
    }
}

# Banner
Write-Host ""
Write-Host "======================================================" -ForegroundColor DarkGray
Write-Host "  Atino Booking Webapp - Local Dev"                     -ForegroundColor White
Write-Host "  Frontend : http://localhost:5173  (Vite)"             -ForegroundColor Green
Write-Host "  Backend  : http://localhost:3001  (Express)"          -ForegroundColor Green
Write-Host "  Supabase : https://deuuuibkqletkkbrsmxd.supabase.co"  -ForegroundColor Cyan
Write-Host "  Press Ctrl+C to stop Vite; Express runs in background" -ForegroundColor DarkGray
Write-Host "======================================================"  -ForegroundColor DarkGray
Write-Host ""

# Load .env into current session (for the Express server)
Write-Host "[INFO] Loading .env vars into environment..." -ForegroundColor Cyan
Get-Content ".env" | Where-Object { $_ -match "^[^#\s]" } | ForEach-Object {
    if ($_ -match "^(.+?)=(.*)$") {
        $key = $Matches[1].Trim()
        $val = $Matches[2].Trim()
        [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
}

# Ensure Vite knows where Express is for local dev
$env:VITE_API_URL = "http://localhost:3001"

# Start Express backend in background
Write-Host "[INFO] Starting Express backend (port 3001)..." -ForegroundColor Cyan
Start-Process -NoNewWindow -FilePath "cmd" -ArgumentList "/c", "npm run server:dev"

# Small delay so Express has time to start
Start-Sleep -Seconds 2

Write-Host "[INFO] Starting Vite dev server (port 5173)..." -ForegroundColor Cyan
npm run dev
