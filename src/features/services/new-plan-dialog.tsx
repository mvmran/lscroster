import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  findClashingPlans,
  formatPlanDateShort,
  todayISODate,
  weeklyDates,
  type ClashCandidate,
} from '@/features/services/service-utils'
import { PlanClashDialog } from '@/features/services/plan-clash-dialog'
import { useCreatePlan, type PlanWithType } from '@/features/services/use-plans'
import { usePlanTemplates } from '@/features/services/use-plan-templates'
import { useServiceTypes } from '@/features/services/use-service-types'

/**
 * Create a plan: pick service type + date, optionally starting from a saved
 * template or as a copy of a recent plan of the same service type.
 */
export function NewPlanDialog({
  open,
  onOpenChange,
  plans,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  plans: PlanWithType[]
}) {
  const { data: serviceTypes } = useServiceTypes()
  const { data: templates } = usePlanTemplates()
  const createPlan = useCreatePlan()
  const navigate = useNavigate()

  const [serviceTypeId, setServiceTypeId] = useState<string>('')
  const [date, setDate] = useState(todayISODate())
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('blank')
  // Repeat weekly until this date (issue #72); empty = just the one plan.
  const [repeatUntil, setRepeatUntil] = useState('')
  // Existing services this creation would double up on (issue #78); non-empty
  // opens the warning dialog, where "Create anyway" proceeds.
  const [clashes, setClashes] = useState<ClashCandidate[]>([])

  // The repeat-until date must be later than the plan date when set.
  const repeatInvalid = repeatUntil !== '' && repeatUntil <= date

  const effectiveTypeId = serviceTypeId || serviceTypes?.[0]?.id || ''

  const typeTemplates = useMemo(
    () => (templates ?? []).filter((t) => t.service_type_id === effectiveTypeId),
    [templates, effectiveTypeId],
  )
  const recentPlans = useMemo(
    () =>
      plans
        .filter((p) => p.service_type_id === effectiveTypeId)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 8),
    [plans, effectiveTypeId],
  )

  // One plan at `date`, or weekly plans through the repeat-until date (#72).
  const dates = useMemo(
    () => (repeatUntil ? weeklyDates(date, repeatUntil) : [date]),
    [repeatUntil, date],
  )

  // Try to create; if any date doubles up on an existing service (issue #78),
  // open the warning dialog first instead of creating straight away.
  function attemptCreate() {
    if (!effectiveTypeId || !date || repeatInvalid) return
    const type = serviceTypes?.find((st) => st.id === effectiveTypeId)
    const found = dates.flatMap((planDate) =>
      findClashingPlans(
        {
          date: planDate,
          start: type?.default_start_time ?? null,
          end: type?.end_time ?? null,
        },
        plans,
      ),
    )
    const unique = [...new Map(found.map((p) => [p.id, p])).values()]
    if (unique.length > 0) {
      setClashes(unique)
      return
    }
    void create()
  }

  async function create() {
    if (!effectiveTypeId || !date || repeatInvalid) return
    setClashes([])
    const [kind, id] = source.split(':') as ['template' | 'plan', string] | ['blank', undefined]
    try {
      let firstPlanId: string | null = null
      for (const planDate of dates) {
        const plan = await createPlan.mutateAsync({
          service_type_id: effectiveTypeId,
          date: planDate,
          title: title.trim() || null,
          source: kind !== 'blank' && id ? { kind, id } : undefined,
        })
        firstPlanId ??= plan.id
      }
      if (dates.length > 1) toast.success(`Created ${dates.length} weekly plans`)
      onOpenChange(false)
      navigate(`/services/plans/${firstPlanId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create plan')
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New plan</DialogTitle>
          <DialogDescription>
            A plan is one dated service with its order of service.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="np-type">Service type</Label>
            <Select
              value={effectiveTypeId}
              onValueChange={(v) => {
                setServiceTypeId(v)
                setSource('blank')
              }}
            >
              <SelectTrigger id="np-type" className="w-full">
                <SelectValue placeholder="Choose a service type" />
              </SelectTrigger>
              <SelectContent>
                {(serviceTypes ?? []).map((st) => (
                  <SelectItem key={st.id} value={st.id}>
                    {st.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="np-date">Date</Label>
            <Input
              id="np-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="np-title">Title (optional)</Label>
            <Input
              id="np-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Easter Sunday"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="np-repeat-until">Repeat weekly until (optional)</Label>
            <Input
              id="np-repeat-until"
              type="date"
              value={repeatUntil}
              min={date}
              onChange={(e) => setRepeatUntil(e.target.value)}
              className="w-44"
              aria-invalid={repeatInvalid}
            />
            <p
              className={
                repeatInvalid
                  ? 'text-destructive text-xs'
                  : 'text-muted-foreground text-xs'
              }
            >
              {repeatInvalid
                ? 'The repeat date must be later than the plan date.'
                : repeatUntil
                  ? `Creates ${weeklyDates(date, repeatUntil).length} weekly plans through ${formatPlanDateShort(repeatUntil)}.`
                  : 'Leave blank for a single plan. Pick a future date to create a weekly plan through to it.'}
            </p>
          </div>

          {(typeTemplates.length > 0 || recentPlans.length > 0) && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="np-source">Start from</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger id="np-source" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">Blank plan</SelectItem>
                  {typeTemplates.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Templates</SelectLabel>
                      {typeTemplates.map((t) => (
                        <SelectItem key={t.id} value={`template:${t.id}`}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {recentPlans.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Copy a recent plan</SelectLabel>
                      {recentPlans.map((p) => (
                        <SelectItem key={p.id} value={`plan:${p.id}`}>
                          {formatPlanDateShort(p.date)}
                          {p.title ? ` — ${p.title}` : ''}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={attemptCreate}
            disabled={createPlan.isPending || !effectiveTypeId || !date || repeatInvalid}
          >
            {createPlan.isPending && <Loader2 className="size-4 animate-spin" />}
            Create plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
      <PlanClashDialog
        clashes={clashes}
        pending={createPlan.isPending}
        onConfirm={create}
        onCancel={() => setClashes([])}
      />
    </>
  )
}
