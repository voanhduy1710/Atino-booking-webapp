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
$DEPLOYMENT_VERSION = [DateTime]::UtcNow.ToString('yyyyMMddHHmmss')

Write-Host ""
Write-Host "======================================================" -ForegroundColor DarkGray
Write-Host "  Atino Booking Webapp - Production Deploy"             -ForegroundColor White
Write-Host "  Project : $GCP_PROJECT"                               -ForegroundColor DarkGray
Write-Host "  Region  : $GCP_REGION"                                -ForegroundColor DarkGray
Write-Host "  Service : $SERVICE_NAME"                              -ForegroundColor DarkGray
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

# Step 2: Lint
Write-Host "[2/5] Running lint..." -ForegroundColor Cyan
npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Lint errors found. Fix before deploying." -ForegroundColor Red
    exit 1
}
Write-Host "      Passed." -ForegroundColor Green


# Step 4: Build
Write-Host "[3/5] Building frontend..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed." -ForegroundColor Red
    exit 1
}
Write-Host "      Build complete -> dist/" -ForegroundColor Green

# Read all env vars from .env
$envContent = Get-Content ".env" | Where-Object { $_ -match "^[^#]" }
$envVars = @{}
foreach ($line in $envContent) {
    if ($line -match "^(.+?)=(.*)$") {
        $envVars[$Matches[1].Trim()] = $Matches[2].Trim()
    }
}

$SUPABASE_URL = if ($envVars.ContainsKey("SUPABASE_URL")) { $envVars["SUPABASE_URL"] } else { $envVars["VITE_SUPABASE_URL"] }
$SUPABASE_SERVICE_ROLE_KEY = $envVars["SUPABASE_SERVICE_ROLE_KEY"]
$GCS_JSON = $envVars["GCS_SERVICE_ACCOUNT_JSON"]
$GCS_BUCKET = if ($envVars.ContainsKey("GCS_BUCKET")) { $envVars["GCS_BUCKET"] } else { "atino-media" }
$LARK_APP_ID = $envVars["LARK_APP_ID"]
$LARK_APP_SECRET = $envVars["LARK_APP_SECRET"]
$NHANH_APP_ID = $envVars["NHANH_APP_ID"]
$NHANH_BUSINESS_ID = $envVars["NHANH_BUSINESS_ID"]
$NHANH_ACCESS_TOKEN = $envVars["NHANH_ACCESS_TOKEN"]
$NHANH_PRODUCT_APP_ID = if ($envVars.ContainsKey("NHANH_PRODUCT_APP_ID")) { $envVars["NHANH_PRODUCT_APP_ID"] } else { $NHANH_APP_ID }
$NHANH_PRODUCT_BUSINESS_ID = if ($envVars.ContainsKey("NHANH_PRODUCT_BUSINESS_ID")) { $envVars["NHANH_PRODUCT_BUSINESS_ID"] } else { $NHANH_BUSINESS_ID }
$NHANH_PRODUCT_ACCESS_TOKEN = if ($envVars.ContainsKey("NHANH_PRODUCT_ACCESS_TOKEN")) { $envVars["NHANH_PRODUCT_ACCESS_TOKEN"] } else { $NHANH_ACCESS_TOKEN }
$STAFF_USERS = if ($envVars.ContainsKey("AUTH_USERS")) { $envVars["AUTH_USERS"] } elseif ($envVars.ContainsKey("STAFF_USERS")) { $envVars["STAFF_USERS"] } else { $envVars["VITE_STAFF_USERS"] }
$AUTH_JWT_SECRET = $envVars["AUTH_JWT_SECRET"]
$STAFF_USERS_B64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($STAFF_USERS))
$GCS_JSON_B64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($GCS_JSON))

if (-not $SUPABASE_URL) {
    Write-Host "[ERROR] SUPABASE_URL is not set in .env" -ForegroundColor Red
    exit 1
}
if (-not $SUPABASE_SERVICE_ROLE_KEY -or $SUPABASE_SERVICE_ROLE_KEY -eq "FILL_IN_YOUR_SERVICE_ROLE_KEY_HERE") {
    Write-Host "[ERROR] SUPABASE_SERVICE_ROLE_KEY is not set in .env" -ForegroundColor Red
    exit 1
}
if (-not $STAFF_USERS) {
    Write-Host "[ERROR] STAFF_USERS is not set in .env" -ForegroundColor Red
    exit 1
}
if (-not $GCS_JSON) {
    Write-Host "[ERROR] GCS_SERVICE_ACCOUNT_JSON is not set in .env" -ForegroundColor Red
    exit 1
}
if (-not $AUTH_JWT_SECRET -or $AUTH_JWT_SECRET.Length -lt 32) {
    Write-Host "[ERROR] AUTH_JWT_SECRET must contain at least 32 characters" -ForegroundColor Red
    exit 1
}
if (-not $LARK_APP_ID -or -not $LARK_APP_SECRET) {
    Write-Host "[ERROR] LARK_APP_ID or LARK_APP_SECRET is not set in .env" -ForegroundColor Red
    exit 1
}
if (-not $NHANH_APP_ID -or -not $NHANH_BUSINESS_ID -or -not $NHANH_ACCESS_TOKEN) {
    Write-Host "[ERROR] NHANH_APP_ID, NHANH_BUSINESS_ID, or NHANH_ACCESS_TOKEN is not set in .env" -ForegroundColor Red
    exit 1
}

