# Permissions Android / iOS + FCM after npx cap add.
$ErrorActionPreference = "Continue"
$capRoot = Split-Path $PSScriptRoot -Parent
$djangoRoot = Split-Path (Split-Path $capRoot -Parent) -Parent

$manifest = Join-Path $capRoot "android\app\src\main\AndroidManifest.xml"
if (Test-Path $manifest) {
    $xml = Get-Content $manifest -Raw -Encoding UTF8
    $perms = @(
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.VIBRATE",
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE"
    )
    foreach ($p in $perms) {
        if ($xml -notmatch [regex]::Escape($p)) {
            $line = '    <uses-permission android:name="' + $p + '" />'
            $xml = $xml -replace "(<manifest[^>]*>)", ('$1' + "`r`n" + $line)
        }
    }
    if ($xml -notmatch 'android:scheme="daxi"') {
        $filters = @"
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="daxi" />
            </intent-filter>
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="daxipro.com" android:pathPrefix="/track/" />
                <data android:scheme="https" android:host="daxipro.com" android:pathPrefix="/driver/" />
            </intent-filter>
"@
        $xml = $xml -replace '(</activity>)', ($filters + "`r`n        </activity>")
    }
    Set-Content $manifest $xml -Encoding UTF8
    Write-Host "AndroidManifest permissions + deep links OK"
}

$appGradle = Join-Path $capRoot "android\app\build.gradle"
if (Test-Path $appGradle) {
    $g = Get-Content $appGradle -Raw -Encoding UTF8
    if ($g -notmatch "com.google.gms.google-services") {
        $g = $g.TrimEnd() + "`r`n`r`napply plugin: 'com.google.gms.google-services'`r`n"
        Set-Content $appGradle $g -Encoding UTF8
        Write-Host "android/app/build.gradle google-services"
    }
}

$rootGradle = Join-Path $capRoot "android\build.gradle"
if (Test-Path $rootGradle) {
    $rg = Get-Content $rootGradle -Raw -Encoding UTF8
    if ($rg -notmatch "com.google.gms:google-services") {
        $rg = $rg -replace "(dependencies\s*\{)", ('$1' + "`r`n        classpath 'com.google.gms:google-services:4.4.2'")
        Set-Content $rootGradle $rg -Encoding UTF8
        Write-Host "android/build.gradle classpath google-services"
    }
}

$gsSrc = Join-Path $djangoRoot "clients\daxi-android\app\google-services.json"
$gsDest = Join-Path $capRoot "android\app\google-services.json"
if ((Test-Path $gsSrc) -and -not (Test-Path $gsDest)) {
    Copy-Item $gsSrc $gsDest -Force
    Write-Host "google-services.json copied"
}

$plist = Join-Path $capRoot "ios\App\App\Info.plist"
$locWhen = "Daxi utilise votre position pour trouver un chauffeur plus vite et afficher votre point de prise en charge. Vous pouvez aussi saisir l adresse manuellement."
$locAlways = "Daxi utilise votre position pendant la course pour le suivi en temps reel."
$notif = "Recevez une alerte quand un prix est propose, quand un chauffeur est assigne, et quand il arrive."
if (Test-Path $plist) {
    $pl = Get-Content $plist -Raw -Encoding UTF8
    $pairs = @{
        "NSLocationWhenInUseUsageDescription" = $locWhen
        "NSLocationAlwaysAndWhenInUseUsageDescription" = $locAlways
        "NSUserNotificationsUsageDescription" = $notif
    }
    foreach ($k in $pairs.Keys) {
        if ($pl -notmatch [regex]::Escape($k)) {
            $snippet = "	<key>$k</key>`r`n	<string>$($pairs[$k])</string>`r`n"
            $pl = $pl -replace "</dict>\s*</plist>", ($snippet + "</dict>`r`n</plist>")
        }
    }
    if ($pl -notmatch "CFBundleURLTypes") {
        $urlTypes = @"
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>com.daxipro.daxi</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>daxi</string>
			</array>
		</dict>
	</array>
"@
        $pl = $pl -replace "</dict>\s*</plist>", ($urlTypes + "`r`n</dict>`r`n</plist>")
    }
    Set-Content $plist $pl -Encoding UTF8
    Write-Host "iOS Info.plist GPS/notifications/deep links OK"
} else {
    Write-Host "iOS not generated yet. Run npx cap add ios on a Mac."
}

Write-Host "patch-native done"
