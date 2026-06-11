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
import { formatPlanDateShort, todayISODate } from '@/features/services/service-utils'
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

  async function create() {
    if (!effectiveTypeId || !date) return
    const [kind, id] = source.split(':') as ['template' | 'plan', string] | ['blank', undefined]
    try {
      const plan = await createPlan.mutateAsync({
        service_type_id: effectiveTypeId,
        date,
        title: title.trim() || null,
        source: kind !== 'blank' && id ? { kind, id } : undefined,
      })
      onOpenChange(false)
      navigate(`/services/plans/${plan.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create plan')
    }
  }

  return (
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
          <Button onClick={create} disabled={createPlan.isPending || !effectiveTypeId || !date}>
            {createPlan.isPending && <Loader2 className="size-4 animate-spin" />}
            Create plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
