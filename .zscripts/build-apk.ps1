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

# Catch an off-centre or empty icon here rather than shipping it.
node .zscripts\verify-icons.mjs
if ($LASTEXITCODE -ne 0) { throw 'icon verification failed' }

# webDir is public/, so a local public\download\ mirror would be bundled into the
# APK's web assets. Remove it first, then restore it after the build.
$stagedInstallers = @()
if (Test-Path 'public\download') {
  $stagedInstallers = @(
    Get-ChildItem 'public\download' -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
  )
  Remove-Item 'public\download' -Recurse -Force -ErrorAction SilentlyContinue
}

# Sync from the repo root: the Capacitor CLI resolves android\ relative to the
# working directory and reports "platform has not been added" from inside it.
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'cap sync failed' }

Push-Location android
try {
  # Gradle writes notes and warnings to stderr; with ErrorActionPreference=Stop
  # PowerShell turns those into terminating errors even on a successful build.
  # Relax it here and rely on $LASTEXITCODE instead.
  $ErrorActionPreference = 'Continue'
  .\gradlew.bat assembleRelease --no-daemon
  $gradleExit = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($gradleExit -ne 0) { throw 'gradle build failed' }
}
finally {
  $ErrorActionPreference = 'Stop'
  Pop-Location
  # Restore the local mirror whether or not the build succeeded, so a failure
  # never leaves public\ in a different state than it was found in.
  if ($stagedInstallers.Count -gt 0) {
    New-Item -ItemType Directory -Path 'public\download' -Force | Out-Null
    # Re-copy from android-app: the FileInfo captured above points at the path
    # that was just deleted, so restore by name rather than by full path.
    foreach ($name in $stagedInstallers) {
      $source = Join-Path 'android-app' $name
      if (Test-Path $source) { Copy-Item $source "public\download\$name" -Force }
    }
  }
}

$apk = 'android\app\build\outputs\apk\release\app-release.apk'

# Take the version from build.gradle so the published filename always matches
# what the APK actually reports.
$gradle = Get-Content 'android\app\build.gradle' -Raw
$versionName = if ($gradle -match 'versionName\s+"([^"]+)"') { $Matches[1] } else { throw 'could not read versionName from build.gradle' }
$versionCode = if ($gradle -match 'versionCode\s+(\d+)') { [int]$Matches[1] } else { throw 'could not read versionCode from build.gradle' }
$published = "android-app\Tasknet-v$versionName.apk"

if (-not (Test-Path 'android-app')) { New-Item -ItemType Directory -Path 'android-app' | Out-Null }

# Older builds stay in android-app/ so any device on an earlier version can still
# be updated or reinstalled; the site's download button serves the newest.
Copy-Item $apk $published -Force

# The app reads this to decide whether a newer build exists. Keep it in step with
# the installer just published, otherwise the app offers an update that is not there.
$manifest = [ordered]@{
  version     = $versionName
  versionCode = $versionCode
  url         = "https://tasknet-azci.onrender.com/download/Tasknet-v$versionName.apk"
  size        = (Get-Item $published).Length
  publishedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
}
# Write without a BOM: PowerShell 5.1's utf8 encoding adds one, and Android's
# org.json parser rejects it, so the update check would fail on every launch.
$manifestJson = $manifest | ConvertTo-Json
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) 'android-app\latest.json'),
  $manifestJson,
  (New-Object System.Text.UTF8Encoding($false))
)

# Mirror the published builds for local runs of `next dev` / `next start`.
# capacitor.config.ts uses webDir: 'public', so anything here is also bundled
# into the APK's web assets by `cap sync' - which would nest the installers
# inside the app that offers them. Only mirror what is needed to test locally,
# and clear it before syncing so no APK is ever shipped inside another APK.
New-Item -ItemType Directory -Path 'public\download' -Force | Out-Null
Get-ChildItem 'android-app\*.apk' | ForEach-Object { Copy-Item $_.FullName "public\download\$($_.Name)" -Force }
Copy-Item 'android-app\latest.json' 'public\download\latest.json' -Force

Write-Host "`nAPK: $((Resolve-Path $apk).Path) ($([math]::Round((Get-Item $apk).Length / 1MB, 2)) MB)" -ForegroundColor Green
Write-Host "Published: $((Resolve-Path $published).Path)  (v$versionName)" -ForegroundColor Green
Write-Host "Kept: $((Get-ChildItem 'android-app\*.apk').Count) build(s) in android-app\" -ForegroundColor Green