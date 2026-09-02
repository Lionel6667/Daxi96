$ErrorActionPreference = "Continue"
$here = $PSScriptRoot
$capRoot = Split-Path $here -Parent
$djangoRoot = Split-Path (Split-Path $capRoot -Parent) -Parent
$www = Join-Path $capRoot "www"

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
    if (-not $prod) { throw "DAXI_API_BASE_URL_PRODUCTION is empty" }
    $BaseUrl = Normalize-BackendUrl $prod $allowHttp
} else {
    $dev = [string]$cfg.DAXI_API_BASE_URL_DEVELOPMENT
    $androidScripts = Join-Path $djangoRoot "clients\daxi-android\scripts"
    $ngrokFile = Join-Path $androidScripts "ngrok-url.txt"
    if ($cfg.useNgrokFileForDev -and (Test-Path $ngrokFile)) {
        $u = (Get-Content $ngrokFile -Raw).Trim()
        if ($u -match "^https?://") { $dev = $u }
    }
    $BaseUrl = Normalize-BackendUrl $dev $allowHttp
}

Write-Host "Django root : $djangoRoot"
Write-Host "DAXI_API_ENV: $envName"
Write-Host "DAXI_API_BASE_URL : $BaseUrl"
Write-Host "www         : $www"

if (Test-Path $www) {
    Get-ChildItem $www -Force | Where-Object { $_.Name -ne '.gitkeep' } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
} else {
    New-Item -ItemType Directory -Path $www | Out-Null
}

function Copy-Rel([string]$rel) {
    $src = Join-Path $djangoRoot ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
    if (-not (Test-Path $src)) { return $false }
    $dest = Join-Path $www ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
    $parent = Split-Path $dest -Parent
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Copy-Item -Force $src $dest
    return $true
}

$assetFiles = @(
    'assets/css/tailwind-vubez2.css',
    'assets/css/vubez2-core.css',
    'assets/css/vubez2-body.css',
    'assets/css/remixicon-vubez2.css',
    'assets/css/daxi-local-fonts.css',
    'assets/css/aos.css',
    'assets/css/remixicon.min.css',
    'assets/js/htmx.min.js',
    'assets/js/aos.js',
    'assets/fonts/remixicon.woff2',
    'assets/images/daxi-app-icon.png',
    'assets/images/daxi-logo-gold.png',
    'assets/images/daxi-logo-dark.png',
    'assets/images/daxi-map-placeholder.jpg',
    'assets/images/daxi-map-placeholder-dark.png',
    'assets/images/daxi-map-placeholder-light.png',
    'assets/images/daxi-map-placeholder-dark.webp',
    'manifest.json',
    'daxi-frequent-routes-data.js',
    'daxi-frequent-routes-map.js',
    'daxi-haiti-explorer-data.js',
    'daxi-haiti-explorer-map.js',
    'gps-precision-engine.js'
)
foreach ($f in $assetFiles) { [void](Copy-Rel $f) }

$cssDir = Join-Path $djangoRoot 'static\css'
$cssDest = Join-Path $www 'static\css'
New-Item -ItemType Directory -Force -Path $cssDest | Out-Null
Get-ChildItem $cssDir -Filter 'daxi-*.css' -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item -Force $_.FullName (Join-Path $cssDest $_.Name)
}

$jsDir = Join-Path $djangoRoot 'static\js'
$jsDest = Join-Path $www 'static\js'
New-Item -ItemType Directory -Force -Path $jsDest | Out-Null
Get-ChildItem $jsDir -Filter '*.js' -ErrorAction SilentlyContinue | Where-Object {
    $n = $_.Name
    $n -like 'daxi-*.js' -or $n -eq 'gps-precision-engine.js' -or $n -eq 'firebase-shim.js'
} | ForEach-Object {
    Copy-Item -Force $_.FullName (Join-Path $jsDest $_.Name)
}

$vubezSrc = Join-Path $jsDir 'vubez2'
$vubezDest = Join-Path $jsDest 'vubez2'
if (Test-Path $vubezSrc) {
    New-Item -ItemType Directory -Force -Path $vubezDest | Out-Null
    Get-ChildItem $vubezSrc -Filter '*.js' | ForEach-Object {
        Copy-Item -Force $_.FullName (Join-Path $vubezDest $_.Name)
    }
}

$imgSrc = Join-Path $djangoRoot 'static\img'
$imgDest = Join-Path $www 'static\img'
if (Test-Path $imgSrc) {
    New-Item -ItemType Directory -Force -Path $imgDest | Out-Null
    Copy-Item -Force -Recurse $imgSrc\* $imgDest
}

$indexSrc = Join-Path $djangoRoot 'vubez2.html'
if (-not (Test-Path $indexSrc)) { throw "Missing vubez2.html" }
$html = Get-Content $indexSrc -Raw -Encoding UTF8

