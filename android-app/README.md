# Android app (Tasknet APK)

Released builds of the Tasknet Android app live here, separate from the web
assets in `public/`.

| File | Purpose |
| --- | --- |
| `Tasknet-v1.0.apk` | Current release. Signed with the release key; install it directly on a phone. |

## Building a new release

```powershell
.\.zscripts\build-apk.ps1
```

The script regenerates the app icons from the master logo, verifies them, builds
the signed APK through Gradle, and publishes the result to this folder as
`Tasknet-v1.0.apk`. Replace the file here and commit it to publish a new build.

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

## Notes

- The APK is a Capacitor WebView around the live site, so it needs no code of its
  own beyond `android/` (git-ignored) and the native patches described in
  `.zscripts/`.
- Release signing uses `android/keystore.properties` and a `.p12` keystore held
  outside the repository. Never commit either.
- Keep versions as `Tasknet-v<major>.apk` so several can be published side by
  side; the download button defaults to the latest.