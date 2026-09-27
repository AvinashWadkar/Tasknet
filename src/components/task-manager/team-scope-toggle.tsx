'use client'

import { Switch } from '@/components/ui/switch'
import { UsersRound } from 'lucide-react'

export type TeamScope = 'ALL' | 'DIRECT'

export function TeamScopeToggle({
  scope,
  onChange,
}: {
  scope: TeamScope
  onChange: (scope: TeamScope) => void
}) {
  const direct = scope === 'DIRECT'
  return (
    <div
      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm"
      title={direct ? 'Only showing your direct reportees' : 'Showing your full team below you'}
    >
      <UsersRound className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
      <Switch
        id="team-scope-direct"
        checked={direct}
        onCheckedChange={(c) => onChange(c ? 'DIRECT' : 'ALL')}
        className="data-[state=checked]:bg-brand-600"
        aria-label="Only direct reportees"
      />
      <label
        htmlFor="team-scope-direct"
        className="cursor-pointer select-none whitespace-nowrap text-xs font-medium text-slate-600"
      >
        Only direct reportees
      </label>
    </div>
  )
}