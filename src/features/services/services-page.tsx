import { useMemo, useState } from 'react'
import { CalendarDays, Grid3x3, Plus } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/empty-state'
import { FullPageError } from '@/components/full-page-error'
import { PageHeader } from '@/components/page-header'
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
import { useTeamPermissions } from '@/features/scheduling/use-team-access'
import { NewPlanDialog } from '@/features/services/new-plan-dialog'
import { formatPlanDate } from '@/features/services/service-utils'
import { splitUpcomingPast, usePlans, type PlanWithType } from '@/features/services/use-plans'
import { useServiceTypes } from '@/features/services/use-service-types'

/**
 * `search` carries the active service-type filter into the plan screen as
 * `?type=<id>`, so its Prev/Now/Next walk the same list you were looking at.
 * Empty when "All service types" is selected — then the plan screen steps
 * through every plan in date order.
 */
function PlanList({
  plans,
  emptyText,
  search,
}: {
  plans: PlanWithType[]
  emptyText: string
  search: string
}) {
  if (plans.length === 0) {
    return <EmptyState icon={CalendarDays} title={emptyText} />
  }
  return (
    <div className="flex flex-col gap-2">
      {plans.map((plan) => (
        <Link key={plan.id} to={`/services/plans/${plan.id}${search}`}>
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
  const perms = useTeamPermissions()

  // The service-type filter lives in the URL (`?type=<id>`), not in component
  // state: opening a plan and coming back — with the Back button or the
  // browser's — then returns to the list you were actually looking at. It is
  // also what the plan screen reads to scope its Prev/Now/Next.
  const [searchParams, setSearchParams] = useSearchParams()
  const typeParam = searchParams.get('type')
  // A type that has since been deleted (or a hand-edited URL) falls back to
  // showing everything, rather than an empty list under a blank filter. While
  // the types are still loading, trust the URL so the list doesn't flicker.
  const typeFilter =
    typeParam && (serviceTypes?.some((st) => st.id === typeParam) ?? true)
      ? typeParam
      : 'all'
  const setTypeFilter = (value: string) =>
    // replace: the filter is a view of this page, not a place to go Back to.
    setSearchParams(value === 'all' ? {} : { type: value }, { replace: true })
  const [newPlanOpen, setNewPlanOpen] = useState(false)

  const canManage = me?.role === 'admin' || me?.role === 'leader'
  const isAdmin = me?.role === 'admin'
  // Per-team Team Leaders can roster via the Matrix even as a plain member
  // (issue #111), so the entry button shows for them too.
  const canMatrix = canManage || perms.ledTeamIds.size > 0

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
  // Passed to every plan link so the plan screen can scope its Prev/Now/Next
  // to the same filter (nothing to pass when showing all types).
  const planSearch = typeFilter === 'all' ? '' : `?type=${typeFilter}`

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Services"
        actions={
          (canMatrix || canManage) && (
            <>
              {canMatrix && (
                <Button variant="outline" asChild>
                  <Link to="/services/matrix" title="Roster several services side by side">
                    <Grid3x3 className="size-4" />
                    <span className="hidden sm:inline">Matrix</span>
                  </Link>
                </Button>
              )}
              {canManage && (
                // The span carries the "why is this greyed out" hint: a disabled
                // Button has pointer-events: none, so its own title never shows.
                <span
                  className="inline-flex"
                  title={
                    noServiceTypes
                      ? 'Add a service type under Settings first'
                      : undefined
                  }
                >
                  <Button
                    onClick={() => setNewPlanOpen(true)}
                    disabled={noServiceTypes}
                    title="Plan a new service date"
                  >
                    <Plus className="size-4" />
                    New plan
                  </Button>
                </span>
              )}
            </>
          )
        }
      />

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
              search={planSearch}
              emptyText={
                canManage
                  ? 'No upcoming plans. Create one to start planning.'
                  : 'No upcoming plans published yet.'
              }
            />
          </TabsContent>
          <TabsContent value="past">
            <PlanList plans={past} search={planSearch} emptyText="No past plans." />
          </TabsContent>
        </Tabs>
      )}

      <NewPlanDialog open={newPlanOpen} onOpenChange={setNewPlanOpen} plans={plans ?? []} />
    </div>
  )
}
