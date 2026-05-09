# deploy.ps1
# Builds the frontend and deploys to Google Cloud Run.
# Requirements:
#   - gcloud CLI installed and authenticated: gcloud auth login
#   - Correct project set: gcloud config set project atino-vietnam
# Usage: .\deploy.ps1

# Config
$GCP_PROJECT  = "atino-vietnam"
$GCP_REGION   = "asia-southeast1"
$SERVICE_NAME = "atino-booking-webapp"
$REPO_NAME    = "atino-docker"
$IMAGE_NAME   = "atino-booking-webapp"
$IMAGE_BASE   = "$GCP_REGION-docker.pkg.dev/$GCP_PROJECT/$REPO_NAME/$IMAGE_NAME"
$KEEP_IMAGES  = 3

Write-Host ""
Write-Host "======================================================" -ForegroundColor DarkGray
Write-Host "  Atino Booking Webapp - Production Deploy"             -ForegroundColor White
Write-Host "  Project : $GCP_PROJECT"                               -ForegroundColor DarkGray
Write-Host "  Region  : $GCP_REGION"                                -ForegroundColor DarkGray
Write-Host "  Service : $SERVICE_NAME"                              -ForegroundColor DarkGray
Write-Host "======================================================"  -ForegroundColor DarkGray
Write-Host ""

# Step 1: TypeScript check
Write-Host "[1/6] Running TypeScript check..." -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] TypeScript errors found. Fix before deploying." -ForegroundColor Red
    exit 1
}
Write-Host "      Passed." -ForegroundColor Green

# Step 2: Lint
Write-Host "[2/6] Running lint..." -ForegroundColor Cyan
npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Lint errors found. Fix before deploying." -ForegroundColor Red
    exit 1
}
Write-Host "      Passed." -ForegroundColor Green

# Step 3: Tests
Write-Host "[3/6] Running unit tests..." -ForegroundColor Cyan
npm run test
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Tests failed. Fix before deploying." -ForegroundColor Red
    exit 1
}
Write-Host "      Passed." -ForegroundColor Green

# Step 4: Build
Write-Host "[4/6] Building frontend..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed." -ForegroundColor Red
    exit 1
}
Write-Host "      Build complete -> dist/" -ForegroundColor Green

# Step 5: Build Docker image + Deploy to Cloud Run
Write-Host "[5/6] Building Docker image and deploying to Cloud Run..." -ForegroundColor Cyan
Write-Host "      (This may take 2-4 minutes)" -ForegroundColor DarkGray
Write-Host ""

gcloud builds submit `
    --project $GCP_PROJECT `
    --tag "${IMAGE_BASE}:latest" `
    .

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Docker build failed." -ForegroundColor Red
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
    --min-instances 1 `
    --max-instances 3 `
    --timeout 60s `
    --port 8080 `
    --set-env-vars "VITE_SUPABASE_URL=https://deuuuibkqletkkbrsmxd.supabase.co"

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Cloud Run deploy failed." -ForegroundColor Red
    exit 1
}

$SERVICE_URL = gcloud run services describe $SERVICE_NAME `
    --project $GCP_PROJECT `
    --region $GCP_REGION `
    --format "value(status.url)"

Write-Host ""
Write-Host "      Deployed!" -ForegroundColor Green
Write-Host "      URL: $SERVICE_URL" -ForegroundColor Green

# Step 6: Clean up old images
Write-Host "[6/6] Cleaning up old Artifact Registry images..." -ForegroundColor Cyan

$digests = gcloud artifacts docker images list `
    "$GCP_REGION-docker.pkg.dev/$GCP_PROJECT/$REPO_NAME/$IMAGE_NAME" `
    --project $GCP_PROJECT `
    --sort-by "~CREATE_TIME" `
    --format "value(VERSION)" 2>$null

if ($digests) {
    $digestList = $digests -split "`n" | Where-Object { $_ -match "^sha256:" }
    $toDelete = $digestList | Select-Object -Skip $KEEP_IMAGES
    foreach ($digest in $toDelete) {
        Write-Host "      Deleting: $digest" -ForegroundColor DarkGray
        gcloud artifacts docker images delete `
            "${IMAGE_BASE}@$digest" `
            --project $GCP_PROJECT `
            --quiet 2>$null
    }
    Write-Host "      Kept $KEEP_IMAGES most recent images." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor DarkGray
Write-Host "  Deploy complete!"                                      -ForegroundColor Green
Write-Host "  $SERVICE_URL"                                          -ForegroundColor Green
Write-Host "======================================================"  -ForegroundColor DarkGray
Write-Host ""
