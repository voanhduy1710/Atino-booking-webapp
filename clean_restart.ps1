# clean_restart.ps1
# Kills all Node processes, clears Vite ports, then restarts local dev.
# Use when: hot-reload is broken, ports are stuck, or "nothing works".
# Usage: .\clean_restart.ps1

Write-Host ""
Write-Host "======================================================" -ForegroundColor DarkGray
Write-Host "  Clean Restart"                                         -ForegroundColor Yellow
Write-Host "======================================================"  -ForegroundColor DarkGray
Write-Host ""

# 1. Kill all node.exe (Vite, npm)
Write-Host "[1/4] Killing node.exe processes..." -ForegroundColor Cyan
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "      Done."

# 2. Clear ports 5173, 5174, 3001
Write-Host "[2/4] Clearing ports 5173/5174/3001..." -ForegroundColor Cyan
$ports = @(5173, 5174, 3001)
foreach ($port in $ports) {
    $procs = netstat -ano | Select-String ":$port " | ForEach-Object {
        ($_ -split "\s+")[-1]
    } | Sort-Object -Unique
    foreach ($p in $procs) {
        if ($p -match "^\d+$" -and $p -ne "0") {
            try { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } catch {}
        }
    }
}
Write-Host "      Done."

# 3. Wait for teardown
Write-Host "[3/4] Waiting for teardown..." -ForegroundColor Cyan
Start-Sleep -Seconds 2
Write-Host "      Done."

# 4. Restart
Write-Host "[4/4] Starting local dev..." -ForegroundColor Cyan
Write-Host ""
& "$PSScriptRoot\deploy_local.ps1"
