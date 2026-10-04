/* Tasknet push notification service worker */
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
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const taskId = data.taskId || null
  const target = taskId ? `/?task=${encodeURIComponent(taskId)}` : '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const targetPath = new URL(target, self.location.origin).pathname
      for (const client of windowClients) {
        const clientPath = new URL(client.url).pathname
        if (clientPath === targetPath && 'focus' in client) {
          client.focus()
          if ('navigate' in client) return client.navigate(target).catch(() => undefined)
          return undefined
        }
      }
      if (clients.openWindow) return clients.openWindow(target)
      return undefined
    })
  )
})

self.addEventListener('pushsubscriptionchange', () => {
  // The page re-registers the subscription on next load; nothing else to do here.
})