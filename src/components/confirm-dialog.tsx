import type { ReactNode } from 'react'
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

/**
 * "Are you sure?" before something that can't be taken back — a delete, a
 * revoked key, an email on its way. Controlled: open it by setting state from
 * the button or menu item, and `onConfirm` runs only from the confirm button;
 * Cancel, Escape or a click outside does nothing.
 *
 * Pass `pending` for a delete worth waiting on: the dialog then stays open
 * with a spinner while it runs, and the caller closes it (or navigates away)
 * once it's done — so a failure leaves it open beside its error.
 *
 * The confirm button uses the destructive variant. (A `bg-destructive` class on
 * `AlertDialogAction` loses to the button's own colours, which is why some
 * older dialogs show a plain primary button.) Pass `variant="default"` for a
 * warning that loses nothing — archiving, which can be undone — so red stays
 * reserved for what can't be taken back.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  pending,
  variant = 'destructive',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  /** What happens, and what can't be undone. */
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  /** Set while the confirmed action runs; the caller then closes the dialog. */
  pending?: boolean
  /** Red for a loss (the default); the primary blue for one that loses nothing. */
  variant?: 'destructive' | 'default'
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">{children}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={variant}
            disabled={pending}
            onClick={(event) => {
              // Stay open while it runs; the caller closes it when done.
              if (pending !== undefined) event.preventDefault()
              onConfirm()
            }}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
