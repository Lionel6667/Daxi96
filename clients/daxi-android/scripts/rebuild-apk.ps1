# Rebuild l'APK signe (debug) et le copie a la racine du projet Django (Daxi.apk)
$ErrorActionPreference = "Stop"
$android = Split-Path $PSScriptRoot -Parent
$djangoRoot = Split-Path (Split-Path $android -Parent) -Parent
$buildRoot = Join-Path $env:LOCALAPPDATA "daxi-android-build"
$apkOut = Join-Path $buildRoot "app\outputs\apk\debug\app-debug.apk"
$apkDest = Join-Path $djangoRoot "Daxi.apk"

if (Test-Path "C:\Program Files\Android\Android Studio\jbr") {
    $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
}

Set-Location $android
$ngrokFile = Join-Path $PSScriptRoot "ngrok-url.txt"
if (Test-Path $ngrokFile) {
    $url = (Get-Content $ngrokFile -Raw).Trim()
    if ($url) { Write-Host "URL cible : $url" -ForegroundColor Cyan }
}
Write-Host "Mise a jour du webcache embarque..." -ForegroundColor Cyan
& "$PSScriptRoot\bundle-webcache.ps1"
& .\gradlew.bat assembleDebug --no-daemon
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Test-Path $apkOut)) {
    Write-Error "APK introuvable : $apkOut"
}
Copy-Item $apkOut $apkDest -Force
Write-Host ""
Write-Host "APK signe pret : $apkDest" -ForegroundColor Green
Write-Host "Taille : $([math]::Round((Get-Item $apkDest).Length / 1MB, 2)) Mo"
Write-Host ""
Write-Host "Si 'App non installee' : desinstallez d'abord l'ancienne version DAXI sur le telephone."
