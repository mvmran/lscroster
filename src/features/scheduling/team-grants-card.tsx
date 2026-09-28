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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { fullName } from '@/features/people/person-utils'
import { usePeople } from '@/features/people/use-people'
import {
  TEAM_ACCESS_HELP,
  TEAM_ACCESS_LABELS,
  TEAM_ACCESS_ORDER,
  useTeamGrantMutations,
  useTeamGrants,
  type TeamAccess,
  type TeamGrantWithPerson,
} from '@/features/scheduling/use-team-access'

/** Grant one person access to this team at a chosen level. */
function AddPersonDialog({
  teamId,
  grantedPersonIds,
  onClose,
}: {
  teamId: string
  grantedPersonIds: Set<string>
  onClose: () => void
}) {
  const { data: people } = usePeople()
  const { setAccess } = useTeamGrantMutations()
  const [search, setSearch] = useState('')
  const [access, setLevel] = useState<TeamAccess>('scheduler')

  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (people ?? [])
      .filter((p) => p.status === 'active' && !grantedPersonIds.has(p.id))
      .filter((p) => term === '' || fullName(p).toLowerCase().includes(term))
  }, [people, grantedPersonIds, search])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[80svh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add team access</DialogTitle>
          <DialogDescription>Pick someone and the level to grant.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Level</span>
          <Select value={access} onValueChange={(v) => setLevel(v as TeamAccess)}>
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEAM_ACCESS_ORDER.map((level) => (
                <SelectItem key={level} value={level}>
                  {TEAM_ACCESS_LABELS[level]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-muted-foreground text-xs">{TEAM_ACCESS_HELP[access]}</p>
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
                    disabled={setAccess.isPending}
                    onClick={() =>
                      setAccess.mutate(
                        { teamId, personId: person.id, access },
                        {
                          onSuccess: () => onClose(),
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
  )
}

/**
 * A team's access list: each person with a level dropdown (Viewer / Scheduler /
 * Manager). Appointed by governance (admins + coordinators) and grantable to any
 * active person. The person-page Team Access card is the same list per person.
 */
export function TeamAccessCard({
  teamId,
  canManage,
}: {
  teamId: string
  /** Governance tier — admins + coordinators. */
  canManage: boolean
}) {
  const query = useTeamGrants(teamId)
  const grants = query.data
  const { setAccess, remove } = useTeamGrantMutations()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [grantToRemove, setGrantToRemove] = useState<TeamGrantWithPerson | null>(null)

  const grantedPersonIds = useMemo(
    () => new Set((grants ?? []).map((g) => g.person_id)),
    [grants],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team access</CardTitle>
        <CardDescription>
          Who can view, schedule or manage this team. Appointed by admins and
          coordinators.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {query.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <ul className="flex flex-col gap-1">
            {(grants ?? []).map((grant) => (
              <li
                key={grant.person_id}
                className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {fullName(grant.people)}
                </span>
                {canManage ? (
                  <>
                    <Select
                      value={grant.access}
                      onValueChange={(v) =>
                        setAccess.mutate(
                          { teamId, personId: grant.person_id, access: v as TeamAccess },
                          { onError: (e) => toast.error(e.message) },
                        )
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-32"
                        aria-label={`Access level for ${fullName(grant.people)}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEAM_ACCESS_ORDER.map((level) => (
                          <SelectItem key={level} value={level}>
                            {TEAM_ACCESS_LABELS[level]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setGrantToRemove(grant)}
                      aria-label={`Remove ${fullName(grant.people)}`}
                      title={`Remove this access for ${fullName(grant.people)}`}
                    >
                      <X className="size-4" />
                    </Button>
                  </>
                ) : (
                  <span className="text-muted-foreground text-sm">
                    {TEAM_ACCESS_LABELS[grant.access]}
                  </span>
                )}
              </li>
            ))}
            {(grants ?? []).length === 0 && (
              <p className="text-muted-foreground px-2 py-1 text-sm">
                No team access granted yet.
              </p>
            )}
          </ul>
        )}
        {canManage && (
          <div>
            <Button variant="outline" onClick={() => setPickerOpen(true)}>
              <UserPlus className="size-4" />
              Add person
            </Button>
          </div>
        )}
      </CardContent>

      {pickerOpen && (
        <AddPersonDialog
          teamId={teamId}
          grantedPersonIds={grantedPersonIds}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <AlertDialog
        open={!!grantToRemove}
        onOpenChange={(open) => !open && setGrantToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {grantToRemove ? fullName(grantToRemove.people) : 'this person'} from
              this team's access?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They'll lose all access to this team. You can grant it again at any time.
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
