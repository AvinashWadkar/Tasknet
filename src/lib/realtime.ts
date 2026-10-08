export type RealtimeEvent =
  | { type: 'sync' }
  | { type: 'ping' }
  | { type: 'task'; taskId: string; action: string }
  | { type: 'users'; userId?: string }
  | { type: 'processes' }
  | { type: 'notification'; userId: string }

type Listener = (event: RealtimeEvent) => void

type Bus = { listeners: Set<Listener> }

const g = globalThis as typeof globalThis & { __tasknetRealtime?: Bus }
const bus: Bus = (g.__tasknetRealtime ??= { listeners: new Set() })

export function subscribeRealtime(listener: Listener): () => void {
  bus.listeners.add(listener)
  return () => {
    bus.listeners.delete(listener)
  }
}

export function publish(event: RealtimeEvent): void {
  for (const listener of [...bus.listeners]) {
    try {
      listener(event)
    } catch {
      // ignore
    }
  }
}
