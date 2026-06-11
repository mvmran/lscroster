import { useState } from 'react'
import { Check, Copy, Loader2, Mail, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  usePersonInvitation,
  useRevokeInvite,
  useSendInvite,
} from '@/features/people/use-invitations'
import type { Person } from '@/features/people/use-people'

/**
 * Admin-only invitation controls for a person without sign-in access.
 * Shows current invitation state with send / resend / revoke actions.
 */
export function InviteControls({ person }: { person: Person }) {
  const invitation = usePersonInvitation(person.id, true)
  const sendInvite = useSendInvite()
  const revokeInvite = useRevokeInvite()
  const [manualLink, setManualLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (!person.email) {
    return (
      <p className="text-muted-foreground text-sm">
        Add an email address to invite this person.
      </p>
    )
  }
  if (invitation.isPending) {
    return <Loader2 className="text-muted-foreground size-4 animate-spin" />
  }

  const pending = invitation.data
  const expired = pending && new Date(pending.expires_at) < new Date()

  async function send() {
    try {
      const result = await sendInvite.mutateAsync(person.id)
      if (result.emailSent === false && result.inviteUrl) {
        setManualLink(result.inviteUrl)
      } else {
        toast.success(`Invitation emailed to ${person.email}`)
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

  async function copyLink() {
    if (!manualLink) return
    await navigator.clipboard.writeText(manualLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-3">
      {pending ? (
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
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={send}
          disabled={sendInvite.isPending}
        >
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
          >
            <X className="size-4" />
            Revoke
          </Button>
        )}
      </div>

      <Dialog open={!!manualLink} onOpenChange={(open) => !open && setManualLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share this invitation link</DialogTitle>
            <DialogDescription>
              Email isn't configured on this instance, so the invitation wasn't
              emailed. Share this link with {person.first_name} directly — it
              lets them set their password.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={manualLink ?? ''} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={copyLink} aria-label="Copy link">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
