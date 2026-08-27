# Ouvre le pont USB entre le telephone et le serveur Django local.
# A relancer apres chaque rebranchement du cable.

$ErrorActionPreference = 'Stop'

$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) {
    $adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
}
if (-not $adb) {
    Write-Error "adb introuvable. Installe les platform-tools Android."
}

$devices = & $adb devices | Select-String -Pattern '\sdevice$'
if (-not $devices) {
    Write-Error "Aucun telephone autorise. Branche le cable et accepte le debogage USB."
}

& $adb reverse --remove-all | Out-Null
& $adb reverse tcp:8000 tcp:8000 | Out-Null
Write-Host "Pont USB actif : le telephone atteint Django sur http://localhost:8000" -ForegroundColor Green

$probe = & $adb shell "curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/"
if ($probe -eq '200') {
    Write-Host "Django repond depuis le telephone (HTTP 200)." -ForegroundColor Green
} else {
    Write-Host "Django ne repond pas (code '$probe'). Lance : python manage.py runserver 0.0.0.0:8000" -ForegroundColor Yellow
}
