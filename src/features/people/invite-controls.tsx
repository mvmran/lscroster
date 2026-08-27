import { useState } from 'react'
import { Check, Copy, Loader2, Mail, Trash2, UserPlus, X } from 'lucide-react'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ManageAccountDialog } from '@/features/people/manage-account-dialog'
import { fullName } from '@/features/people/person-utils'
import {
  usePersonInvitation,
  useRevokeInvite,
  useSendInvite,
} from '@/features/people/use-invitations'
import {
  useAccountAccess,
  usePerson,
  useUpdatePerson,
  type Person,
} from '@/features/people/use-people'

/**
 * Admin-only sign-in controls for a person without their own login: email
 * invitations, plus (issue #89) assigning an existing member to manage the
 * account for someone with no email of their own.
 */
export function InviteControls({ person }: { person: Person }) {
  const invitation = usePersonInvitation(person.id, true)
  const sendInvite = useSendInvite()
  const revokeInvite = useRevokeInvite()
  const updatePerson = useUpdatePerson()
  const accountAccess = useAccountAccess()
  const manager = usePerson(person.managed_by_person_id ?? undefined)
  const [manualLink, setManualLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [detachOpen, setDetachOpen] = useState(false)

  const isManaged = !!person.managed_by_person_id

  async function send() {
    try {
      const result = await sendInvite.mutateAsync(person.id)
      if (result.emailSent === false && result.inviteUrl) {
        setManualLink(result.inviteUrl)
      } else {
        toast.success('Invitation sent')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invite failed')
    }
  }

  async function revoke() {
    try {
      await revokeInvite.mutateAsync(person.id)
      toast.success('Invitation revoked')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Revoke failed')
    }
  }

  async function attach(managerId: string) {
    try {
      await updatePerson.mutateAsync({
        id: person.id,
        values: { managed_by_person_id: managerId },
      })
      setPickerOpen(false)
      toast.success('Managing member assigned')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not assign')
    }
  }

  async function detach() {
    try {
      // Routed through the Edge Function so the former manager is emailed and the
      // stale managed invitation is cleared (the browser can't do either).
      await accountAccess.mutateAsync({
        personId: person.id,
        action: 'detach-manager',
      })
      toast.success('Managing member removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove')
    }
  }

  async function copyLink() {
    if (!manualLink) return
    await navigator.clipboard.writeText(manualLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (invitation.isPending) {
    return <Loader2 className="text-muted-foreground size-4 animate-spin" />
  }

  const pending = invitation.data
  const expired = pending && new Date(pending.expires_at) < new Date()

  // --- Managed account: an existing member looks after this person ----------
  if (isManaged) {
    const managerName = manager.data ? fullName(manager.data) : '…'
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-md px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-sm italic">Account managed by</p>
            <p className="truncate text-sm font-medium">{managerName}</p>
            {manager.data?.email && (
              <p className="text-muted-foreground truncate text-xs">
                {manager.data.email}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-destructive hover:text-destructive"
            onClick={() => setDetachOpen(true)}
            disabled={accountAccess.isPending}
            aria-label="Remove managing member"
            title="Remove this managing member"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          {person.managed_accepted_at
            ? `${managerName} manages this account.`
            : pending
              ? `Waiting for ${managerName} to confirm the invitation.`
              : `Send an invitation so ${managerName} can confirm and start managing this account.`}
        </p>
        {/* Once the managing member has confirmed (issue #93) the invitation is
            done — drop the Resend/Revoke buttons, they no longer apply. */}
        {!person.managed_accepted_at && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={send} disabled={sendInvite.isPending}>
              {sendInvite.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mail className="size-4" />
              )}
              {pending ? 'Resend invitation' : 'Send invitation'}
            </Button>
            {pending && (
              <Button
                size="sm"
                variant="outline"
                onClick={revoke}
                disabled={revokeInvite.isPending}
                title="Cancel this invitation — the emailed link stops working"
              >
                <X className="size-4" />
                Revoke
              </Button>
            )}
          </div>
        )}

        <AlertDialog open={detachOpen} onOpenChange={setDetachOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {managerName}?</AlertDialogTitle>
              <AlertDialogDescription>
                {managerName} will no longer be able to view or respond on behalf
                of {person.first_name}, and will be emailed about the change. The
                account returns to pending — you can assign another member or send
                an email invitation instead.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={detach}
                disabled={accountAccess.isPending}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <ManualLinkDialog
          manualLink={manualLink}
          onClose={() => setManualLink(null)}
          firstName={managerName}
          copied={copied}
          onCopy={copyLink}
        />
      </div>
    )
  }

  // --- No manager: email invitation, with the option to assign one instead --
  return (
    <div className="flex flex-col gap-3">
      {person.email ? (
        pending ? (
          <p className="text-muted-foreground text-sm">
            {expired ? (
              <>Invitation expired {new Date(pending.expires_at).toLocaleDateString()}.</>
            ) : (
              <>
                Invitation sent {new Date(pending.created_at).toLocaleDateString()} ·
                expires {new Date(pending.expires_at).toLocaleDateString()}.
              </>
            )}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            No sign-in access yet. Send an invitation so they can set a password.
          </p>
        )
      ) : (
        <p className="text-muted-foreground text-sm">
          Add an email address to invite this person, or{' '}
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            onClick={() => setPickerOpen(true)}
          >
            assign to an existing member
          </button>
          .
        </p>
      )}

      {person.email && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={send} disabled={sendInvite.isPending}>
              {sendInvite.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mail className="size-4" />
              )}
              {pending ? 'Resend invitation' : 'Send invitation'}
            </Button>
            {pending && (
              <Button
                size="sm"
                variant="outline"
                onClick={revoke}
                disabled={revokeInvite.isPending}
                title="Cancel this invitation — the emailed link stops working"
              >
                <X className="size-4" />
                Revoke
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setPickerOpen(true)}>
              <UserPlus className="size-4" />
              Assign a managing member
            </Button>
          </div>
        </>
      )}

      <ManageAccountDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        personId={person.id}
        personName={person.first_name}
        onChoose={attach}
        saving={updatePerson.isPending}
      />

      <ManualLinkDialog
        manualLink={manualLink}
        onClose={() => setManualLink(null)}
        firstName={person.first_name}
        copied={copied}
        onCopy={copyLink}
      />
    </div>
  )
}

function ManualLinkDialog({
  manualLink,
  onClose,
  firstName,
  copied,
  onCopy,
}: {
  manualLink: string | null
  onClose: () => void
  firstName: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <Dialog open={!!manualLink} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share this invitation link</DialogTitle>
          <DialogDescription>
            Email isn't configured on this instance, so the invitation wasn't
            emailed. Share this link with {firstName} directly — it lets them
            confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={manualLink ?? ''} className="font-mono text-xs" />
          <Button
            variant="outline"
            size="icon"
            onClick={onCopy}
            aria-label="Copy link"
            title="Copy the link"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
