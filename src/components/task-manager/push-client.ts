'use client'

import { api } from './api'

export const VAPID_PUBLIC_KEY =
  'BKhIUG2m1B-QieBdWUOHq3do4yOsFrfkMuwXL9U3DNYQQcCV55zSNTWuu7yY88th98DoG9jpNji_uGGeXhha7oI'

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

/** Register the service worker and subscribe this browser to web push (if permission is already granted). */
export async function subscribeForPush(): Promise<boolean> {
  if (typeof window === 'undefined') return false
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
      const bound = opts?.applicationServerKey
        ? Buffer.from(new Uint8Array(opts.applicationServerKey as ArrayBuffer)).toString('hex')
        : null
      if (bound !== null && bound !== Buffer.from(currentKey).toString('hex')) {
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