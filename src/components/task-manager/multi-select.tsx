'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { Check, CheckSquare, ChevronDown, Search, Square, X } from 'lucide-react'

export interface MultiSelectOption {
  value: string
  label: string
}

/**
 * Multi-select dropdown with a Select-All toggle, search and per-item
 * checkboxes. Used by the Reports filter bar — every filter supports
 * "select all" per requirement.
 */
export function MultiSelect({
  label,
  icon: Icon,
  options,
  selected,
  onChange,
  disabled,
}: {
  label: string
  icon?: React.ComponentType<{ className?: string }>
  options: MultiSelectOption[]
  selected: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')

  const allSelected = options.length > 0 && selected.length === options.length
  const noneSelected = selected.length === 0
  const count = selected.length

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  }, [options, query])

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  const toggleAll = () => {
    onChange(allSelected ? [] : options.map((o) => o.value))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={`${label} filter`}
          disabled={disabled}
          className="h-10 w-full justify-between gap-1.5 border-slate-200 bg-white px-3 font-normal data-[state=open]:border-brand-300 data-[state=open]:ring-2 data-[state=open]:ring-brand-100"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-brand-500" aria-hidden="true" />}
            <span className="truncate text-sm text-slate-700">{label}</span>
            <span
              className={cn(
                'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                count === options.length && options.length > 0
                  ? 'bg-brand-100 text-brand-700'
                  : 'bg-amber-100 text-amber-800'
              )}
            >
              {count}/{options.length}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {/* Select all + clear */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
          <button
            type="button"
            onClick={toggleAll}
            className="flex items-center gap-2 text-sm font-medium text-slate-700 transition hover:text-brand-700"
            aria-pressed={allSelected}
          >
            {allSelected ? (
              <CheckSquare className="h-4 w-4 text-brand-600" aria-hidden="true" />
            ) : (
              <Square className="h-4 w-4 text-slate-400" aria-hidden="true" />
            )}
            Select all
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex items-center gap-1 text-xs text-slate-400 transition hover:text-red-600"
            disabled={noneSelected}
          >
            <X className="h-3 w-3" aria-hidden="true" /> Clear
          </button>
        </div>
        {/* Search */}
        {options.length > 8 && (
          <div className="border-b border-slate-100 px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 text-sm outline-none placeholder:text-slate-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                aria-label={`Search ${label} options`}
              />
            </div>
          </div>
        )}
        {/* Options */}
        <div className="max-h-64 overflow-y-auto p-1.5" role="listbox" aria-multiselectable="true" aria-label={label}>
          {visible.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-slate-400">
              {options.length === 0 ? 'No options available' : 'No matches'}
            </p>
          ) : (
            visible.map((o) => {
              const checked = selected.includes(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 transition hover:bg-brand-50"
                >
                  {/* span-based check indicator — a real checkbox would nest a button inside a button */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition',
                      checked ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white'
                    )}
                  >
                    {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
