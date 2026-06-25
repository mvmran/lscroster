import { useMemo, useState } from 'react'
import { UserPlus, X } from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { fullName } from '@/features/people/person-utils'
import { usePeople } from '@/features/people/use-people'
import {
  useTeamLeaderMutations,
  useTeamLeaders,
  useTeamViewerMutations,
  useTeamViewers,
} from '@/features/scheduling/use-team-access'

type GrantKind = 'leader' | 'viewer'

const COPY: Record<
  GrantKind,
  { title: string; description: string; empty: string; add: string }
> = {
  leader: {
    title: 'Team leaders',
    description:
      'They manage this team — its positions, members and plan assignments. Appointed by admins and leaders.',
    empty: 'No team leaders yet.',
    add: 'Add leader',
  },
  viewer: {
    title: 'Team viewers',
    description:
      "Read-only access to this team's roster on plans, including drafts. They can't make changes.",
    empty: 'No team viewers yet.',
    add: 'Add viewer',
  },
}

/**
 * Manage a team's per-team grants (issue: team access tiers). One card for Team
 * Leaders, one for Team Viewers — both appointed by governance (admins + global
 * leaders) and grantable to any active person.
 */
export function TeamGrantCard({
  teamId,
  kind,
  canManage,
}: {
  teamId: string
  kind: GrantKind
  /** Governance tier — admins + global leaders. */
  canManage: boolean
}) {
  const copy = COPY[kind]
  const leadersQuery = useTeamLeaders(kind === 'leader' ? teamId : undefined)
  const viewersQuery = useTeamViewers(kind === 'viewer' ? teamId : undefined)
  const leaderMutations = useTeamLeaderMutations()
  const viewerMutations = useTeamViewerMutations()

  const query = kind === 'leader' ? leadersQuery : viewersQuery
  const { add, remove } = kind === 'leader' ? leaderMutations : viewerMutations
  const grants = query.data

  const { data: people } = usePeople()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  // Confirm before removing a grant (issue #106).
  const [grantToRemove, setGrantToRemove] = useState<
    NonNullable<typeof grants>[number] | null
  >(null)

  const candidates = useMemo(() => {
    const granted = new Set((grants ?? []).map((g) => g.person_id))
    const term = search.trim().toLowerCase()
    return (people ?? [])
      .filter((p) => p.status === 'active' && !granted.has(p.id))
      .filter((p) => term === '' || fullName(p).toLowerCase().includes(term))
  }, [people, grants, search])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {query.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <ul className="flex flex-col gap-1">
            {(grants ?? []).map((grant) => (
              <li
                key={grant.id}
                className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {fullName(grant.people)}
                </span>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setGrantToRemove(grant)}
                    aria-label={`Remove ${fullName(grant.people)}`}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </li>
            ))}
            {(grants ?? []).length === 0 && (
              <p className="text-muted-foreground px-2 py-1 text-sm">{copy.empty}</p>
            )}
          </ul>
        )}
        {canManage && (
          <div>
            <Button variant="outline" onClick={() => setPickerOpen(true)}>
              <UserPlus className="size-4" />
              {copy.add}
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="flex max-h-[80svh] flex-col sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.add}</DialogTitle>
            <DialogDescription>Pick someone from the directory.</DialogDescription>
          </DialogHeader>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people…"
            autoFocus
          />
          <div className="-mx-2 flex-1 overflow-y-auto px-2">
            {candidates.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No matching people.
              </p>
            ) : (
              <ul className="flex flex-col">
                {candidates.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      disabled={add.isPending}
                      onClick={() =>
                        add.mutate(
                          { teamId, personId: person.id },
                          {
                            onSuccess: () => setPickerOpen(false),
                            onError: (e) => toast.error(e.message),
                          },
                        )
                      }
                      className="hover:bg-accent w-full rounded-md px-2 py-2 text-left text-sm disabled:opacity-50"
                    >
                      {fullName(person)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm before removing a team leader/viewer (issue #106). */}
      <AlertDialog
        open={!!grantToRemove}
        onOpenChange={(open) => !open && setGrantToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {grantToRemove ? fullName(grantToRemove.people) : 'this person'}{' '}
              as {kind === 'leader' ? 'team leader' : 'team viewer'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {kind === 'leader'
                ? "They'll lose the ability to manage this team — its positions, members and plan assignments. You can appoint them again at any time."
                : "They'll lose read-only access to this team's roster. You can grant it again at any time."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!grantToRemove) return
                remove.mutate(
                  { teamId, personId: grantToRemove.person_id },
                  { onError: (e) => toast.error(e.message) },
                )
                setGrantToRemove(null)
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