$html = [regex]::Replace($html, '(?is)<link[^>]+fonts\.googleapis\.com[^>]*>\s*', '')
$html = [regex]::Replace($html, '(?is)<link[^>]+fonts\.gstatic\.com[^>]*>\s*', '')
$html = [regex]::Replace($html, "(?is)<link[^>]+href=['""]https://unpkg.com[^>]*>\s*", '')
$html = $html -replace "onerror=`"this.onerror=null;this.href='https://unpkg.com[^']+'[^`"]*`"", ''
$html = $html -replace "onerror=`"this.onerror=null;this.src='https://unpkg.com[^']+'[^`"]*`"", ''

$introPath = Join-Path $djangoRoot 'static\js\daxi-intro.js'
$introSource = ''
if (Test-Path $introPath) {
    $introSource = (Get-Content $introPath -Raw -Encoding UTF8).Replace('</script', '<\/script')
}
$html = [regex]::Replace(
    $html,
    '(?is)<script[^>]+src=["''][^"'']*daxi-intro\.js[^"'']*["''][^>]*>\s*</script>\s*',
    '',
    1
)
$html = [regex]::Replace(
    $html,
    '(?is)<script>\s*document\.addEventListener\(\s*[''"]DOMContentLoaded[''"]\s*,\s*function\s*\(\)\s*\{[^}]*DaxiIntro\.play[^}]*\}\s*\)\s*;\s*</script>\s*',
    '',
    1
)

$prehide = @"
    <script>document.documentElement.classList.add("daxi-native-shell","daxi-intro-boot");</script>
    <style id="daxi-intro-prehide">html.daxi-intro-boot body{visibility:hidden!important}html.daxi-intro-boot #daxi-cinematic{visibility:visible!important}html.daxi-intro-playing body,html.daxi-intro-done body{visibility:visible!important}</style>

"@
$introInline = ''
if ($introSource) {
    $introInline = @"
    <script data-daxi-intro="inline">
$introSource
</script>
    <script data-daxi-intro-boot>try{if(window.DaxiIntro&&DaxiIntro.play)DaxiIntro.play();}catch(e){}</script>

"@
}
$capInject = @"
    <script src="js/daxi-capacitor.js"></script>
    <link rel="stylesheet" href="assets/css/daxi-local-fonts.css">

"@
$configInject = @"
    <script src="daxi-capacitor-config.js"></script>

"@
if ($html -notmatch 'daxi-capacitor-config.js') {
    $headInject = $configInject + $prehide + $introInline + $capInject
    $html = [regex]::Replace($html, '(?i)(<head\b[^>]*>)', ('$1' + "`r`n" + $headInject), 1)
}

$indexOut = Join-Path $www 'index.html'
Set-Content -Path $indexOut -Value $html -Encoding utf8

$debugJs = if ($debugLogs) { 'true' } else { 'false' }
$httpJs = if ($allowHttp) { 'true' } else { 'false' }
$configJs = @"
window.DAXI_API_ENV = '$envName';
window.DAXI_API_BASE_URL = '$BaseUrl';
window.DAXI_API_ALLOW_HTTP = $httpJs;
window.DAXI_API_DEBUG_LOGS = $debugJs;
window.DAXI_USE_GOOGLE_MAPS = true;
window.DAXI_USE_MAPLIBRE = false;
window._daxiLiveBaseUrl = window.DAXI_API_BASE_URL;
window._daxiCapacitorApp = true;
window._daxiHybridShell = true;
"@
Set-Content -Path (Join-Path $www 'daxi-capacitor-config.js') -Value $configJs -Encoding utf8

$env:Path = "C:\Program Files\nodejs;" + $env:Path
$jsOutDir = Join-Path $www 'js'
New-Item -ItemType Directory -Force -Path $jsOutDir | Out-Null
Push-Location $capRoot
if (Get-Command npx -ErrorAction SilentlyContinue) {
    npx --yes esbuild capacitor-src/main.js --bundle --format=iife --outfile=www/js/daxi-capacitor.js --platform=browser
    Copy-Item -Force (Join-Path $www 'js\daxi-capacitor.js') (Join-Path $djangoRoot 'static\js\daxi-capacitor.js')
} else {
    Write-Warning "npx indisponible : copier un bundle existant si present"
}
Pop-Location

$n = (Get-ChildItem $www -Recurse -File | Measure-Object).Count
$mb = [math]::Round(((Get-ChildItem $www -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 2)
Write-Host ""
Write-Host "www pret : $n fichiers, $mb MB" -ForegroundColor Green
Write-Host "Ensuite : npx cap copy android  (ou npm run sync)"
