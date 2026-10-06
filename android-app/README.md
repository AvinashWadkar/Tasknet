# Android app (Tasknet APK)

Released builds of the Tasknet Android app live here, separate from the web
assets in `public/`.

| File | Purpose |
| --- | --- |
| `latest.json` | Release manifest the app reads to detect a newer build. Regenerated on every build. |
| `Tasknet-v1.2.apk` | Current release. Signed; install it directly on a phone. |
| `Tasknet-v1.1.apk` | Previous release, kept so devices on v1.1 can be updated. |
| `Tasknet-v1.0.apk` | Previous release, kept so devices on v1.0 can be updated. |

Every build is kept here under `Tasknet-v<version>.apk`. Nothing is overwritten or
deleted, so any version can be downloaded and installed directly.

## Building a new release

```powershell
.\.zscripts\build-apk.ps1
```

The script regenerates the app icons from the master logo, verifies them, builds
the signed APK through Gradle, and publishes the result to this folder as
`Tasknet-v1.0.apk`. Replace the file here and commit it to publish a new build.

## In-app update check

On every launch the app fetches `latest.json` (from the site, falling back to the
raw GitHub URL) and compares `versionCode` against its own. If the published
build is newer it shows an **Update available** dialog; tapping **Update**
downloads the APK through `DownloadManager` and hands it to the system installer
once the download finishes.

Two things this depends on:

- `versionCode` must keep increasing, or Android refuses the upgrade.
- `latest.json` must be regenerated and committed with each build. `build-apk.ps1`
  writes it automatically, so a forgotten manifest means no update prompt.

The app needs "install unknown apps" the first time. It asks via the system
prompt; if that is refused it sends the user to Settings and resumes the install
when they return.

## How it reaches users

The download button on the site points at `/download/Tasknet-v1.0.apk`. Next.js
only serves files from `public/`, so the Docker build copies this folder into
`public/download/` during the image build. Locally, copy it there yourself:

```powershell
New-Item -ItemType Directory -Force public\download
Copy-Item android-app\Tasknet-v1.0.apk public\download\
```

`NEXT_PUBLIC_APK_URL` overrides the URL, so you can point the button at a GitHub
release or a CDN instead.

## Bumping the version

1. Edit `android/app/build.gradle`: raise `versionCode` (required, and must keep
   increasing for Android to accept an upgrade) and `versionName`.
2. Update `APP_VERSION` in `src/lib/native.ts` so the download button points at
   the new file.
3. Run `.\.zscripts\build-apk.ps1`. The script reads the version out of
   `build.gradle` and publishes to `android-app/Tasknet-v<version>.apk`.

The site's button serves the current version only. Older files stay in this
folder but are not linked from the site; share their path directly to reach them.

## Notes

- The APK is a Capacitor WebView around the live site, so it needs no code of its
  own beyond `android/` (git-ignored) and the native patches described in
  `.zscripts/`.
- Release signing uses `android/keystore.properties` and a `.p12` keystore held
  outside the repository. Never commit either.
- Keep versions as `Tasknet-v<major>.apk` so several can be published side by
  side; the download button defaults to the latest.