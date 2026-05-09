# deploy_local.ps1
# Starts the Vite dev server for local development.
# Usage: .\deploy_local.ps1

$showLogs = $true

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

# Kill anything already on port 5173
Write-Host "[INFO] Clearing port 5173..." -ForegroundColor Cyan
$procs = netstat -ano | Select-String ":5173 " | ForEach-Object {
    ($_ -split "\s+")[-1]
} | Sort-Object -Unique
foreach ($p in $procs) {
    if ($p -match "^\d+$" -and $p -ne "0") {
        try { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } catch {}
    }
}

# Banner
Write-Host ""
Write-Host "======================================================" -ForegroundColor DarkGray
Write-Host "  Atino Booking Webapp - Local Dev"                     -ForegroundColor White
Write-Host "  Frontend : http://localhost:5173"                      -ForegroundColor Green
Write-Host "  Supabase : https://deuuuibkqletkkbrsmxd.supabase.co"  -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop"                                  -ForegroundColor DarkGray
Write-Host "======================================================"  -ForegroundColor DarkGray
Write-Host ""

# Run Vite in foreground (simplest, most reliable)
npm run dev
