import { useMemo, useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { PositionLevelPill } from '@/features/scheduling/position-level-pill'
import { otherProficiency } from '@/features/scheduling/scheduling-utils'
import {
  useMembershipMutations,
  useMembershipsOf,
  useTeams,
} from '@/features/scheduling/use-teams'

/** Team memberships on the person profile; leaders can add/remove. */
export function PersonTeamsCard({
  personId,
  canManage,
}: {
  personId: string
  canManage: boolean
}) {
  const { data: memberships, isPending } = useMembershipsOf(personId)
  const { data: teams } = useTeams()
  const { add, remove, setProficiency } = useMembershipMutations()
  const [pickerOpen, setPickerOpen] = useState(false)

  const availableTeams = useMemo(() => {
    const memberOf = new Set((memberships ?? []).map((m) => m.team_id))
    return (teams ?? []).filter((t) => !memberOf.has(t.id))
  }, [teams, memberships])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Teams</CardTitle>
        <CardDescription>Teams this person can be scheduled onto.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : (memberships ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">Not on any teams.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {(memberships ?? []).map((membership) => {
              const positions = [...membership.team_member_positions].sort((a, b) =>
                a.positions.name.localeCompare(b.positions.name),
              )
              return (
                <li
                  key={membership.id}
                  className="hover:bg-accent/40 flex flex-col gap-1 rounded-md px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/teams/${membership.team_id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                    >
                      {membership.teams.name}
                    </Link>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() =>
                          remove.mutate(membership, {
                            onError: (e) => toast.error(e.message),
                          })
                        }
                        aria-label={`Remove from ${membership.teams.name}`}
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                  {positions.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {positions.map((tp) => (
                        <PositionLevelPill
                          key={tp.position_id}
                          name={tp.positions.name}
                          proficiency={tp.proficiency}
                          canManage={canManage}
                          disabled={setProficiency.isPending}
                          onToggle={() =>
                            setProficiency.mutate(
                              {
                                member: membership,
                                positionId: tp.position_id,
                                proficiency: otherProficiency(tp.proficiency),
                              },
                              { onError: (e) => toast.error(e.message) },
                            )
                          }
                        />
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {canManage && availableTeams.length > 0 && (
          <div>
            <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
              <UserPlus className="size-4" />
              Add to team
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add to team</DialogTitle>
            <DialogDescription>
              Pick which team this person should join.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col">
            {availableTeams.map((team) => (
              <li key={team.id}>
                <button
                  type="button"
                  disabled={add.isPending}
                  onClick={() =>
                    add.mutate(
                      { team_id: team.id, person_id: personId },
                      {
                        onSuccess: () => setPickerOpen(false),
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                  className="hover:bg-accent w-full rounded-md px-2 py-2 text-left text-sm disabled:opacity-50"
                >
                  {team.name}
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
