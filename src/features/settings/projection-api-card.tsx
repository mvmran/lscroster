import { useState } from 'react'
import { format } from 'date-fns'
import { Check, Copy, KeyRound, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { useCurrentPerson } from '@/features/auth/use-current-person'
import {
  useCreateProjectionKey,
  useProjectionKeys,
  useRevokeProjectionKey,
  type ProjectionKey,
} from '@/features/settings/use-projection-keys'

/**
 * Generate-key dialog (issue #135). The raw key exists only in this dialog:
 * it is shown once with a copy button and cannot be retrieved again — the
 * database keeps just its hash and display prefix.
 */
function GenerateKeyDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: person } = useCurrentPerson()
  const create = useCreateProjectionKey()
  const [label, setLabel] = useState('')
  const [rawKey, setRawKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function reset(nextOpen: boolean) {
    if (!nextOpen) {
      setLabel('')
      setRawKey(null)
      setCopied(false)
    }
    onOpenChange(nextOpen)
  }

  function generate() {
    create.mutate(
      { label: label.trim(), createdBy: person?.id ?? null },
      {
        onSuccess: (key) => setRawKey(key),
        onError: (e) => toast.error(e.message),
      },
    )
  }

  async function copy() {
    if (!rawKey) return
    await navigator.clipboard.writeText(rawKey)
    setCopied(true)
    toast.success('Key copied to clipboard')
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate projection key</DialogTitle>
          <DialogDescription>
            {rawKey
              ? 'Copy the key now — it is shown only this once. Store it in the projection app, never in a shared document.'
              : 'One key per device (e.g. “AV Desk Mac Mini”) so a single machine can be revoked without breaking the others.'}
          </DialogDescription>
        </DialogHeader>
        {rawKey ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <code className="bg-muted min-w-0 flex-1 rounded-md px-3 py-2 text-xs break-all select-all">
                {rawKey}
              </code>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={copy}
                aria-label="Copy key"
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => reset(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="projection-key-label">Device label</Label>
              <Input
                id="projection-key-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. AV Desk Mac Mini"
                maxLength={80}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && label.trim()) generate()
                }}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                disabled={create.isPending || !label.trim()}
                onClick={generate}
              >
                {create.isPending && <Loader2 className="size-4 animate-spin" />}
                Generate key
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function KeyRow({ apiKey }: { apiKey: ProjectionKey }) {
  const revoke = useRevokeProjectionKey()
  const revoked = apiKey.revoked_at !== null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 text-sm last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={revoked ? 'text-muted-foreground line-through' : 'font-medium'}>
            {apiKey.label}
          </span>
          {revoked && <Badge variant="outline">Revoked</Badge>}
        </div>
        <p className="text-muted-foreground text-xs">
          <code>{apiKey.key_prefix}…</code>
          {' · created '}
          {format(new Date(apiKey.created_at), 'd MMM yyyy')}
          {' · '}
          {apiKey.last_used_at
            ? `last used ${format(new Date(apiKey.last_used_at), 'd MMM yyyy, h:mmaaa')}`
            : 'never used'}
        </p>
      </div>
      {!revoked && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={revoke.isPending}
          onClick={() =>
            revoke.mutate(apiKey.id, {
              onSuccess: () =>
                toast.success(`“${apiKey.label}” can no longer access the API`),
              onError: (e) => toast.error(e.message),
            })
          }
        >
          Revoke
        </Button>
      )}
    </div>
  )
}

/**
 * Admin management of projection API keys (issue #135): the credentials the
 * Mac projection software uses against the projection-api Edge Function.
 * Docs for the projection developer: docs/PROJECTION-API.md.
 */
export function ProjectionApiCard() {
  const { data: keys, isPending } = useProjectionKeys()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projection API</CardTitle>
        <CardDescription>
          Access keys for the projection software that downloads published set
          lists and lyrics. Generate one key per device; revoke a key to cut
          that device off immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isPending || !keys ? (
          <Skeleton className="h-16 w-full" />
        ) : keys.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No keys yet — the projection API is unreachable until you generate
            one.
          </p>
        ) : (
          <div className="flex flex-col">
            {keys.map((k) => (
              <KeyRow key={k.id} apiKey={k} />
            ))}
          </div>
        )}
        <div>
          <Button type="button" variant="outline" onClick={() => setDialogOpen(true)}>
            <KeyRound className="size-4" />
            Generate key
          </Button>
        </div>
        <GenerateKeyDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </CardContent>
    </Card>
  )
}
