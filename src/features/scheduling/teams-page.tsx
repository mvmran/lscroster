import { useState } from 'react'
import { Loader2, Plus, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { FullPageError } from '@/components/full-page-error'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'
import { ServiceTypePicker } from '@/features/scheduling/service-type-picker'
import { useTeamPermissions } from '@/features/scheduling/use-team-access'
import {
  useCreateTeam,
  useSetTeamServiceTypes,
  useTeams,
  type TeamWithCounts,
} from '@/features/scheduling/use-teams'
import { useServiceTypes } from '@/features/services/use-service-types'

function NewTeamDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createTeam = useCreateTeam()
  const setServiceTypes = useSetTeamServiceTypes()
  const { data: serviceTypes } = useServiceTypes()
  const [name, setName] = useState('')
  const [serviceTypeIds, setServiceTypeIds] = useState<string[]>([])

  const pending = createTeam.isPending || setServiceTypes.isPending

  function toggleType(id: string) {
    setServiceTypeIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    )
  }

  async function create() {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      const team = await createTeam.mutateAsync({ name: trimmed })
      await setServiceTypes.mutateAsync({ teamId: team.id, serviceTypeIds })
      onOpenChange(false)
      setName('')
      setServiceTypeIds([])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create team')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New team</DialogTitle>
          <DialogDescription>
            A team groups the positions people get scheduled into.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nt-name">Name</Label>
            <Input
              id="nt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Worship team"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Service types</Label>
            <ServiceTypePicker
              serviceTypes={serviceTypes}
              selectedIds={serviceTypeIds}
              onToggle={toggleType}
            />
            <p className="text-muted-foreground text-xs">
              Pick the service types this team serves. Leave all unticked and the
              team appears on every service type's plans.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={pending || !name.trim()}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Create team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TeamsPage() {
  const { data: teams, isPending, isError, error } = useTeams()
  const { data: serviceTypes } = useServiceTypes()
  const { canGovern } = useTeamPermissions()
  const [newTeamOpen, setNewTeamOpen] = useState(false)

  const canManage = canGovern
  const typeLabel = (team: TeamWithCounts) => {
    if (team.service_type_teams.length === 0) return 'All services'
    const names = team.service_type_teams
      .map((st) => serviceTypes?.find((s) => s.id === st.service_type_id)?.name)
      .filter((n): n is string => !!n)
      .sort((a, b) => a.localeCompare(b))
    return names.join(', ') || 'All services'
  }

  if (isError) return <FullPageError message={error.message} />

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Teams"
        actions={
          canManage && (
            <Button onClick={() => setNewTeamOpen(true)}>
              <Plus className="size-4" />
              New team
            </Button>
          )
        }
      />

      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !teams || teams.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={
            canManage
              ? 'No teams yet. Create one to start scheduling people.'
              : 'No teams have been set up yet.'
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {teams.map((team) => (
            <Link key={team.id} to={`/teams/${team.id}`}>
              <Card className="py-3 transition-colors hover:bg-accent/50 active:bg-accent">
                <CardContent className="flex items-center gap-3 px-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{team.name}</p>
                    <p className="text-muted-foreground truncate text-sm">
                      {typeLabel(team)} ·{' '}
                      {team.team_members[0]?.count ?? 0} member
                      {(team.team_members[0]?.count ?? 0) === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {team.positions[0]?.count ?? 0} position
                    {(team.positions[0]?.count ?? 0) === 1 ? '' : 's'}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <NewTeamDialog open={newTeamOpen} onOpenChange={setNewTeamOpen} />
    </div>
  )
}
