/* Tasknet push notification service worker */
// Take over as soon as a new version is deployed (this SW caches no assets, so
// there is nothing to invalidate) — otherwise an updated click handler would
// not apply until every tab has been closed.
self.addEventListener('install', () => {
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload = {}
  try {
    payload = event.data.json() || {}
  } catch {
    payload = { title: 'Tasknet', body: event.data.text() }
  }
  const title = payload.title || 'Tasknet'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/badge.png',
    tag: payload.tag || 'tasknet',
    renotify: true,
    data: { url: payload.url || '/', taskId: payload.taskId || null },
  }
  // A "buzz" wants the phone to really get noticed: a long, repeating vibration
  // pattern (Chrome on Android honors `vibrate`) and a notification that stays
  // on screen until the user deals with it.
  if (payload.highVibration) {
    options.vibrate = [0, 600, 250, 600, 250, 600, 250, 600]
    options.requireInteraction = true
    options.renotify = true
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const taskId = data.taskId || null
  // Always resolve to an absolute same-origin URL so focus/navigate/openWindow
  // behave identically on every browser (relative URLs are unreliable here).
  const target = new URL(
    taskId ? `/?task=${encodeURIComponent(taskId)}` : data.url || '/',
    self.location.origin
  )
  const targetHref = target.href

  event.waitUntil(
    (async () => {
      const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Prefer a window already showing the app (same path), then any other.
      const samePath = windowClients.filter((c) => {
        try {
          return new URL(c.url).pathname === target.pathname
        } catch {
          return false
        }
      })
      const ordered = [...samePath, ...windowClients.filter((c) => !samePath.includes(c))]

      for (const client of ordered) {
        try {
          if ('focus' in client) await client.focus()
        } catch {
          /* focus can reject on some platforms — keep going */
        }
        try {
          if ('navigate' in client) {
            await client.navigate(targetHref)
            return
          }
        } catch {
          /* fall through to the next client / openWindow */
        }
      }
      if (clients.openWindow) {
        try {
          await clients.openWindow(targetHref)
        } catch {
          /* nothing else we can do */
        }
      }
    })()
  )
})

self.addEventListener('pushsubscriptionchange', () => {
  // The page re-registers the subscription on next load; nothing else to do here.
})