import { useState } from 'react'
import { CircleSlash, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAutoScheduler } from '@/features/scheduling/use-auto-scheduler'
import type { EngineResult, Suggestion } from '@/features/scheduling/auto-scheduler'
import type { PlanWithType } from '@/features/services/use-plans'

/** Stable id for a suggestion row (one person → one position). */
function suggestionKey(s: Suggestion): string {
  return `${s.positionId}-${s.personId}`
}

/**
 * "Suggest roster" — runs the deterministic auto-scheduler (issue #35) over the
 * plan's unfilled mandatory slots and previews the result before writing it.
 * Each suggestion has a checkbox so the admin can accept only some of them
 * (issue #47); applying inserts the selected ones as a `pending` draft they can
 * still edit and which still passes through the publish gate.
 */
export function SuggestRosterButton({
  plan,
  compact = false,
}: {
  plan: PlanWithType
  /** Compact, full-width rendering for the Matrix's per-column header cells. */
  compact?: boolean
}) {
  const engine = useAutoScheduler(plan)
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<EngineResult | null>(null)
  // Keys of the suggestions the admin has ticked to accept.
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function run() {
    const r = engine.suggest()
    setResult(r)
    // Default to accepting everything — unticking is the exception.
    setSelected(new Set(r.suggestions.map(suggestionKey)))
    setOpen(true)
  }

  const suggestions = result?.suggestions ?? []
  const allSelected = suggestions.length > 0 && selected.size === suggestions.length
  const headerState: boolean | 'indeterminate' = allSelected
    ? true
    : selected.size > 0
      ? 'indeterminate'
      : false

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(suggestions.map(suggestionKey)))
  }

  function applySelected() {
    const chosen = suggestions.filter((s) => selected.has(suggestionKey(s)))
    if (chosen.length === 0) return
    const n = chosen.length
    engine.apply.mutate(chosen, {
      onSuccess: () => {
        toast.success(`Added ${n} ${n === 1 ? 'person' : 'people'} to the plan`)
        setOpen(false)
      },
      onError: (e) => toast.error(e.message),
    })
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={run}
        disabled={engine.isPending || !engine.ready}
        className={compact ? 'size-6 shrink-0 border-muted-foreground/40 p-0' : undefined}
        title={compact ? 'Suggest a roster for this service' : undefined}
        aria-label={compact ? 'Suggest a roster for this service' : undefined}
      >
        <Sparkles className={compact ? 'size-3.5' : 'size-4'} />
        {!compact && 'Suggest roster'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Suggested roster</DialogTitle>
            <DialogDescription>
              Auto-filled the required spots from your scheduling rules. Tick the
              ones you want, then add them as a draft you can still edit.
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1">
            {suggestions.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 border-b pb-2 text-sm font-medium">
                  <Checkbox
                    id="suggest-select-all"
                    checked={headerState}
                    onCheckedChange={toggleAll}
                    aria-label={allSelected ? 'Deselect all' : 'Select all'}
                  />
                  <label htmlFor="suggest-select-all" className="flex cursor-pointer items-center gap-2">
                    {allSelected ? 'Deselect all' : 'Select all'}
                    <span className="text-muted-foreground font-normal">
                      ({selected.size}/{suggestions.length})
                    </span>
                  </label>
                </div>

                <ul className="space-y-1.5">
                  {suggestions.map((s) => {
                    const key = suggestionKey(s)
                    return (
                      <li key={key} className="flex items-start gap-2 text-sm">
                        <Checkbox
                          id={key}
                          checked={selected.has(key)}
                          onCheckedChange={() => toggle(key)}
                          className="mt-0.5"
                          aria-label={`Accept ${s.personName} for ${s.positionName}`}
                        />
                        <label htmlFor={key} className="min-w-0 cursor-pointer">
                          <span className="font-medium">{s.personName}</span>
                          <span className="text-muted-foreground">
                            {' '}
                            → {s.positionName} · {s.teamName}
                          </span>
                          <span className="text-muted-foreground block text-xs">
                            {s.reason}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {result && result.unfilled.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  Couldn't fill ({result.unfilled.length})
                </p>
                <ul className="space-y-1.5">
                  {result.unfilled.map((u, i) => (
                    <li key={`${u.positionId}-${i}`} className="flex items-start gap-2 text-sm">
                      <CircleSlash className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span className="min-w-0">
                        <span className="font-medium">{u.positionName}</span>
                        <span className="text-muted-foreground"> · {u.teamName}</span>
                        <span className="text-muted-foreground block text-xs">{u.reason}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result && suggestions.length === 0 && result.unfilled.length === 0 && (
              <p className="text-muted-foreground py-4 text-center text-sm">
                {engine.hasMandatory
                  ? 'Every required spot is already filled — nothing to suggest.'
                  : 'No positions have a minimum count yet. Set one on the Teams page (per position) to use auto-scheduling.'}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={engine.apply.isPending}>
              Cancel
            </Button>
            <Button
              onClick={applySelected}
              disabled={engine.apply.isPending || selected.size === 0}
            >
              {engine.apply.isPending && <Loader2 className="size-4 animate-spin" />}
              Add {selected.size} to plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
