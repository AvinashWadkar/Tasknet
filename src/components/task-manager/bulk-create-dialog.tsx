'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import {
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  KeyRound,
  Loader2,
  UploadCloud,
  X,
} from 'lucide-react'

interface BulkRowResult {
  row: number
  employeeCode: string
  name: string
  status: 'created' | 'updated' | 'failed'
  message: string
  managerLinked: boolean
}

interface BulkResponse {
  totalRows: number
  createdCount: number
  updatedCount: number
  failedCount: number
  results: BulkRowResult[]
}

const ACCEPT = '.xlsx,.xls,.csv'
const TEMPLATE_URL = '/employee-upload-template.xlsx'

function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function countsLabel(r: BulkResponse) {
  const parts: string[] = []
  if (r.createdCount) parts.push(`${r.createdCount} created`)
  if (r.updatedCount) parts.push(`${r.updatedCount} updated`)
  if (r.failedCount) parts.push(`${r.failedCount} failed`)
  return parts.join(' · ') || 'No rows processed'
}

export function BulkCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
}) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BulkResponse | null>(null)

  // Fresh slate every time the dialog opens
  useEffect(() => {
    if (open) {
      setFile(null)
      setDragging(false)
      setBusy(false)
      setError(null)
      setResult(null)
    }
  }, [open])

  function chooseFile(f: File | undefined | null) {
    setError(null)
    if (!f) return
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
      setError('Unsupported file type — please upload the downloaded .xlsx template.')
      return
    }
    setFile(f)
    setResult(null)
  }

  async function upload() {
    if (!file || busy) return
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/users/bulk', { method: 'POST', body: fd })
      const data = (await res.json().catch(() => ({}))) as BulkResponse & { error?: string }
      if (!res.ok) {
        throw new Error(data.error || `Upload failed (${res.status})`)
      }
      setResult(data)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      if (data.createdCount > 0 || data.updatedCount > 0) {
        onCreated()
      }
      toast({
        title: (
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Bulk upload finished — {countsLabel(data)}
          </span>
        ),
        description:
          data.failedCount > 0
            ? `${data.failedCount} row${data.failedCount === 1 ? '' : 's'} could not be processed — see the summary below.`
            : 'Every row was processed. New IDs get the default password and must change it at first login.',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto [scrollbar-width:thin]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4 text-brand-600" /> Bulk Create Employee IDs
          </DialogTitle>
          <DialogDescription>
            Download the template, fill in the employee details and upload it — all valid rows become employee IDs instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1 — template */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">1</span>
              Download the template
            </p>
            <Button asChild variant="outline" size="sm" className="border-brand-200 text-brand-700 hover:bg-brand-50">
              <a href={TEMPLATE_URL} download="employee-upload-template.xlsx">
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Download Excel Template
              </a>
            </Button>
            <p className="mt-2 text-xs text-slate-500">
              The file has a sample row and a full Instructions sheet — rows with code <code>EXAMPLE</code> are ignored.
            </p>
          </div>

          {/* Step 2 — upload */}
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">2</span>
              Fill it &amp; upload
            </p>

            <label
              className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
                dragging ? 'border-brand-400 bg-brand-50' : 'border-slate-300 bg-white hover:border-brand-300 hover:bg-brand-50/40'
              }`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                chooseFile(e.dataTransfer.files?.[0])
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => chooseFile(e.target.files?.[0])}
              />
              {file ? (
                <>
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    <span className="max-w-[16rem] truncate">{file.name}</span>
                    <span className="text-xs font-normal text-slate-400">{fileSizeLabel(file.size)}</span>
                  </span>
                  <span
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500"
                    role="button"
                    aria-label="Remove selected file"
                    onClick={(e) => {
                      e.preventDefault()
                      setFile(null)
                      if (inputRef.current) inputRef.current.value = ''
                    }}
                  >
                    <X className="h-3 w-3" /> Choose a different file
                  </span>
                </>
              ) : (
                <>
                  <UploadCloud className={`h-7 w-7 ${dragging ? 'text-brand-500' : 'text-slate-300'}`} />
                  <span className="text-sm text-slate-600">
                    Drag &amp; drop the filled file here, <span className="font-medium text-brand-700">or click to browse</span>
                  </span>
                  <span className="text-xs text-slate-400">.xlsx · .xls · .csv — up to 2 MB, 500 employees</span>
                </>
              )}
            </label>

            <Button type="button" className="mt-3 w-full" disabled={!file || busy} onClick={upload}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              {busy ? 'Uploading…' : 'Upload & Create IDs'}
            </Button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          {/* Consolidated result — one summary block for the whole upload */}
          {result && (
            <div className="space-y-2">
              <div
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  result.failedCount === 0
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                {result.failedCount === 0
                  ? `All done — ${result.totalRows} of ${result.totalRows} rows processed (${countsLabel(result)}).`
                  : `${result.createdCount + result.updatedCount} of ${result.totalRows} rows processed — ${countsLabel(result)}.`}
              </div>
              {result.failedCount > 0 && (
                <p className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs leading-relaxed text-slate-600">
                  {result.results
                    .filter((r) => r.status === 'failed')
                    .map((r) => `Row ${r.row} (${r.employeeCode || r.name || 'blank'}): ${r.message}`)
                    .join(' · ')}
                </p>
              )}
            </div>
          )}

          <p className="flex items-start gap-1.5 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Every created ID gets the default password <code className="font-bold">Digitide@123</code> and must set a new
              one at first login. Passwords stay visible to you in the All Users table.
            </span>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
