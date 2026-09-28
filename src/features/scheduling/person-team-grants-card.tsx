import { useMemo, useState } from 'react'
import { Loader2, ShieldCheck, X } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useTeams } from '@/features/scheduling/use-teams'
import {
  TEAM_ACCESS_HELP,
  TEAM_ACCESS_LABELS,
  TEAM_ACCESS_ORDER,
  useTeamGrantMutations,
  usePersonTeamGrants,
  type TeamAccess,
  type TeamGrantWithTeam,
} from '@/features/scheduling/use-team-access'

/** Pick several teams to grant at one level, then apply in one go. */
function AddTeamsDialog({
  personId,
  grantedTeamIds,
  onClose,
}: {
  personId: string
  grantedTeamIds: Set<string>
  onClose: () => void
}) {
  const { data: teams } = useTeams()
  const { setAccess } = useTeamGrantMutations()
  const [search, setSearch] = useState('')
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [access, setLevel] = useState<TeamAccess>('scheduler')
  const [saving, setSaving] = useState(false)

  const available = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (teams ?? [])
      .filter((t) => !grantedTeamIds.has(t.id))
      .filter((t) => term === '' || t.name.toLowerCase().includes(term))
  }, [teams, grantedTeamIds, search])

  function toggle(teamId: string) {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId],
    )
  }

  async function confirm() {
    if (selectedTeamIds.length === 0) return
    setSaving(true)
    try {
      for (const teamId of selectedTeamIds) {
        await setAccess.mutateAsync({ teamId, personId, access })
      }
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not grant access')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[80svh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add team access</DialogTitle>
          <DialogDescription>
            Pick the teams and the level to grant. You can change the level per team
            afterwards.
          </DialogDescription>
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
          placeholder="Search teams…"
          autoFocus
        />
        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          {available.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No more teams to add.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {available.map((t) => (
                <li
                  key={t.id}
                  className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5"
                >
                  <Checkbox
                    id={`grant-team-${t.id}`}
                    checked={selectedTeamIds.includes(t.id)}
                    onCheckedChange={() => toggle(t.id)}
                  />
                  <label htmlFor={`grant-team-${t.id}`} className="flex-1 text-sm">
                    {t.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button onClick={confirm} disabled={saving || selectedTeamIds.length === 0}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {selectedTeamIds.length > 0
              ? `Add ${selectedTeamIds.length} team${selectedTeamIds.length === 1 ? '' : 's'}`
              : 'Add teams'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * A person's per-team access, one row per team with a level dropdown
 * (Viewer / Scheduler / Manager). Governance (admins + coordinators) grant and
 * change it; the person and anyone managing them (issue #89) see it read-only.
 * Together with the Permissions card this defines what a member can do.
 */
export function PersonTeamAccessCard({
  personId,
  canManage,
}: {
  personId: string
  /** Governance tier — admins + coordinators. */
  canManage: boolean
}) {
  const query = usePersonTeamGrants(personId)
  const grants = query.data
  const { setAccess, remove } = useTeamGrantMutations()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [grantToRemove, setGrantToRemove] = useState<TeamGrantWithTeam | null>(null)

  const grantedTeamIds = useMemo(
    () => new Set((grants ?? []).map((g) => g.team_id)),
    [grants],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="text-muted-foreground size-4" />
          Team access
        </CardTitle>
        <CardDescription>
          What this person can do on each team — view, schedule, or manage.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {query.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : (grants ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">No team access yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {(grants ?? []).map((grant) => (
              <li
                key={grant.team_id}
                className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5"
              >
                <Link
                  to={`/teams/${grant.team_id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                >
                  {grant.teams.name}
                </Link>
                {canManage ? (
                  <>
                    <Select
                      value={grant.access}
                      onValueChange={(v) =>
                        setAccess.mutate(
                          { teamId: grant.team_id, personId, access: v as TeamAccess },
                          { onError: (e) => toast.error(e.message) },
                        )
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-32"
                        aria-label={`Access level for ${grant.teams.name}`}
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
                      aria-label={`Remove access to ${grant.teams.name}`}
                      title={`Remove access to ${grant.teams.name}`}
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
          </ul>
        )}
        {canManage && (
          <div>
            <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
              <ShieldCheck className="size-4" />
              Add teams
            </Button>
          </div>
        )}
      </CardContent>

      {pickerOpen && (
        <AddTeamsDialog
          personId={personId}
          grantedTeamIds={grantedTeamIds}
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
              Remove access to {grantToRemove?.teams.name ?? 'this team'}?
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
                  { teamId: grantToRemove.team_id, personId },
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
