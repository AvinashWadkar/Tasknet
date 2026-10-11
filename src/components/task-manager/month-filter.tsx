'use client'

import { useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CalendarRange } from 'lucide-react'
import { monthLabel, shiftMonth, istToday } from '@/lib/dates'
import { cn } from '@/lib/utils'

const MONTHS_BACK = 24
const MONTHS_AHEAD = 12

/** Month key (YYYY-MM) options around today, newest first; always includes `value`. */
function buildOptions(value: string): { value: string; label: string }[] {
  const base = istToday()
  const out: { value: string; label: string }[] = []
  for (let d = MONTHS_AHEAD; d >= -MONTHS_BACK; d--) {
    const ds = shiftMonth(base, d)
    out.push({ value: ds.slice(0, 7), label: monthLabel(ds) })
  }
  if (value && !out.some((o) => o.value === value)) {
    out.unshift({ value, label: monthLabel(`${value}-15`) })
  }
  return out
}

/**
 * Compact month dropdown used at the top of the My Tasks and Team View tabs.
 * `value` is a YYYY-MM key; pass `allowAll` to offer an "All time" option
 * (empty string).
 */
export function MonthFilter({
  value,
  onChange,
  allowAll = false,
  className,
}: {
  value: string
  onChange: (month: string) => void
  allowAll?: boolean
  className?: string
}) {
  const options = useMemo(() => buildOptions(value), [value])

  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      <CalendarRange className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <Select value={value || 'ALL'} onValueChange={(v) => onChange(v === 'ALL' ? '' : v)}>
        <SelectTrigger size="sm" className="h-8 w-[152px] text-xs" aria-label="Filter by month">
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent>
          {allowAll && <SelectItem value="ALL">All time</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
