import { useMemo, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { fullName } from '@/features/people/person-utils'
import { usePeople } from '@/features/people/use-people'
import {
  CADENCE_OPTIONS,
  formatRecurringRule,
  PAIRING_KIND_LABELS,
  SCHEDULING_STATUS_LABELS,
  WEEKDAY_LABELS,
  type PairingKind,
  type SchedulingStatus,
} from '@/features/scheduling/scheduling-utils'
import {
  usePairingMutations,
  usePersonPairings,
  usePersonPrefs,
  useRecurringUnavailability,
  useRecurringUnavailabilityMutations,
  useUpsertPersonPrefs,
  type PersonSchedulingPrefs,
} from '@/features/scheduling/use-scheduling-rules'

/** Empty string ⇄ nullable integer for the optional number fields. */
function numToStr(n: number | null | undefined) {
  return n == null ? '' : String(n)
}
function strToNum(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number.parseInt(t, 10)
  return Number.isFinite(n) ? n : null
}

function PreferencesForm({
  personId,
  prefs,
}: {
  personId: string
  prefs: PersonSchedulingPrefs | null
}) {
  const upsert = useUpsertPersonPrefs(personId)
  const [minGap, setMinGap] = useState(String(prefs?.min_gap_days ?? 0))
  const [maxPerMonth, setMaxPerMonth] = useState(numToStr(prefs?.max_per_month))
  const [targetPerMonth, setTargetPerMonth] = useState(numToStr(prefs?.target_per_month))
  const [maxConsecutive, setMaxConsecutive] = useState(numToStr(prefs?.max_consecutive))
  const [status, setStatus] = useState<SchedulingStatus>(prefs?.status ?? 'active')

  function save() {
    upsert.mutate(
      {
        min_gap_days: Number.parseInt(minGap, 10) || 0,
        max_per_month: strToNum(maxPerMonth),
        target_per_month: strToNum(targetPerMonth),
        max_consecutive: strToNum(maxConsecutive),
        status,
      },
      {
        onSuccess: () => toast.success('Preferences saved'),
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pref-cadence">How often</Label>
          <Select value={minGap} onValueChange={setMinGap}>
            <SelectTrigger id="pref-cadence" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CADENCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pref-status">Scheduling status</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as SchedulingStatus)}
          >
            <SelectTrigger id="pref-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SCHEDULING_STATUS_LABELS) as SchedulingStatus[]).map(
                (s) => (
                  <SelectItem key={s} value={s}>
                    {SCHEDULING_STATUS_LABELS[s]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pref-max">Max per month</Label>
          <Input
            id="pref-max"
            type="number"
            min={0}
            inputMode="numeric"
            value={maxPerMonth}
            onChange={(e) => setMaxPerMonth(e.target.value)}
            placeholder="No limit"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pref-target">Target per month</Label>
          <Input
            id="pref-target"
            type="number"
            min={0}
            inputMode="numeric"
            value={targetPerMonth}
            onChange={(e) => setTargetPerMonth(e.target.value)}
            placeholder="None"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pref-consec">Max in a row</Label>
          <Input
            id="pref-consec"
            type="number"
            min={1}
            inputMode="numeric"
            value={maxConsecutive}
            onChange={(e) => setMaxConsecutive(e.target.value)}
            placeholder="No limit"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={upsert.isPending}>
          {upsert.isPending && <Loader2 className="size-4 animate-spin" />}
          Save preferences
        </Button>
      </div>
    </div>
  )
}

function RecurringSection({ personId }: { personId: string }) {
  const { data: rules } = useRecurringUnavailability(personId)
  const { add, remove } = useRecurringUnavailabilityMutations(personId)
  const [week, setWeek] = useState('every') // every | 1..5 | last
  const [weekday, setWeekday] = useState('0')

  function addRule() {
    const week_of_month = week === 'every' ? null : week === 'last' ? -1 : Number(week)
    add.mutate(
      { week_of_month, weekday: Number(weekday) },
      { onError: (e) => toast.error(e.message) },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-semibold">Recurring unavailability</h3>
        <p className="text-muted-foreground text-xs">
          Regular dates they can't serve, e.g. every 1st Sunday. One-off dates
          are set as blockouts.
        </p>
      </div>
      {(rules ?? []).length > 0 && (
        <ul className="flex flex-col gap-1">
          {(rules ?? []).map((r) => (
            <li
              key={r.id}
              className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
            >
              <span className="min-w-0 flex-1">
                {formatRecurringRule(r.week_of_month, r.weekday)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => remove.mutate(r.id, { onError: (e) => toast.error(e.message) })}
                aria-label="Remove recurring unavailability"
                title="Remove this recurring unavailability"
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Select value={week} onValueChange={setWeek}>
          <SelectTrigger className="h-9 w-32" aria-label="Week of month">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="every">Every</SelectItem>
            <SelectItem value="1">1st</SelectItem>
            <SelectItem value="2">2nd</SelectItem>
            <SelectItem value="3">3rd</SelectItem>
            <SelectItem value="4">4th</SelectItem>
            <SelectItem value="5">5th</SelectItem>
            <SelectItem value="last">Last</SelectItem>
          </SelectContent>
        </Select>
        <Select value={weekday} onValueChange={setWeekday}>
          <SelectTrigger className="h-9 w-36" aria-label="Day of week">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WEEKDAY_LABELS.map((label, i) => (
              <SelectItem key={label} value={String(i)}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={addRule}
          disabled={add.isPending}
        >
          <Plus className="size-4" />
          Add
        </Button>
      </div>
    </div>
  )
}

function PairingsSection({ personId }: { personId: string }) {
  const { data: pairings } = usePersonPairings(personId)
  const { data: people } = usePeople()
  const { add, remove } = usePairingMutations(personId)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [kind, setKind] = useState<PairingKind>('prefer')
  const [hard, setHard] = useState(false)
  const [search, setSearch] = useState('')

  const peopleById = useMemo(
    () => new Map((people ?? []).map((p) => [p.id, p])),
    [people],
  )

  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (people ?? [])
      .filter((p) => p.id !== personId && p.status === 'active')
      .filter((p) => term === '' || fullName(p).toLowerCase().includes(term))
  }, [people, personId, search])

  function choose(otherId: string) {
    add.mutate(
      { otherId, kind, strength: hard ? 'hard' : 'soft' },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setSearch('')
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-semibold">Serve with</h3>
        <p className="text-muted-foreground text-xs">
          People to pair with or keep apart when rostering.
        </p>
      </div>
      {(pairings ?? []).length > 0 && (
        <ul className="flex flex-col gap-1">
          {(pairings ?? []).map((pairing) => {
            const otherId =
              pairing.person_a === personId ? pairing.person_b : pairing.person_a
            const other = peopleById.get(otherId)
            return (
              <li
                key={pairing.id}
                className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-muted-foreground">
                    {PAIRING_KIND_LABELS[pairing.kind]}:
                  </span>{' '}
                  {other ? fullName(other) : 'Unknown'}
                </span>
                {pairing.strength === 'hard' && (
                  <Badge variant="outline" className="shrink-0">
                    Strict
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() =>
                    remove.mutate(pairing, { onError: (e) => toast.error(e.message) })
                  }
                  aria-label="Remove pairing"
                  title="Remove this pairing"
                >
                  <X className="size-4" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <div>
        <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          Add pairing
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[80svh] flex-col sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a pairing</DialogTitle>
            <DialogDescription>
              Choose the rule, then pick the person it applies to.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={kind} onValueChange={(v) => setKind(v as PairingKind)}>
              <SelectTrigger className="flex-1" aria-label="Pairing kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PAIRING_KIND_LABELS) as PairingKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {PAIRING_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={hard} onCheckedChange={setHard} />
              Strict
            </label>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people…"
            autoFocus
          />
          <div className="-mx-2 flex-1 overflow-y-auto px-2">
            {candidates.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No matching people.
              </p>
            ) : (
              <ul className="flex flex-col">
                {candidates.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      disabled={add.isPending}
                      onClick={() => choose(person.id)}
                      className="hover:bg-accent w-full rounded-md px-2 py-2 text-left text-sm disabled:opacity-50"
                    >
                      {fullName(person)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Per-person scheduling rules (issue #32, phase 1): cadence/cap preferences,
 * recurring unavailability, and prefer/avoid/together pairings. Admin/leader
 * only; the auto-scheduler will consume this data in a later phase.
 */
export function PersonSchedulingCard({ personId }: { personId: string }) {
  const { data: prefs, isPending } = usePersonPrefs(personId)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scheduling rules</CardTitle>
        <CardDescription>
          How often this person serves, when they're regularly away, and who
          they serve with.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {isPending ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <PreferencesForm
            key={prefs?.updated_at ?? 'new'}
            personId={personId}
            prefs={prefs ?? null}
          />
        )}
        <RecurringSection personId={personId} />
        <PairingsSection personId={personId} />
      </CardContent>
    </Card>
  )
}