Write-Host "      Enforcing private GCS bucket access..." -ForegroundColor Cyan
gcloud storage buckets update "gs://$GCS_BUCKET" `
    --project $GCP_PROJECT `
    --public-access-prevention `
    --uniform-bucket-level-access `
    --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Could not enforce private access for gs://$GCS_BUCKET" -ForegroundColor Red
    exit 1
}

# Step 5: Build Docker image + Deploy to Cloud Run
Write-Host "[4/5] Building Docker image and deploying to Cloud Run..." -ForegroundColor Cyan
Write-Host "      (This may take 2-4 minutes)" -ForegroundColor DarkGray
Write-Host ""

# Write VITE_ vars to .env.production so Docker build can access them
# .env is excluded from Docker context; .env.production is not
@"
VITE_SUPABASE_URL=$($envVars["VITE_SUPABASE_URL"])
VITE_SUPABASE_ANON_KEY=$($envVars["VITE_SUPABASE_ANON_KEY"])
"@ | Out-File -FilePath ".env.production" -Encoding utf8 -NoNewline

gcloud builds submit `
    --project $GCP_PROJECT `
    --tag "${IMAGE_BASE}:$DEPLOYMENT_VERSION" `
    .

$buildExitCode = $LASTEXITCODE

# Always clean up .env.production after submit
Remove-Item -Path ".env.production" -ErrorAction SilentlyContinue

if ($buildExitCode -ne 0) {
    Write-Host "[ERROR] Docker build failed." -ForegroundColor Red
    exit 1
}

gcloud run deploy $SERVICE_NAME `
    --project $GCP_PROJECT `
    --region $GCP_REGION `
    --image "${IMAGE_BASE}:$DEPLOYMENT_VERSION" `
    --platform managed `
    --allow-unauthenticated `
    --memory 512Mi `
    --cpu 1 `
    --min-instances 0 `
    --max-instances 3 `
    --timeout 60s `
    --port 8080 `
    --quiet `
    --set-env-vars "DEPLOYMENT_VERSION=$DEPLOYMENT_VERSION,SUPABASE_URL=$SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY,STAFF_USERS_B64=$STAFF_USERS_B64,AUTH_JWT_SECRET=$AUTH_JWT_SECRET,GCS_SERVICE_ACCOUNT_JSON_B64=$GCS_JSON_B64,LARK_APP_ID=$LARK_APP_ID,LARK_APP_SECRET=$LARK_APP_SECRET,NHANH_APP_ID=$NHANH_APP_ID,NHANH_BUSINESS_ID=$NHANH_BUSINESS_ID,NHANH_ACCESS_TOKEN=$NHANH_ACCESS_TOKEN,NHANH_PRODUCT_APP_ID=$NHANH_PRODUCT_APP_ID,NHANH_PRODUCT_BUSINESS_ID=$NHANH_PRODUCT_BUSINESS_ID,NHANH_PRODUCT_ACCESS_TOKEN=$NHANH_PRODUCT_ACCESS_TOKEN"

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Cloud Run deploy failed." -ForegroundColor Red
    exit 1
}

gcloud run services update-traffic $SERVICE_NAME `
    --project $GCP_PROJECT `
    --region $GCP_REGION `
    --to-latest `
    --update-tags "candidate=LATEST" `
    --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Could not route traffic to the latest Cloud Run revision." -ForegroundColor Red
    exit 1
}

$SERVICE_URL = gcloud run services describe $SERVICE_NAME `
    --project $GCP_PROJECT `
    --region $GCP_REGION `
    --format "value(status.url)"

Write-Host ""
Write-Host "[4/5] Deploy complete." -ForegroundColor Green
Write-Host "      URL    : $SERVICE_URL" -ForegroundColor Green

# Health check — confirm service is up and responding
Write-Host "      Checking /api/health ..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
try {
    $health = Invoke-RestMethod "$SERVICE_URL/api/health" -TimeoutSec 10 -ErrorAction Stop
    Write-Host "      Response: $($health | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "      [WARN] Health check failed: $_" -ForegroundColor Yellow
    Write-Host "      Service may still be warming up. Check Cloud Run logs." -ForegroundColor DarkGray
}

# Step 6: Clean up old images
Write-Host "[5/5] Cleaning up old Artifact Registry images..." -ForegroundColor Cyan

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
