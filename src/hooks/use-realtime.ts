'use client'

import { useEffect, useRef } from 'react'
import type { RealtimeEvent } from '@/lib/realtime'

export type RealtimeHandler = (event: RealtimeEvent) => void

const HEARTBEAT_MS = 15_000
const SILENCE_MS = HEARTBEAT_MS * 3
const WATCHDOG_MS = 10_000

const handlers = new Set<RealtimeHandler>()
let source: EventSource | null = null
let watchdog: ReturnType<typeof setInterval> | null = null
let subscribers = 0
let syncsSeen = 0
let lastMessageAt = 0

function emit(event: RealtimeEvent) {
  for (const handler of [...handlers]) {
    try {
      handler(event)
    } catch {
      // ignore
    }
  }
}

function connect() {
  if (source || typeof window === 'undefined') return
  lastMessageAt = Date.now()
  source = new EventSource('/api/events')
  source.onmessage = (e) => {
    lastMessageAt = Date.now()
    let event: RealtimeEvent
    try {
      event = JSON.parse(e.data) as RealtimeEvent
    } catch {
      return
    }
    if (event.type === 'ping') return
    if (event.type === 'sync') {
      syncsSeen += 1
      if (syncsSeen > 1) emit({ type: 'sync' })
      return
    }
    emit(event)
  }
  source.onerror = () => {}

  if (!watchdog) {
    watchdog = setInterval(() => {
      if (!source) return
      if (Date.now() - lastMessageAt > SILENCE_MS) {
        source.close()
        source = null
        connect()
      }
    }, WATCHDOG_MS)
  }
}

function disconnect() {
  source?.close()
  source = null
  if (watchdog) {
    clearInterval(watchdog)
    watchdog = null
  }
  syncsSeen = 0
  lastMessageAt = 0
}

export function useRealtime(handler: RealtimeHandler, enabled = true) {
  const ref = useRef(handler)

  useEffect(() => {
    ref.current = handler
  }, [handler])

  useEffect(() => {
    if (!enabled) return
    const listener: RealtimeHandler = (event) => ref.current(event)
    handlers.add(listener)
    subscribers += 1
    connect()
    return () => {
      handlers.delete(listener)
      subscribers -= 1
      if (subscribers <= 0) disconnect()
    }
  }, [enabled])
}
