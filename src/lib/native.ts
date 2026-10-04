/**
 * Runtime facts about the shell the app is running in.
 *
 * The Android build is a Capacitor WebView around this same site, so the same
 * bundle runs on the web and on a phone. Anything that should differ between
 * the two (a download prompt, native push registration) asks here.
 */

/** True when running inside the Capacitor Android shell. */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  const c = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
  return c.Capacitor?.isNativePlatform?.() === true
}

/**
 * Where the Android installer lives. Defaults to the copy served by this site
 * so the button works without any external hosting; point
 * NEXT_PUBLIC_APK_URL at a GitHub release or CDN to serve the APK from
 * somewhere else.
 */
export function apkUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APK_URL
  return (configured && configured.trim()) || '/Tasknet-v1.0.apk'
}
