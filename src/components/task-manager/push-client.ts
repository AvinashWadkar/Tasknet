'use client'

import { api } from './api'
import { isNativeApp } from '@/lib/native'

export const VAPID_PUBLIC_KEY =
  'BKhIUG2m1B-QieBdWUOHq3do4yOsFrfkMuwXL9U3DNYQQcCV55zSNTWuu7yY88th98DoG9jpNji_uGGeXhha7oI'

const NATIVE_TOKEN_KEY = 'tasknet_fcm_token'

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return ''
  const bytes = new Uint8Array(buffer)
  let bin = ''
  bytes.forEach((b) => {
    bin += String.fromCharCode(b)
  })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Hex without Buffer — there is no Node polyfill in the browser bundle. */
function toHex(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Register this install for native push (FCM). Used inside the Android APK, where
 * the WebView has no Web Push API. Requests the Android 13+ POST_NOTIFICATIONS
 * permission first, then stores the Firebase token against the signed-in user.
 *
 * The plugin's register() resolves with void and reports the token through the
 * 'registration' event, so we wait for that event instead.
 */
export async function subscribeForNativePush(): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    // On Android 13+ notifications stay off until the user grants this at runtime.
    const current = await PushNotifications.checkPermissions()
    let status = current.receive
    if (status === 'prompt') {
      status = (await PushNotifications.requestPermissions()).receive
    }
    if (status !== 'granted') return false

    const token = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('FCM registration timed out')), 20000)
      void PushNotifications.addListener('registration', (t) => {
        clearTimeout(timer)
        resolve(t.value)
      })
      void PushNotifications.addListener('registrationError', (e) => {
        clearTimeout(timer)
        reject(new Error(e.error || 'FCM registration failed'))
      })
      void PushNotifications.register()
    })

    // Keep it locally so logout can unregister this exact install.
    try {
      window.localStorage.setItem(NATIVE_TOKEN_KEY, token)
    } catch {
      // private mode etc. — not fatal
    }

    await api('/api/push/devices', {
      method: 'POST',
      body: JSON.stringify({ token, platform: 'android' }),
    })
    return true
  } catch {
    // Missing google-services.json, no Play Services, or permission denied.
    return false
  }
}

/** Drop this install's FCM token (called on logout so the next user gets no alerts). */
export async function unsubscribeForNativePush(): Promise<void> {
  if (!isNativeApp()) return
  try {
    const token = window.localStorage.getItem(NATIVE_TOKEN_KEY)
    if (token) {
      await api('/api/push/devices', { method: 'DELETE', body: JSON.stringify({ token }) })
      window.localStorage.removeItem(NATIVE_TOKEN_KEY)
    }
    const { PushNotifications } = await import('@capacitor/push-notifications')
    await PushNotifications.unregister()
  } catch {
    // ignore
  }
}

/** Register the service worker and subscribe this browser to web push (if permission is already granted). */
export async function subscribeForPush(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  // Inside the APK the server delivers via FCM instead, so skip web push entirely.
  if (isNativeApp()) return subscribeForNativePush()
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  if ('Notification' in window && Notification.permission !== 'granted') return false

  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    // Wait for the SW to be active before subscribing
    await navigator.serviceWorker.ready
    const currentKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    let existing = await reg.pushManager.getSubscription()
    if (existing) {
      // If the server's VAPID key was rotated, the browser's old subscription
      // is bound to a different key and would silently reject pushes. When the
      // browser exposes the bound key we can detect that and re-subscribe.
      const opts = (existing as { options?: { applicationServerKey?: ArrayBuffer | Uint8Array | null } }).options
      const boundKey = opts?.applicationServerKey
      const bound = boundKey ? toHex(boundKey as ArrayBuffer | Uint8Array) : null
      if (bound !== null && bound !== toHex(currentKey)) {
        await existing.unsubscribe()
        existing = null
      }
    }
    const sub =
      existing ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: currentKey,
      }))
    await api('/api/push-subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: {
          auth: arrayBufferToBase64Url(sub.getKey('auth')),
          p256dh: arrayBufferToBase64Url(sub.getKey('p256dh')),
        },
      }),
    })
    return true
  } catch {
    // e.g. insecure origin, permission denied, or push service unavailable — page popups/toasts still work
    return false
  }
}

/** Remove this browser's subscription from the server (e.g. on logout). */
export async function unsubscribeForPush(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await api('/api/push-subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) })
      await sub.unsubscribe()
    }
  } catch {
    // ignore
  }
}