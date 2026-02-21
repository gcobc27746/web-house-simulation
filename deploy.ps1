# GCP Cloud Run deploy script
# Prereq: gcloud auth login, gcloud config set project PROJECT_ID

param(
    [string]$ProjectId = "",
    [string]$Region = "asia-east1",
    [string]$ServiceName = "web-house-simulation",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

if (-not $ProjectId) {
    $ProjectId = (gcloud config get-value project 2>$null)
    if (-not $ProjectId) {
        Write-Error "Set project first: gcloud config set project YOUR_PROJECT_ID"
        exit 1
    }
}

$ImageTag = "gcr.io/$ProjectId/$ServiceName"
Write-Host "Project: $ProjectId, Region: $Region, Service: $ServiceName" -ForegroundColor Cyan

if ($SkipBuild) {
    Write-Host "Skipping build, using existing image $ImageTag" -ForegroundColor Cyan
} else {
    Write-Host "Building and pushing $ImageTag ..." -ForegroundColor Yellow
    $LASTEXITCODE = 0
    gcloud builds submit --tag $ImageTag --project $ProjectId .
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Write-Host "Deploying to Cloud Run ..." -ForegroundColor Yellow
$deployCmd = "gcloud run deploy $ServiceName --image $ImageTag --platform managed --region $Region --allow-unauthenticated --project $ProjectId"
cmd /c $deployCmd
$deployExit = $LASTEXITCODE
if ($deployExit -ne 0) {
    Write-Host ""
    Write-Host "Deploy failed. Enable billing: https://console.cloud.google.com/billing/enable?project=$ProjectId" -ForegroundColor Yellow
    exit $deployExit
}

$url = (cmd /c "gcloud run services describe $ServiceName --region $Region --project $ProjectId --format value(status.url) 2>nul")
if ($url -and ($url -match "https?://")) {
    Write-Host ""
    Write-Host "Done. URL:" -ForegroundColor Green
    Write-Host $url.Trim() -ForegroundColor Green
}
