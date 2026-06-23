import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Loader2, Mail, Search } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fullName } from '@/features/people/person-utils'
import {
  useBulkSendRequests,
  type AssignmentWithPerson,
  type BulkSendGroup,
} from '@/features/scheduling/use-assignments'
import type { TeamWithCounts } from '@/features/scheduling/use-teams'
import type { PlanWithType } from '@/features/services/use-plans'

type Mode = 'team' | 'member'

/** An assignment that is scheduled but not yet emailed (the bulk-email target). */
function isOutstanding(a: AssignmentWithPerson): boolean {
  return a.status === 'pending' && a.notified_at === null
}

/** A choosable team or member, with how many outstanding emails it covers. */
interface PickItem {
  id: string
  label: string
  count: number
}

/**
 * Bulk-email dialog for the Matrix: pick which of the displayed services to email,
 * then narrow the recipients by team or by member, and send the outstanding
 * scheduling-request emails (assigned people who haven't been emailed yet) in one
 * action. Only services with at least one outstanding email are listed.
 */
export function BulkEmailButton({
  plans,
  assignmentsByPlan,
  teams,
}: {
  /** The services currently displayed in the Matrix window. */
  plans: PlanWithType[]
  assignmentsByPlan: Record<string, AssignmentWithPerson[]>
  teams: TeamWithCounts[]
}) {
  const [open, setOpen] = useState(false)
  const bulkSend = useBulkSendRequests()

  // Services with ≥1 outstanding email, oldest → newest as shown in the Matrix.
  const eligiblePlans = useMemo(
    () =>
      plans.filter((p) =>
        (assignmentsByPlan[p.id] ?? []).some(isOutstanding),
      ),
    [plans, assignmentsByPlan],
  )

  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<Mode>('team')
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set())
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const teamNameById = useMemo(
    () => new Map(teams.map((t) => [t.id, t.name])),
    [teams],
  )

  function openDialog() {
    // Default to every eligible service selected — narrowing is the exception.
    setSelectedPlanIds(new Set(eligiblePlans.map((p) => p.id)))
    setMode('team')
    setSelectedTeamIds(new Set())
    setSelectedMemberIds(new Set())
    setSearch('')
    setOpen(true)
  }

  // Outstanding assignments across the chosen services (drives the picker + send).
  const outstanding = useMemo(() => {
    const rows: AssignmentWithPerson[] = []
    for (const id of selectedPlanIds) {
      for (const a of assignmentsByPlan[id] ?? []) {
        if (isOutstanding(a)) rows.push(a)
      }
    }
    return rows
  }, [selectedPlanIds, assignmentsByPlan])

  // Pick list for the current mode: teams or members appearing in `outstanding`,
  // with a count of how many emails each covers.
  const pickItems = useMemo<PickItem[]>(() => {
    const counts = new Map<string, { label: string; count: number }>()
    for (const a of outstanding) {
      if (mode === 'team') {
        const label = teamNameById.get(a.team_id) ?? 'Team'
        const cur = counts.get(a.team_id)
        counts.set(a.team_id, { label, count: (cur?.count ?? 0) + 1 })
      } else {
        const label = fullName(a.people)
        const cur = counts.get(a.person_id)
        counts.set(a.person_id, { label, count: (cur?.count ?? 0) + 1 })
      }
    }
    return [...counts.entries()]
      .map(([id, v]) => ({ id, label: v.label, count: v.count }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [outstanding, mode, teamNameById])

  const selectedIds = mode === 'team' ? selectedTeamIds : selectedMemberIds
  const setSelectedIds = mode === 'team' ? setSelectedTeamIds : setSelectedMemberIds

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? pickItems.filter((i) => i.label.toLowerCase().includes(q)) : pickItems
  }, [pickItems, search])

  function togglePlan(id: string) {
    setSelectedPlanIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllPlans() {
    setSelectedPlanIds((prev) =>
      prev.size === eligiblePlans.length
        ? new Set()
        : new Set(eligiblePlans.map((p) => p.id)),
    )
  }

  function togglePick(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // The emails that will actually go out, grouped per plan for the Edge Function.
  const sendGroups = useMemo<BulkSendGroup[]>(() => {
    const groups: BulkSendGroup[] = []
    for (const id of selectedPlanIds) {
      const ids = (assignmentsByPlan[id] ?? [])
        .filter(isOutstanding)
        .filter((a) =>
          mode === 'team'
            ? selectedTeamIds.has(a.team_id)
            : selectedMemberIds.has(a.person_id),
        )
        .map((a) => a.id)
      if (ids.length > 0) groups.push({ planId: id, assignmentIds: ids })
    }
    return groups
  }, [selectedPlanIds, assignmentsByPlan, mode, selectedTeamIds, selectedMemberIds])

  const totalToSend = sendGroups.reduce((n, g) => n + g.assignmentIds.length, 0)

  function send() {
    if (totalToSend === 0) return
    bulkSend.mutate(sendGroups, {
      onSuccess: (result) => {
        if (result.sent > 0) {
          toast.success(
            `Sent ${result.sent} ${result.sent === 1 ? 'email' : 'emails'}`,
          )
        }
        for (const skip of result.skipped) {
          toast.warning(`${skip.name}: ${skip.reason}`)
        }
        if (result.sent === 0 && result.skipped.length === 0) {
          toast.info('Nothing to send')
        }
        setOpen(false)
      },
      onError: (e) => toast.error(e.message),
    })
  }

  const allPlansSelected =
    eligiblePlans.length > 0 && selectedPlanIds.size === eligiblePlans.length

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={openDialog}
        disabled={eligiblePlans.length === 0}
        title={
          eligiblePlans.length === 0
            ? 'No outstanding request emails in the displayed services'
            : undefined
        }
      >
        <Mail className="size-4" />
        Bulk email
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk email requests</DialogTitle>
            <DialogDescription>
              Send scheduling-request emails to people who are rostered but
              haven't been emailed yet, across the services you choose.
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1">
            {/* 1–2: choose services. */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 border-b pb-2 text-sm font-medium">
                <Checkbox
                  id="bulk-all-services"
                  checked={
                    allPlansSelected
                      ? true
                      : selectedPlanIds.size > 0
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={toggleAllPlans}
                  aria-label={allPlansSelected ? 'Deselect all services' : 'Select all services'}
                />
                <label htmlFor="bulk-all-services" className="cursor-pointer">
                  Services{' '}
                  <span className="text-muted-foreground font-normal">
                    ({selectedPlanIds.size}/{eligiblePlans.length})
                  </span>
                </label>
              </div>
              <ul className="space-y-1.5">
                {eligiblePlans.map((plan) => {
                  const count = (assignmentsByPlan[plan.id] ?? []).filter(
                    isOutstanding,
                  ).length
                  return (
                    <li key={plan.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        id={`bulk-plan-${plan.id}`}
                        checked={selectedPlanIds.has(plan.id)}
                        onCheckedChange={() => togglePlan(plan.id)}
                      />
                      <label
                        htmlFor={`bulk-plan-${plan.id}`}
                        className="flex min-w-0 cursor-pointer items-center gap-1.5"
                      >
                        <span className="font-medium">
                          {format(parseISO(plan.date), 'EEE d MMM')}
                        </span>
                        <span className="text-muted-foreground truncate">
                          {plan.service_types.name}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-xs">
                          · {count} to send
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>

            {/* 3: team vs member. */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Filter by</span>
              <Select
                value={mode}
                onValueChange={(v) => {
                  setMode(v as Mode)
                  setSearch('')
                }}
              >
                <SelectTrigger className="w-36" aria-label="Filter recipients by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="team">Team</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 4: searchable multi-select of teams or members. */}
            <div className="space-y-1.5">
              <div className="relative">
                <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={mode === 'team' ? 'Search teams…' : 'Search members…'}
                  className="pl-8"
                  aria-label={mode === 'team' ? 'Search teams' : 'Search members'}
                />
              </div>
              <ul className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-1">
                {filteredItems.length === 0 ? (
                  <li className="text-muted-foreground px-2 py-3 text-center text-sm">
                    {pickItems.length === 0
                      ? 'Select a service above first.'
                      : 'No matches.'}
                  </li>
                ) : (
                  filteredItems.map((item) => {
                    const cid = `bulk-pick-${item.id}`
                    return (
                      <li key={item.id} className="flex items-center gap-2 px-1 py-0.5 text-sm">
                        <Checkbox
                          id={cid}
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={() => togglePick(item.id)}
                        />
                        <label
                          htmlFor={cid}
                          className="flex flex-1 cursor-pointer items-center justify-between gap-2"
                        >
                          <span className="truncate">{item.label}</span>
                          <span className="text-muted-foreground shrink-0 text-xs">
                            {item.count}
                          </span>
                        </label>
                      </li>
                    )
                  })
                )}
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={bulkSend.isPending}
            >
              Cancel
            </Button>
            <Button onClick={send} disabled={bulkSend.isPending || totalToSend === 0}>
              {bulkSend.isPending && <Loader2 className="size-4 animate-spin" />}
              {totalToSend > 0
                ? `Send ${totalToSend} ${totalToSend === 1 ? 'email' : 'emails'}`
                : 'Send emails'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
