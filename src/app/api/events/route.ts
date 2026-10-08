import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { subscribeRealtime, type RealtimeEvent } from '@/lib/realtime'

export const dynamic = 'force-dynamic'

const HEARTBEAT_MS = 15_000

export async function GET(request: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const encoder = new TextEncoder()
  const userId = session.id

  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let unsubscribe: (() => void) | null = null
  let closed = false

  const cleanup = () => {
    if (closed) return
    closed = true
    if (heartbeat) clearInterval(heartbeat)
    heartbeat = null
    unsubscribe?.()
    unsubscribe = null
    try {
      controller?.close()
    } catch {
      // already closed
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c

      const write = (chunk: string) => {
        if (closed) return
        try {
          c.enqueue(encoder.encode(chunk))
        } catch {
          cleanup()
        }
      }

      const forward = (event: RealtimeEvent) => {
        if (event.type === 'notification' && event.userId !== userId) return
        write(`data: ${JSON.stringify(event)}\n\n`)
      }

      unsubscribe = subscribeRealtime(forward)
      write(`data: ${JSON.stringify({ type: 'sync' })}\n\n`)
      heartbeat = setInterval(() => write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`), HEARTBEAT_MS)
    },
    cancel: cleanup,
  })

  request.signal.addEventListener('abort', cleanup)

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
