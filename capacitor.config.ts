import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The APK is a thin WebView shell around the live Tasknet site, so the website and the
 * app always run the same code against the same API/DB — and both work side by side.
 * There is no bundled Next.js build: `server.url` is what actually loads.
 */
const config: CapacitorConfig = {
  appId: 'com.avinash.tasknet',
  appName: 'Tasknet',
  webDir: 'public',
  server: {
    url: 'https://tasknet-azci.onrender.com',
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#2E4566',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
}

export default config