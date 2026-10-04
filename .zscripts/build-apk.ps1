# Builds the signed Tasknet Android APK (WebView shell around the live site).
#
#   .\build-apk.ps1
#   -> android\app\build\outputs\apk\release\app-release.apk
#
# The android/ project is git-ignored, so this script + capacitor.config.ts are the
# source of truth. Regenerate the native project with: npx cap add android

$ErrorActionPreference = 'Stop'

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$jbr = 'C:\Program Files\Android\Android Studio\jbr'
if (-not (Test-Path $sdk)) { throw "Android SDK not found at $sdk - set ANDROID_HOME" }
if (-not (Test-Path (Join-Path $jbr 'bin\java.exe'))) { throw "JDK 21 not found at $jbr - install Android Studio" }
if (-not (Test-Path 'android\keystore.properties')) {
  throw 'android\keystore.properties is missing - it holds the release signing password (never commit it)'
}

$env:JAVA_HOME = $jbr
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:PATH = "$jbr\bin;$env:PATH"

# Launcher + notification icons live in the git-ignored android/ project, so
# regenerate them from the master logo before every build.
node .zscripts\generate-icons.mjs | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'icon generation failed' }

Push-Location android
try {
  # Push local code changes into the native project, then build the signed APK.
  npx cap sync android
  if ($LASTEXITCODE -ne 0) { throw 'cap sync failed' }
  .\gradlew.bat assembleRelease --no-daemon
  if ($LASTEXITCODE -ne 0) { throw 'gradle build failed' }
}
finally { Pop-Location }

$apk = 'android\app\build\outputs\apk\release\app-release.apk'
Write-Host "`nAPK: $((Resolve-Path $apk).Path) ($([math]::Round((Get-Item $apk).Length / 1MB, 2)) MB)" -ForegroundColor Green