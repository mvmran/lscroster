import { ConfirmDialog } from '@/components/confirm-dialog'
import type { AssignmentWithPerson } from '@/features/scheduling/use-assignments'

/**
 * Confirm Remove and Notify: the person is taken off and emailed straight
 * away, and an email can't be called back. Used by the Matrix and the plan's
 * People card.
 */
export function RemoveAndNotifyDialog({
  assignment,
  positionName,
  onClose,
  onConfirm,
}: {
  assignment: AssignmentWithPerson | null
  positionName: string
  onClose: () => void
  onConfirm: (assignmentId: string) => void
}) {
  const name = assignment
    ? `${assignment.people.first_name} ${assignment.people.last_name}`.trim()
    : 'this person'
  return (
    <ConfirmDialog
      open={assignment !== null}
      onOpenChange={(open) => !open && onClose()}
      title={`Remove ${name} and email them?`}
      confirmLabel="Remove and notify"
      onConfirm={() => {
        if (assignment) onConfirm(assignment.id)
        onClose()
      }}
    >
      <p>
        {name} comes off {positionName} for this service, and an email goes to them
        now to say so. The email can’t be called back.
      </p>
    </ConfirmDialog>
  )
}
