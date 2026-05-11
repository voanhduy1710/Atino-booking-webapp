# deploy_test.ps1
# Builds and deploys to the isolated Cloud Run TEST service.
# Production is never touched by this script.
# Usage: .\deploy_test.ps1

# Config — test service uses its own service name/image
$GCP_PROJECT      = "atino-vietnam"
$GCP_REGION       = "asia-southeast1"
$SERVICE_NAME     = "atino-booking-webapp-test"
$REPO_NAME        = "atino-docker"
$IMAGE_NAME       = "atino-booking-webapp-test"
$IMAGE_BASE       = "$GCP_REGION-docker.pkg.dev/$GCP_PROJECT/$REPO_NAME/$IMAGE_NAME"

Write-Host ""
Write-Host "======================================================" -ForegroundColor DarkGray
Write-Host "  Atino Booking Webapp - TEST Deploy"                   -ForegroundColor Yellow
Write-Host "  Project : $GCP_PROJECT"                               -ForegroundColor DarkGray
Write-Host "  Region  : $GCP_REGION"                                -ForegroundColor DarkGray
Write-Host "  Service : $SERVICE_NAME  (test only)"                 -ForegroundColor Yellow
Write-Host "======================================================"  -ForegroundColor DarkGray
Write-Host ""

# Step 1: TypeScript check
Write-Host "[1/5] Running TypeScript check..." -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] TypeScript errors found. Fix before deploying." -ForegroundColor Red
    exit 1
}
Write-Host "      Passed." -ForegroundColor Green

# Step 2: Build
Write-Host "[2/5] Building frontend..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed." -ForegroundColor Red
    exit 1
}
Write-Host "      Build complete -> dist/" -ForegroundColor Green

# Step 3: Build Docker image via Cloud Build
Write-Host "[3/5] Building Docker image via Cloud Build..." -ForegroundColor Cyan
Write-Host "      (This may take 2-4 minutes)" -ForegroundColor DarkGray
Write-Host ""

gcloud builds submit `
    --project $GCP_PROJECT `
    --tag "${IMAGE_BASE}:latest" `
    .

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Docker build failed. Production untouched." -ForegroundColor Red
    exit 1
}
Write-Host "      Image built: ${IMAGE_BASE}:latest" -ForegroundColor Green

# Step 4: Deploy to Cloud Run test service
Write-Host "[4/5] Deploying to Cloud Run test service..." -ForegroundColor Cyan

# Read env vars from .env
$envContent = Get-Content ".env" | Where-Object { $_ -match "^[^#]" }
$envVars = @{}
foreach ($line in $envContent) {
    if ($line -match "^(.+?)=(.*)$") {
        $envVars[$Matches[1].Trim()] = $Matches[2].Trim()
    }
}

$SUPABASE_SERVICE_ROLE_KEY = $envVars["SUPABASE_SERVICE_ROLE_KEY"]
$GCS_JSON = $envVars["GCS_SERVICE_ACCOUNT_JSON"]

if (-not $SUPABASE_SERVICE_ROLE_KEY -or $SUPABASE_SERVICE_ROLE_KEY -eq "FILL_IN_YOUR_SERVICE_ROLE_KEY_HERE") {
    Write-Host "[ERROR] SUPABASE_SERVICE_ROLE_KEY is not set in .env" -ForegroundColor Red
    exit 1
}

gcloud run deploy $SERVICE_NAME `
    --project $GCP_PROJECT `
    --region $GCP_REGION `
    --image "${IMAGE_BASE}:latest" `
    --platform managed `
    --allow-unauthenticated `
    --memory 512Mi `
    --cpu 1 `
    --min-instances 0 `
    --max-instances 2 `
    --timeout 3600s `
    --port 8080 `
    --set-env-vars "^|^SUPABASE_URL=https://deuuuibkqletkkbrsmxd.supabase.co|SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY|GCS_SERVICE_ACCOUNT_JSON=$GCS_JSON"

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Cloud Run deploy failed." -ForegroundColor Red
    exit 1
}

$SERVICE_URL = gcloud run services describe $SERVICE_NAME `
    --project $GCP_PROJECT `
    --region $GCP_REGION `
    --format "value(status.url)"

Write-Host ""
Write-Host "[4/5] Deploy complete." -ForegroundColor Green
Write-Host "      URL    : $SERVICE_URL" -ForegroundColor Green

# Health check
Write-Host "      Checking /api/health ..." -ForegroundColor Cyan
Start-Sleep -Seconds 5
try {
    $health = Invoke-RestMethod "$SERVICE_URL/api/health" -TimeoutSec 15 -ErrorAction Stop
    Write-Host "      Response: $($health | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "      [WARN] Health check failed: $_" -ForegroundColor Yellow
    Write-Host "      Service may still be cold-starting. Check Cloud Run logs." -ForegroundColor DarkGray
}

# Step 5: Clean up untagged images (keep only latest)
Write-Host "[5/5] Cleaning up untagged images from Artifact Registry..." -ForegroundColor Cyan

$digests = gcloud artifacts docker images list `
    "$GCP_REGION-docker.pkg.dev/$GCP_PROJECT/$REPO_NAME/$IMAGE_NAME" `
    --project $GCP_PROJECT `
    --sort-by "~CREATE_TIME" `
    --format "value(VERSION)" 2>$null

if ($digests) {
    $digestList = $digests -split "`n" | Where-Object { $_ -match "^sha256:" }
    $toDelete = $digestList | Select-Object -Skip 1   # keep only latest
    foreach ($digest in $toDelete) {
        Write-Host "      Deleting: $digest" -ForegroundColor DarkGray
        gcloud artifacts docker images delete `
            "${IMAGE_BASE}@$digest" `
            --project $GCP_PROJECT `
            --quiet 2>$null
    }
    Write-Host "      Cleanup done (kept: latest)." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor DarkGray
Write-Host "  TEST deploy complete!"                                 -ForegroundColor Yellow
Write-Host "  $SERVICE_URL"                                          -ForegroundColor Yellow
Write-Host "  (Production was NOT touched)"                          -ForegroundColor DarkGray
Write-Host "======================================================"  -ForegroundColor DarkGray
Write-Host ""
