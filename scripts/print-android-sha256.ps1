# Affiche les empreintes SHA du keystore release DAXI (App Links + Firebase).
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $root 'manage.py'))) { $root = Split-Path $PSScriptRoot -Parent }

$keytool = $env:JAVA_HOME
if ($keytool) { $keytool = Join-Path $keytool 'bin\keytool.exe' }
if (-not ($keytool -and (Test-Path $keytool))) {
    $keytool = 'C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe'
}
if (-not (Test-Path $keytool)) {
    throw 'keytool introuvable — installe Android Studio ou définis JAVA_HOME'
}

$propsFile = Join-Path $root 'clients\daxi-android\keystore.properties'
if (-not (Test-Path $propsFile)) {
    throw "keystore.properties manquant: $propsFile (voir keystore.properties.example)"
}
$props = @{}
Get-Content $propsFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') { $props[$matches[1].Trim()] = $matches[2].Trim() }
}
$store = $props['storeFile']
$alias = $props['keyAlias']
$pass = $props['storePassword']
if (-not $store -or -not $alias -or -not $pass) { throw 'storeFile, keyAlias ou storePassword manquant dans keystore.properties' }

Write-Host "Keystore: $store"
Write-Host "Alias   : $alias"
Write-Host ''
& $keytool -list -v -keystore $store -alias $alias -storepass $pass | Select-String -Pattern 'SHA256:|SHA1:'
