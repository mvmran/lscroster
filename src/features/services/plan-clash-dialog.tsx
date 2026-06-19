import { Loader2 } from 'lucide-react'
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
import {
  formatPlanDateShort,
  type ClashCandidate,
} from '@/features/services/service-utils'

/**
 * Warns when a new service overlaps an existing one in time (issue #78). It's a
 * soft warning — "Create anyway" proceeds — surfaced before single, repeated,
 * template- or copy-based plan creation. `clashes` empty = dialog closed.
 */
export function PlanClashDialog({
  clashes,
  pending,
  onConfirm,
  onCancel,
}: {
  clashes: ClashCandidate[]
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <AlertDialog open={clashes.length > 0} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Already a service at this time</AlertDialogTitle>
          <AlertDialogDescription>
            {clashes.length === 1
              ? 'A service already overlaps this time:'
              : `${clashes.length} services already overlap this time:`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="text-sm">
          {clashes.map((c) => (
            <li key={c.id} className="flex flex-wrap gap-x-2">
              <span className="font-medium">{formatPlanDateShort(c.date)}</span>
              <span className="text-muted-foreground">
                {c.service_types.name}
                {c.title ? ` — ${c.title}` : ''}
              </span>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Create anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
