
param(
    [string]$BaseUrl = "",
    [string]$OutDir = "$PSScriptRoot\..\app\src\main\assets\webcache"
)

$ErrorActionPreference = "Continue"
& "$PSScriptRoot\sync-logos.ps1"

if (-not $BaseUrl) {
    $ngrokFile = Join-Path $PSScriptRoot "ngrok-url.txt"
    if (Test-Path $ngrokFile) {
        $BaseUrl = (Get-Content $ngrokFile -Raw).Trim()
    }
    if (-not $BaseUrl) { $BaseUrl = "https://daxipro.com" }
}

$paths = @(
    "/",
    "/static/js/daxi-offline.js",
    "/static/js/daxi-countdown.js",
    "/static/js/daxi-auto-i18n.js",
    "/static/js/daxi-phone.js",
    "/static/js/daxi-plan-wizard.js",
    "/static/js/daxi-push-register.js",
    "/static/js/daxi-realtime.js",
    "/static/js/daxi-notif-policy.js",
    "/static/js/daxi-notifications.js",
    "/static/js/daxi-realtime-sync.js",
    "/static/js/daxi-action-buttons.js",
    "/static/js/daxi-modal.js",
    "/static/js/daxi-chat-media.js",
    "/static/js/daxi-chat-ui.js",
    "/static/js/daxi-chat-composer.js",
    "/static/js/daxi-map-markers.js",
    "/static/js/daxi-map-theme.js",
    "/static/js/daxi-maplibre.js",
    "/static/js/daxi-map-provider.js",
    "/static/js/daxi-places-catalog.js",
    "/static/js/daxi-deeplink-router.js",
    "/static/js/daxi-routes.js",
    "/static/js/daxi-map-snap.js",
    "/static/js/daxi-order-card-map.js",
    "/static/js/daxi-theme.js",
    "/static/js/gps-precision-engine.js",
    "/static/js/firebase-shim.js",
    "/assets/css/tailwind-vubez2.css",
    "/assets/css/vubez2-core.css",
    "/assets/css/vubez2-body.css",
    "/assets/css/remixicon-vubez2.css",
    "/static/js/daxi-lazy-loader.js",
    "/static/js/daxi-intro.js",
    "/static/js/daxi-guest-id.js",
    "/assets/js/htmx.min.js",
    "/assets/js/aos.js",
    "/assets/css/remixicon.min.css",
    "/assets/css/aos.css",
    "/assets/fonts/remixicon.woff2",
    "/assets/images/daxi-app-icon.png",
    "/assets/images/daxi-logo-gold.png",
    "/assets/images/daxi-logo-dark.png",
    "/assets/images/img87.jpg",
    "/assets/images/img97.jpg",
    "/assets/images/img47.jpg",
    "/assets/images/img77.jfif",
    "/assets/images/img67.jpg",
    "/assets/images/img.jpg",
    "/assets/images/img6.jpg",
    "/assets/images/img7.jpg",
    "/assets/images/img8.jpg",
    "/assets/images/img12.jpg",
    "/assets/images/img13.webp.jpg",
    "/assets/images/img15.webp.jpg",
    "/assets/images/daxi-map-placeholder.jpg",
    "/assets/images/daxi-map-placeholder-dark.png",
    "/assets/images/daxi-map-placeholder-light.png",
    "/daxi-haiti-explorer-data.js",
    "/daxi-haiti-explorer-map.js",
    "/manifest.json"
)

$headers = @{}
if ($BaseUrl -match "ngrok") { $headers["ngrok-skip-browser-warning"] = "true" }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$root = $BaseUrl.TrimEnd("/")
$projectRoot = Join-Path $PSScriptRoot "..\..\.."
Write-Host "Base URL: $root" -ForegroundColor Cyan

