import { useState } from 'react'
import { AlertCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RULE_SHORT_LABELS, type RuleResult } from '@/features/scheduling/validate-service'

function ResultRow({ result }: { result: RuleResult }) {
  const isError = result.severity === 'error'
  const Icon = isError ? AlertTriangle : AlertCircle
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon
        className={`mt-0.5 size-4 shrink-0 ${
          isError ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
        }`}
      />
      <span>
        <span className="font-medium">{RULE_SHORT_LABELS[result.code] ?? result.code}</span>
        {' — '}
        <span className="text-muted-foreground">{result.message}</span>
      </span>
    </li>
  )
}

/**
 * Two-tier publish gate (issue #34). Errors are listed in red and require a
 * typed reason to override; warnings are amber and informational. Publishing is
 * always permitted — manual override is intentional — but the reason for each
 * error is recorded to `publish_overrides`.
 */
export function PublishGateDialog({
  open,
  onOpenChange,
  errors,
  warnings,
  isPending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  errors: RuleResult[]
  warnings: RuleResult[]
  isPending: boolean
  onConfirm: (reason: string | null) => void
}) {
  const [reason, setReason] = useState('')
  const hasErrors = errors.length > 0
  const reasonRequired = hasErrors && reason.trim().length === 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason('')
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish with {hasErrors ? 'errors' : 'warnings'}?</DialogTitle>
          <DialogDescription>
            This plan breaks {hasErrors ? 'some scheduling rules' : 'a few soft preferences'}.
            You can still publish — review what's flagged first.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1">
          {hasErrors && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                Errors ({errors.length})
              </p>
              <ul className="space-y-1.5">
                {errors.map((r, i) => (
                  <ResultRow key={`e-${i}`} result={r} />
                ))}
              </ul>
            </div>
          )}
          {warnings.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Warnings ({warnings.length})
              </p>
              <ul className="space-y-1.5">
                {warnings.map((r, i) => (
                  <ResultRow key={`w-${i}`} result={r} />
                ))}
              </ul>
            </div>
          )}
          {hasErrors && (
            <div className="space-y-2">
              <Label htmlFor="override-reason">
                Reason for overriding <span className="text-red-600">*</span>
              </Label>
              <Textarea
                id="override-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Sarah confirmed she's available despite the blockout"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant={hasErrors ? 'destructive' : 'default'}
            disabled={isPending || reasonRequired}
            onClick={() => onConfirm(reason.trim() || null)}
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Publish anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
