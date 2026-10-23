import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export interface InviteLink {
  name: string
  url: string
}

/**
 * The links of a bulk invite that went out without email (email isn't set up
 * on this instance) — the bulk twin of the person page's share-link dialog.
 * Closing it loses the links, as a resend makes new ones.
 */
export function BulkInviteLinksDialog({
  links,
  onClose,
}: {
  links: InviteLink[]
  onClose: () => void
}) {
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(url: string) {
    await navigator.clipboard.writeText(url)
    setCopied(url)
    setTimeout(() => setCopied((c) => (c === url ? null : c)), 2000)
  }

  return (
    <Dialog open={links.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share these invitation links</DialogTitle>
          <DialogDescription>
            Email isn't configured on this instance, so these invitations weren't
            emailed. Share each link with that person directly — copy them before
            closing, as sending again makes new ones.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {links.map((link) => (
            <li key={link.url} className="flex flex-col gap-1">
              <span className="text-sm font-medium">{link.name}</span>
              <div className="flex gap-2">
                <Input readOnly value={link.url} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void copy(link.url)}
                  aria-label={`Copy ${link.name}'s link`}
                  title="Copy the link"
                >
                  {copied === link.url ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
