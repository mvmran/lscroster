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
import { Skeleton } from '@/components/ui/skeleton'
import { useTeams } from '@/features/scheduling/use-teams'
import {
  usePersonLedTeams,
  usePersonViewedTeams,
  useTeamLeaderMutations,
  useTeamViewerMutations,
  type TeamGrantWithTeam,
} from '@/features/scheduling/use-team-access'

type GrantKind = 'leader' | 'viewer'

const COPY: Record<
  GrantKind,
  { title: string; description: string; empty: string; add: string }
> = {
  leader: {
    title: 'Team leader of',
    description:
      'Teams this person manages — their positions, members and plan assignments.',
    empty: 'Not a team leader of any team.',
    add: 'Add teams',
  },
  viewer: {
    title: 'Team viewer of',
    description:
      "Teams whose roster this person can view read-only, including drafts. They can't make changes.",
    empty: 'Not a team viewer of any team.',
    add: 'Add teams',
  },
}

/**
 * Pick several teams to grant at once (multi-select), then apply in one go —
 * mirrors the two-step Add-to-team dialog (issue #65) but for access grants.
 */
function AddTeamsDialog({
  personId,
  kind,
  grantedTeamIds,
  onClose,
}: {
  personId: string
  kind: GrantKind
  grantedTeamIds: Set<string>
  onClose: () => void
}) {
  const { data: teams } = useTeams()
  const leaderMutations = useTeamLeaderMutations()
  const viewerMutations = useTeamViewerMutations()
  const { add } = kind === 'leader' ? leaderMutations : viewerMutations
  const [search, setSearch] = useState('')
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
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
        await add.mutateAsync({ teamId, personId })
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
          <DialogTitle>
            Add as team {kind === 'leader' ? 'leader' : 'viewer'}
          </DialogTitle>
          <DialogDescription>
            Tick the teams to grant. You can pick several at once.
          </DialogDescription>
        </DialogHeader>
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
              ? `Add ${selectedTeamIds.length} team${
                  selectedTeamIds.length === 1 ? '' : 's'
                }`
              : 'Add teams'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The teams a person is a Team Leader or Team Viewer of, shown on their profile.
 * Governance (admins + global leaders) can grant several teams at once and revoke
 * with a confirmation. Mirrors the team-page grant cards from the person's side.
 */
export function PersonTeamGrantsCard({
  personId,
  kind,
  canManage,
}: {
  personId: string
  kind: GrantKind
  /** Governance tier — admins + global leaders. */
  canManage: boolean
}) {
  const copy = COPY[kind]
  const ledQuery = usePersonLedTeams(kind === 'leader' ? personId : undefined)
  const viewedQuery = usePersonViewedTeams(kind === 'viewer' ? personId : undefined)
  const query = kind === 'leader' ? ledQuery : viewedQuery
  const grants = query.data

  const leaderMutations = useTeamLeaderMutations()
  const viewerMutations = useTeamViewerMutations()
  const { remove } = kind === 'leader' ? leaderMutations : viewerMutations

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
          {copy.title}
        </CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {query.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : (grants ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">{copy.empty}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {(grants ?? []).map((grant) => (
              <li
                key={grant.id}
                className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5"
              >
                <Link
                  to={`/teams/${grant.team_id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                >
                  {grant.teams.name}
                </Link>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setGrantToRemove(grant)}
                    aria-label={`Remove ${kind === 'leader' ? 'team leader' : 'team viewer'} access to ${grant.teams.name}`}
                    title={`Remove access to ${grant.teams.name}`}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <div>
            <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
              <ShieldCheck className="size-4" />
              {copy.add}
            </Button>
          </div>
        )}
      </CardContent>

      {pickerOpen && (
        <AddTeamsDialog
          personId={personId}
          kind={kind}
          grantedTeamIds={grantedTeamIds}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* Confirm before revoking a grant. */}
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
