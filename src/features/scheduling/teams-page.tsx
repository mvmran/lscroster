import { useState } from 'react'
import { Loader2, Plus, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { FullPageError } from '@/components/full-page-error'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentPerson } from '@/features/auth/use-current-person'
import { useCreateTeam, useTeams } from '@/features/scheduling/use-teams'
import { useServiceTypes } from '@/features/services/use-service-types'

function NewTeamDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createTeam = useCreateTeam()
  const { data: serviceTypes } = useServiceTypes()
  const [name, setName] = useState('')
  const [serviceTypeId, setServiceTypeId] = useState('all')

  async function create() {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await createTeam.mutateAsync({
        name: trimmed,
        service_type_id: serviceTypeId === 'all' ? null : serviceTypeId,
      })
      onOpenChange(false)
      setName('')
      setServiceTypeId('all')
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
            <Label htmlFor="nt-type">Service type</Label>
            <Select value={serviceTypeId} onValueChange={setServiceTypeId}>
              <SelectTrigger id="nt-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All service types</SelectItem>
                {(serviceTypes ?? []).map((st) => (
                  <SelectItem key={st.id} value={st.id}>
                    {st.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Teams tied to a service type only appear on that type's plans.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={createTeam.isPending || !name.trim()}>
            {createTeam.isPending && <Loader2 className="size-4 animate-spin" />}
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
  const { data: me } = useCurrentPerson()
  const [newTeamOpen, setNewTeamOpen] = useState(false)

  const canManage = me?.role === 'admin' || me?.role === 'leader'
  const typeName = (id: string | null) =>
    id ? (serviceTypes?.find((st) => st.id === id)?.name ?? '') : 'All services'

  if (isError) return <FullPageError message={error.message} />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Teams</h1>
        {canManage && (
          <Button onClick={() => setNewTeamOpen(true)}>
            <Plus className="size-4" />
            New team
          </Button>
        )}
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !teams || teams.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
            <UsersRound className="size-8" />
            {canManage
              ? 'No teams yet. Create one to start scheduling people.'
              : 'No teams have been set up yet.'}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {teams.map((team) => (
            <Link key={team.id} to={`/teams/${team.id}`}>
              <Card className="py-3 transition-colors hover:bg-accent/50 active:bg-accent">
                <CardContent className="flex items-center gap-3 px-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{team.name}</p>
                    <p className="text-muted-foreground truncate text-sm">
                      {typeName(team.service_type_id)} ·{' '}
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
