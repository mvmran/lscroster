import { useMemo, useState } from 'react'
import { CalendarDays, Plus, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { FullPageError } from '@/components/full-page-error'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { NewPlanDialog } from '@/features/services/new-plan-dialog'
import { formatPlanDate } from '@/features/services/service-utils'
import { splitUpcomingPast, usePlans, type PlanWithType } from '@/features/services/use-plans'
import { useServiceTypes } from '@/features/services/use-service-types'

function PlanList({ plans, emptyText }: { plans: PlanWithType[]; emptyText: string }) {
  if (plans.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
          <CalendarDays className="size-8" />
          {emptyText}
        </CardContent>
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {plans.map((plan) => (
        <Link key={plan.id} to={`/services/plans/${plan.id}`}>
          <Card className="py-3 transition-colors hover:bg-accent/50 active:bg-accent">
            <CardContent className="flex items-center gap-3 px-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{formatPlanDate(plan.date)}</span>
                  {plan.status === 'draft' && <Badge variant="outline">Draft</Badge>}
                </div>
                <p className="text-muted-foreground truncate text-sm">
                  {plan.service_types.name}
                  {plan.title ? ` — ${plan.title}` : ''}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}

export function ServicesPage() {
  const { data: plans, isPending, isError, error } = usePlans()
  const { data: serviceTypes } = useServiceTypes()
  const { data: me } = useCurrentPerson()

  const [typeFilter, setTypeFilter] = useState('all')
  const [newPlanOpen, setNewPlanOpen] = useState(false)

  const canManage = me?.role === 'admin' || me?.role === 'leader'
  const isAdmin = me?.role === 'admin'

  const filtered = useMemo(
    () =>
      (plans ?? []).filter(
        (p) => typeFilter === 'all' || p.service_type_id === typeFilter,
      ),
    [plans, typeFilter],
  )
  const { upcoming, past } = useMemo(() => splitUpcomingPast(filtered), [filtered])

  if (isError) return <FullPageError message={error.message} />

  const noServiceTypes = serviceTypes !== undefined && serviceTypes.length === 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Services</h1>
        {canManage && (
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="outline" asChild>
                <Link to="/settings/service-types">
                  <Settings2 className="size-4" />
                  <span className="hidden sm:inline">Service types</span>
                </Link>
              </Button>
            )}
            <Button onClick={() => setNewPlanOpen(true)} disabled={noServiceTypes}>
              <Plus className="size-4" />
              New plan
            </Button>
          </div>
        )}
      </div>

      {noServiceTypes && (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            {isAdmin ? (
              <>
                Create a service type first (e.g. “Sunday 10am”) under{' '}
                <Link to="/settings/service-types" className="text-foreground underline">
                  Settings → Service types
                </Link>
                , then plan your first service.
              </>
            ) : (
              'No services have been set up yet.'
            )}
          </CardContent>
        </Card>
      )}

      {serviceTypes && serviceTypes.length > 1 && (
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-56" aria-label="Filter by service type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All service types</SelectItem>
            {serviceTypes.map((st) => (
              <SelectItem key={st.id} value={st.id}>
                {st.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="upcoming">
          <TabsList>
            <TabsTrigger value="upcoming" className="px-4">
              Upcoming{upcoming.length > 0 ? ` (${upcoming.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="past" className="px-4">
              Past
            </TabsTrigger>
          </TabsList>
          <TabsContent value="upcoming">
            <PlanList
              plans={upcoming}
              emptyText={
                canManage
                  ? 'No upcoming plans. Create one to start planning.'
                  : 'No upcoming plans published yet.'
              }
            />
          </TabsContent>
          <TabsContent value="past">
            <PlanList plans={past} emptyText="No past plans." />
          </TabsContent>
        </Tabs>
      )}

      <NewPlanDialog open={newPlanOpen} onOpenChange={setNewPlanOpen} plans={plans ?? []} />
    </div>
  )
}
