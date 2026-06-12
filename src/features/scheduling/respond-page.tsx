import { useEffect, useRef, useState } from 'react'
import { CalendarCheck, Check, Church, Loader2, X } from 'lucide-react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { invokeFunction } from '@/lib/functions'

interface RespondResult {
  ok: boolean
  churchName: string
  firstName: string
  planDateLong: string
  startTime: string | null
  serviceTypeName: string
  planTitle: string | null
  teamName: string
  positionName: string
  status: 'pending' | 'confirmed' | 'declined'
  respondedAt: string | null
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; details: RespondResult; justResponded: boolean }

/**
 * Public page behind the emailed Accept/Decline links. No login: the signed
 * token in the URL is the credential, validated by the respond-to-request
 * Edge Function. ?action=accept records immediately; ?action=decline asks
 * for an optional reason first.
 */
export function RespondPage() {
  const { token } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  const action = searchParams.get('action')

  const [state, setState] = useState<PageState>({ kind: 'loading' })
  const [declineOpen, setDeclineOpen] = useState(action === 'decline')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    const body: Record<string, unknown> = { token }
    // Accept straight from the email button; declining asks for a reason first.
    if (action === 'accept') body.action = 'accept'
    invokeFunction<RespondResult>('respond-to-request', body)
      .then((details) =>
        setState({ kind: 'ready', details, justResponded: action === 'accept' }),
      )
      .catch((error: Error) => setState({ kind: 'error', message: error.message }))
  }, [token, action])

  async function submit(chosen: 'accept' | 'decline') {
    if (!token) return
    setSubmitting(true)
    try {
      const details = await invokeFunction<RespondResult>('respond-to-request', {
        token,
        action: chosen,
        ...(chosen === 'decline' && reason.trim() ? { reason: reason.trim() } : {}),
      })
      setState({ kind: 'ready', details, justResponded: true })
      setDeclineOpen(false)
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-muted/30 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-4 px-6 py-2">
          {state.kind === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
              <p className="text-muted-foreground text-sm">Loading your request…</p>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Church className="text-muted-foreground size-8" />
              <p className="font-medium">{state.message}</p>
              <p className="text-muted-foreground text-sm">
                If you think this is a mistake, contact your team leader for a
                fresh link.
              </p>
            </div>
          )}

          {state.kind === 'ready' && (
            <>
              <div className="flex flex-col items-center gap-1 pt-2 text-center">
                <p className="text-muted-foreground text-sm">
                  {state.details.churchName}
                </p>
                <h1 className="text-xl font-semibold">
                  Hi {state.details.firstName}!
                </h1>
              </div>

              <div className="bg-muted/60 flex flex-col gap-0.5 rounded-lg px-4 py-3 text-center">
                <p className="font-semibold">
                  {state.details.planDateLong}
                  {state.details.startTime ? ` · ${state.details.startTime}` : ''}
                </p>
                <p className="text-muted-foreground text-sm">
                  {state.details.serviceTypeName}
                  {state.details.planTitle ? ` — ${state.details.planTitle}` : ''}
                </p>
                <p className="text-sm">
                  <strong>{state.details.positionName}</strong> ·{' '}
                  {state.details.teamName}
                </p>
              </div>

              {state.details.status !== 'pending' && (
                <div
                  className={
                    state.details.status === 'confirmed'
                      ? 'flex items-center justify-center gap-2 rounded-md bg-green-100 px-3 py-2.5 text-sm font-medium text-green-900 dark:bg-green-950 dark:text-green-200'
                      : 'flex items-center justify-center gap-2 rounded-md bg-red-100 px-3 py-2.5 text-sm font-medium text-red-900 dark:bg-red-950 dark:text-red-200'
                  }
                >
                  {state.details.status === 'confirmed' ? (
                    <>
                      <CalendarCheck className="size-4" />
                      {state.justResponded
                        ? "You're confirmed — thank you!"
                        : "You've accepted this request."}
                    </>
                  ) : (
                    <>
                      <X className="size-4" />
                      {state.justResponded
                        ? "You've declined — thanks for letting us know."
                        : 'You declined this request.'}
                    </>
                  )}
                </div>
              )}

              {declineOpen ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="rp-reason">
                      Can't make it? Add a reason (optional)
                    </Label>
                    <Textarea
                      id="rp-reason"
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Away that weekend"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      className="flex-1"
                      disabled={submitting}
                      onClick={() => submit('decline')}
                    >
                      {submitting && <Loader2 className="size-4 animate-spin" />}
                      Decline
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={submitting}
                      onClick={() => setDeclineOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 pb-2">
                  {state.details.status !== 'confirmed' && (
                    <Button
                      size="lg"
                      className="bg-green-600 text-white hover:bg-green-700"
                      disabled={submitting}
                      onClick={() => submit('accept')}
                    >
                      {submitting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      {state.details.status === 'declined'
                        ? 'Changed my mind — accept'
                        : 'Accept'}
                    </Button>
                  )}
                  {state.details.status !== 'declined' && (
                    <Button
                      size="lg"
                      variant={
                        state.details.status === 'confirmed' ? 'outline' : 'destructive'
                      }
                      disabled={submitting}
                      onClick={() => setDeclineOpen(true)}
                    >
                      <X className="size-4" />
                      {state.details.status === 'confirmed'
                        ? 'I can no longer make it'
                        : 'Decline'}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
