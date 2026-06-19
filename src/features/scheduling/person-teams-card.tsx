import { useMemo, useState } from 'react'
import { ArrowLeft, Loader2, UserPlus, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { PositionLevelPill } from '@/features/scheduling/position-level-pill'
import { otherProficiency } from '@/features/scheduling/scheduling-utils'
import {
  useMembershipMutations,
  useMembershipsOf,
  usePositions,
  useTeams,
  type MembershipWithTeam,
  type TeamWithCounts,
} from '@/features/scheduling/use-teams'

/**
 * Add the person to a team in two steps (issue #65): pick a team, then tick the
 * positions they can fill — added in one go instead of one position at a time.
 */
function AddToTeamDialog({
  personId,
  availableTeams,
  onClose,
}: {
  personId: string
  availableTeams: TeamWithCounts[]
  onClose: () => void
}) {
  const { add, addPosition } = useMembershipMutations()
  const [team, setTeam] = useState<TeamWithCounts | null>(null)
  const [selectedPositionIds, setSelectedPositionIds] = useState<string[]>([])
  const { data: positions, isPending: positionsPending } = usePositions(team?.id)

  const saving = add.isPending || addPosition.isPending

  function toggle(positionId: string) {
    setSelectedPositionIds((prev) =>
      prev.includes(positionId)
        ? prev.filter((id) => id !== positionId)
        : [...prev, positionId],
    )
  }

  async function confirm() {
    if (!team) return
    try {
      const membership = await add.mutateAsync({
        team_id: team.id,
        person_id: personId,
      })
      for (const positionId of selectedPositionIds) {
        await addPosition.mutateAsync({ member: membership, positionId })
      }
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add to team')
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[80svh] flex-col sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{team ? `Positions in ${team.name}` : 'Add to team'}</DialogTitle>
          <DialogDescription>
            {team
              ? 'Tick the positions this person can fill. You can change these later.'
              : 'Pick which team this person should join.'}
          </DialogDescription>
        </DialogHeader>

        {!team ? (
          <ul className="-mx-2 flex flex-col overflow-y-auto px-2">
            {availableTeams.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    setTeam(t)
                    setSelectedPositionIds([])
                  }}
                  className="hover:bg-accent w-full rounded-md px-2 py-2 text-left text-sm"
                >
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="-mx-1 flex flex-col gap-0.5 overflow-y-auto px-1">
            {positionsPending ? (
              <Skeleton className="h-10 w-full" />
            ) : (positions ?? []).length === 0 ? (
              <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
                This team has no positions yet — add the person now and set
                positions later from the team page.
              </p>
            ) : (
              (positions ?? []).map((p) => (
                <div
                  key={p.id}
                  className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5"
                >
                  <Checkbox
                    id={`add-pos-${p.id}`}
                    checked={selectedPositionIds.includes(p.id)}
                    onCheckedChange={() => toggle(p.id)}
                  />
                  <label htmlFor={`add-pos-${p.id}`} className="flex-1 text-sm">
                    {p.name}
                  </label>
                </div>
              ))
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {team ? (
            <Button variant="ghost" onClick={() => setTeam(null)} disabled={saving}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
          ) : (
            <span />
          )}
          {team && (
            <Button onClick={confirm} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {selectedPositionIds.length > 0
                ? `Add with ${selectedPositionIds.length} position${
                    selectedPositionIds.length === 1 ? '' : 's'
                  }`
                : 'Add to team'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
  const { remove, setProficiency } = useMembershipMutations()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [membershipToRemove, setMembershipToRemove] =
    useState<MembershipWithTeam | null>(null)

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
                        onClick={() => setMembershipToRemove(membership)}
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

      {pickerOpen && (
        <AddToTeamDialog
          personId={personId}
          availableTeams={availableTeams}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* Confirm before removing the person from a team (issue #64). */}
      <AlertDialog
        open={!!membershipToRemove}
        onOpenChange={(open) => !open && setMembershipToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove from {membershipToRemove?.teams.name ?? 'this team'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This person will be taken off the team and its positions. Existing
              assignments on published plans aren't changed. You can add them
              back at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!membershipToRemove) return
                remove.mutate(membershipToRemove, {
                  onError: (e) => toast.error(e.message),
                })
                setMembershipToRemove(null)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
