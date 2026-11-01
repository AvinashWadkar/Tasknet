/** Small JSON fetch helper: throws with server-provided error message. */
export async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    ...opts,
  })
  let data: unknown = {}
  try {
    data = await res.json()
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || `Request failed (${res.status})`
    throw new Error(msg)
  }
  return data as T
}

/**
 * Download a server-generated file (Excel, PowerPoint, ...) and save it with
 * the given filename. Throws with the server's message on a failed response.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || `Download failed (${res.status})`)
  }
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}