foreach ($path in $paths) {
    $rel = if ($path -eq "/") { "index.html" } else { $path.TrimStart("/") }
    $dest = Join-Path $OutDir ($rel -replace "/", [IO.Path]::DirectorySeparatorChar)
    $localSrc = Join-Path $projectRoot ($rel -replace "/", [IO.Path]::DirectorySeparatorChar)
    $parent = Split-Path $dest -Parent
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    if (Test-Path $localSrc) {
        Copy-Item -Force $localSrc $dest
        Write-Host "LOCAL $rel"
        continue
    }
    try {
        Write-Host "GET $root$path"
        Invoke-WebRequest -Uri "$root$path" -OutFile $dest -UseBasicParsing -TimeoutSec 60 -Headers $headers
    } catch {
        Write-Warning "Échec $path : $_"
    }
}


$staticJs = Join-Path $projectRoot "static\js"
if (Test-Path $staticJs) {
    $destJsDir = Join-Path $OutDir "static\js"
    New-Item -ItemType Directory -Force -Path $destJsDir | Out-Null
    Get-ChildItem $staticJs -Filter "*.js" | ForEach-Object {
        Copy-Item -Force $_.FullName (Join-Path $destJsDir $_.Name)
        Write-Host "JS local -> static/js/$($_.Name)"
    }
}

$staticCss = Join-Path $projectRoot "static\css"
if (Test-Path $staticCss) {
    $destCssDir = Join-Path $OutDir "static\css"
    New-Item -ItemType Directory -Force -Path $destCssDir | Out-Null
    Get-ChildItem $staticCss -Filter "*.css" | ForEach-Object {
        Copy-Item -Force $_.FullName (Join-Path $destCssDir $_.Name)
        Write-Host "CSS local -> static/css/$($_.Name)"
    }
}


$vubez2Js = Join-Path $projectRoot "static\js\vubez2"
if (Test-Path $vubez2Js) {
    $destVubez2 = Join-Path $OutDir "static\js\vubez2"
    New-Item -ItemType Directory -Force -Path $destVubez2 | Out-Null
    Get-ChildItem $vubez2Js -Filter "*.js" | ForEach-Object {
        Copy-Item -Force $_.FullName (Join-Path $destVubez2 $_.Name)
        Write-Host "vubez2 JS -> static/js/vubez2/$($_.Name)"
    }
}

$assetsCss = Join-Path $projectRoot "assets\css"
foreach ($css in @("vubez2-core.css", "vubez2-body.css", "remixicon-vubez2.css", "tailwind-vubez2.css")) {
    $src = Join-Path $assetsCss $css
    if (Test-Path $src) {
        $dest = Join-Path $OutDir "assets\css\$css"
        New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
        Copy-Item -Force $src $dest
        Write-Host "assets/css/$css <- local"
    }
}

$vubez = Join-Path $projectRoot "vubez2.html"
if (Test-Path $vubez) {
    Copy-Item -Force $vubez (Join-Path $OutDir "index.html")
    Write-Host "index.html <- vubez2.html"
}

foreach ($js in @("daxi-frequent-routes-data.js", "daxi-frequent-routes-map.js", "daxi-push-register.js", "daxi-haiti-explorer-data.js", "daxi-haiti-explorer-map.js")) {
    $srcJs = Join-Path $projectRoot $js
    if (Test-Path $srcJs) {
        Copy-Item -Force $srcJs (Join-Path $OutDir $js)
        Write-Host "$js <- local"
    }
}

$villesSrc = Join-Path $projectRoot "villes"
$villesDest = Join-Path $OutDir "villes"
if (Test-Path $villesSrc) {
    New-Item -ItemType Directory -Force -Path $villesDest | Out-Null
    robocopy $villesSrc $villesDest /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    Write-Host "villes/ <- copied"
}

$fileCount = (Get-ChildItem $OutDir -Recurse -File | Measure-Object).Count
Write-Host ""
Write-Host "Snapshot: $fileCount fichiers dans $OutDir" -ForegroundColor Green
