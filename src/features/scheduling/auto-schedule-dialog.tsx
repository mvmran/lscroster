import { useState } from 'react'
import { ArrowRight, CircleSlash, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAutoScheduler } from '@/features/scheduling/use-auto-scheduler'
import type { EngineResult } from '@/features/scheduling/auto-scheduler'
import type { PlanWithType } from '@/features/services/use-plans'

/**
 * "Suggest roster" — runs the deterministic auto-scheduler (issue #35) over the
 * plan's unfilled mandatory slots and previews the result before writing it.
 * Applying inserts the suggestions as a `pending` draft the admin can still edit
 * and which still passes through the publish gate.
 */
export function SuggestRosterButton({ plan }: { plan: PlanWithType }) {
  const engine = useAutoScheduler(plan)
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<EngineResult | null>(null)

  function run() {
    setResult(engine.suggest())
    setOpen(true)
  }

  function applyAll() {
    if (!result || result.suggestions.length === 0) return
    const n = result.suggestions.length
    engine.apply.mutate(result.suggestions, {
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
      >
        <Sparkles className="size-4" />
        Suggest roster
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Suggested roster</DialogTitle>
            <DialogDescription>
              Auto-filled the required spots from your scheduling rules. Review,
              then add them as a draft you can still edit.
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1">
            {result && result.suggestions.length > 0 && (
              <ul className="space-y-1.5">
                {result.suggestions.map((s) => (
                  <li
                    key={`${s.positionId}-${s.personId}`}
                    className="flex items-start gap-2 text-sm"
                  >
                    <ArrowRight className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="font-medium">{s.personName}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        → {s.positionName} · {s.teamName}
                      </span>
                      <span className="text-muted-foreground block text-xs">{s.reason}</span>
                    </span>
                  </li>
                ))}
              </ul>
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

            {result && result.suggestions.length === 0 && result.unfilled.length === 0 && (
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
              onClick={applyAll}
              disabled={engine.apply.isPending || !result || result.suggestions.length === 0}
            >
              {engine.apply.isPending && <Loader2 className="size-4 animate-spin" />}
              Add {result?.suggestions.length ?? 0} to plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
