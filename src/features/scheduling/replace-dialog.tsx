import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  PROFICIENCY_BADGE_CLASSES,
  PROFICIENCY_LABELS,
  type Position,
  type Team,
} from '@/features/scheduling/scheduling-utils'
import { useReplaceAssignment } from '@/features/scheduling/use-assignments'
import { useAutoScheduler } from '@/features/scheduling/use-auto-scheduler'
import type { PlanWithType } from '@/features/services/use-plans'

export interface ReplaceTarget {
  assignmentId: string
  personId: string
  personName: string
  team: Team
  position: Position
  /** True when the person declined — shows the reason + frames it as re-suggest. */
  declined?: boolean
  declineReason?: string | null
}

/**
 * Engine-ranked "replace" / decline re-suggestion (issues #36, #37). Lists the
 * eligible, rule-passing substitutes for the slot — best first, the top one
 * flagged "Suggested" — each with a short why and their workload this month, so
 * the leader swaps with the balance in view. Picking inserts the replacement as
 * a pending request (the existing accept/decline email loop takes it from there).
 */
export function ReplaceDialog({
  plan,
  target,
  onClose,
}: {
  plan: PlanWithType
  target: ReplaceTarget | null
  onClose: () => void
}) {
  const engine = useAutoScheduler(plan)
  const replace = useReplaceAssignment(plan.id)

  const ranked = target ? engine.rank(target.position.id, [target.personId]) : []

  function pick(personId: string) {
    if (!target) return
    replace.mutate(
      {
        oldAssignmentId: target.assignmentId,
        values: {
          person_id: personId,
          team_id: target.team.id,
          position_id: target.position.id,
        },
      },
      {
        onSuccess: () => {
          toast.success('Replacement scheduled — send them the request')
          onClose()
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[80svh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {target?.declined ? 'Find a replacement' : 'Replace person'}
          </DialogTitle>
          <DialogDescription>
            {target ? (
              <>
                {target.position.name} · {target.team.name}
                {target.declined && (
                  <>
                    {' — '}
                    {target.personName} declined
                    {target.declineReason ? ` (“${target.declineReason}”)` : ''}
                  </>
                )}
              </>
            ) : (
              ''
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          {engine.isPending ? (
            <p className="text-muted-foreground py-6 text-center text-sm">Loading…</p>
          ) : ranked.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No available substitutes — everyone set up for this position is
              unavailable, already serving, or over their limit.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {ranked.map((c, i) => (
                <li key={c.personId}>
                  <button
                    type="button"
                    disabled={replace.isPending}
                    onClick={() => pick(c.personId)}
                    className="hover:bg-accent flex w-full items-start gap-2 rounded-md px-2 py-2 text-left disabled:opacity-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium">{c.personName}</span>
                        {i === 0 && (
                          <Badge
                            variant="outline"
                            className="border-primary/40 text-primary shrink-0"
                          >
                            <Sparkles className="size-3" />
                            Suggested
                          </Badge>
                        )}
                        {c.level === 'trainee' && (
                          <Badge
                            variant="outline"
                            className={`shrink-0 ${PROFICIENCY_BADGE_CLASSES.trainee}`}
                          >
                            {PROFICIENCY_LABELS.trainee}
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground text-xs">{c.reason}</p>
                    </div>
                    <span className="text-muted-foreground shrink-0 pt-0.5 text-xs">
                      {c.monthCount} this month
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
