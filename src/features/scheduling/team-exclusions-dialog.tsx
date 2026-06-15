import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTeams } from '@/features/scheduling/use-teams'
import {
  useTeamExclusionMutations,
  useTeamExclusions,
} from '@/features/scheduling/use-scheduling-rules'

/**
 * Manage mutually-exclusive teams (issue #32, phase 1): a person can't be on
 * both teams in the same service. The auto-scheduler enforces this later; for
 * now it's just stored.
 */
export function TeamExclusionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: teams } = useTeams()
  const { data: exclusions } = useTeamExclusions()
  const { add, remove } = useTeamExclusionMutations()
  const [teamA, setTeamA] = useState('')
  const [teamB, setTeamB] = useState('')

  const nameById = useMemo(
    () => new Map((teams ?? []).map((t) => [t.id, t.name])),
    [teams],
  )

  function addExclusion() {
    if (!teamA || !teamB || teamA === teamB) {
      toast.error('Pick two different teams')
      return
    }
    add.mutate(
      { teamA, teamB },
      {
        onSuccess: () => {
          setTeamA('')
          setTeamB('')
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80svh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scheduling rules</DialogTitle>
          <DialogDescription>
            Teams that can't share a person in the same service — e.g. someone
            can't be on Worship and Ushers at once.
          </DialogDescription>
        </DialogHeader>

        {(exclusions ?? []).length > 0 && (
          <ul className="flex flex-col gap-1">
            {(exclusions ?? []).map((ex) => (
              <li
                key={`${ex.team_a}-${ex.team_b}`}
                className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1">
                  {nameById.get(ex.team_a) ?? 'Unknown'}{' '}
                  <span className="text-muted-foreground">and</span>{' '}
                  {nameById.get(ex.team_b) ?? 'Unknown'}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() =>
                    remove.mutate(ex, { onError: (e) => toast.error(e.message) })
                  }
                  aria-label="Remove exclusion"
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Select value={teamA} onValueChange={setTeamA}>
            <SelectTrigger className="h-9 flex-1" aria-label="First team">
              <SelectValue placeholder="Team" />
            </SelectTrigger>
            <SelectContent>
              {(teams ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-sm">and</span>
          <Select value={teamB} onValueChange={setTeamB}>
            <SelectTrigger className="h-9 flex-1" aria-label="Second team">
              <SelectValue placeholder="Team" />
            </SelectTrigger>
            <SelectContent>
              {(teams ?? [])
                .filter((t) => t.id !== teamA)
                .map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={addExclusion}
            disabled={add.isPending || !teamA || !teamB}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
