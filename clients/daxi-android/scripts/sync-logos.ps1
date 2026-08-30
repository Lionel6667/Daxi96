
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
python (Join-Path $root "scripts\sync_logos.py")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "sync-logos OK -> $root"
