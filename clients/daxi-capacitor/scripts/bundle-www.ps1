# Copie le front HTML/CSS/JS existant dans www/ (sans encapsuler le site live).
$ErrorActionPreference = "Continue"
$here = $PSScriptRoot
$capRoot = Split-Path $here -Parent
$djangoRoot = Split-Path (Split-Path $capRoot -Parent) -Parent
$www = Join-Path $capRoot "www"
$androidScripts = Join-Path $djangoRoot "clients\daxi-android\scripts"

function Normalize-BackendUrl([string]$raw, [bool]$allowHttp) {
    $s = ($raw | Out-String).Trim().TrimEnd('/')
    if (-not $s) { throw "DAXI_API_BASE_URL is empty" }
    if ($s -notmatch '^https://' -and -not ($allowHttp -and $s -match '^http://')) {
        throw "DAXI_API_BASE_URL must use HTTPS: $s"
    }
    return $s
}

$configPath = Join-Path $capRoot "backend.config.json"
if (-not (Test-Path $configPath)) {
    throw "Missing $configPath - DAXI_API_BASE_URL source of truth"
}
$cfg = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$envName = [string]$cfg.DAXI_API_ENV
if (-not $envName) { $envName = "development" }
$allowHttp = [bool]$cfg.DAXI_API_ALLOW_HTTP
$debugLogs = $true
if ($null -ne $cfg.DAXI_API_DEBUG_LOGS) { $debugLogs = [bool]$cfg.DAXI_API_DEBUG_LOGS }

$BaseUrl = ""
if ($env:DAXI_API_BASE_URL -and $env:DAXI_API_BASE_URL.Trim()) {
    $BaseUrl = Normalize-BackendUrl $env:DAXI_API_BASE_URL $allowHttp
    Write-Host "DAXI_API_BASE_URL from environment"
} elseif ($envName -eq "production") {
    $prod = [string]$cfg.DAXI_API_BASE_URL_PRODUCTION
    if (-not $prod) { throw "DAXI_API_BASE_URL_PRODUCTION is empty - set it before a production build" }
    $BaseUrl = Normalize-BackendUrl $prod $allowHttp
} else {
    $dev = [string]$cfg.DAXI_API_BASE_URL_DEVELOPMENT
    $ngrokFile = Join-Path $androidScripts "ngrok-url.txt"
    if ($cfg.useNgrokFileForDev -and (Test-Path $ngrokFile)) {
        $u = (Get-Content $ngrokFile -Raw).Trim()
        if ($u -match "^https?://") {
            $dev = $u
            Write-Host "DEV overlay from ngrok-url.txt (build script only)"
        }
    }
    $BaseUrl = Normalize-BackendUrl $dev $allowHttp
}

Write-Host "Django root : $djangoRoot"
Write-Host "DAXI_API_ENV: $envName"
Write-Host "DAXI_API_BASE_URL : $BaseUrl"
Write-Host "www         : $www"

if (-not (Test-Path $www)) {
    New-Item -ItemType Directory -Path $www | Out-Null
}

$legacy = Join-Path $androidScripts "bundle-webcache.ps1"
if (Test-Path $legacy) {
    & $legacy -BaseUrl $BaseUrl -OutDir $www
} else {
    Write-Warning "bundle-webcache.ps1 introuvable"
    Copy-Item (Join-Path $djangoRoot "vubez2.html") (Join-Path $www "index.html") -Force
}

$jsDir = Join-Path $www "js"
New-Item -ItemType Directory -Force -Path $jsDir | Out-Null

$iconSrc = Join-Path $djangoRoot "assets\images\daxi-app-icon.png"
$iconDestDir = Join-Path $www "assets\images"
New-Item -ItemType Directory -Force -Path $iconDestDir | Out-Null
if (Test-Path $iconSrc) {
    Copy-Item $iconSrc (Join-Path $iconDestDir "daxi-app-icon.png") -Force
    Write-Host "logo app : assets/images/daxi-app-icon.png"
}

$debugJs = if ($debugLogs) { "true" } else { "false" }
$httpJs = if ($allowHttp) { "true" } else { "false" }
$configJs = @"
window.DAXI_API_ENV = '$envName';
window.DAXI_API_BASE_URL = '$BaseUrl';
window.DAXI_API_ALLOW_HTTP = $httpJs;
window.DAXI_API_DEBUG_LOGS = $debugJs;
window.DAXI_USE_GOOGLE_MAPS = true;
window.DAXI_USE_MAPLIBRE = false;
window._daxiLiveBaseUrl = window.DAXI_API_BASE_URL;
window._daxiCapacitorApp = true;
"@
Set-Content -Path (Join-Path $www "daxi-capacitor-config.js") -Value $configJs -Encoding utf8
Write-Host "wrote www/daxi-capacitor-config.js"

$index = Join-Path $www "index.html"
if (Test-Path $index) {
    $html = Get-Content $index -Raw -Encoding UTF8
    if ($html -notmatch "daxi-capacitor-config.js") {
        $inject = "    <script src=`"daxi-capacitor-config.js`"></script>`r`n    <script src=`"js/daxi-capacitor.js`"></script>`r`n"
        $html = $html -replace "(<head[^>]*>)", ('$1' + "`r`n" + $inject)
        Set-Content -Path $index -Value $html -Encoding UTF8
        Write-Host "index.html : scripts Capacitor injectes"
    }
}

$env:Path = "C:\Program Files\nodejs;" + $env:Path
if (Get-Command npx -ErrorAction SilentlyContinue) {
    Push-Location $capRoot
    npx --yes esbuild capacitor-src/main.js --bundle --format=iife --outfile=www/js/daxi-capacitor.js --platform=browser
    Pop-Location
} else {
    Write-Warning "Node/npx indisponible : npm run build:bridge plus tard"
}

Write-Host ""
Write-Host "www pret. Ensuite : npx cap sync"
