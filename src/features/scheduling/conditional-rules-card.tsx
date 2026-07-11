import { useMemo, useState } from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  findRuleCycle,
  ruleSentence,
  type ConditionalRule,
} from '@/features/scheduling/conditional-rules'
import {
  toConditionalRule,
  useAllConditionalRules,
  useDeleteConditionalRule,
  useSaveConditionalRule,
  useSetRuleEnabled,
  type SaveConditionalRuleVars,
} from '@/features/scheduling/use-scheduling-rules'
import { teamServesType, useAllPositions, useTeams } from '@/features/scheduling/use-teams'
import { useServiceTypes } from '@/features/services/use-service-types'

/**
 * Conditional relationship rules (issue #113): "if the person in <position>
 * is <male/female>, then <other position(s)> need <N> people". Authored as a
 * dropdown sentence so an invalid rule is hard to build; saved rules render as
 * a read-only sentence. Admins/leaders only (matches the RLS write policy).
 */

interface EffectDraft {
  targetPositionId: string
  minCount: string
}

const ALL_TYPES = 'all'

function RuleDialog({
  open,
  onOpenChange,
  editing,
  existingRules,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The rule being edited, or null when creating. */
  editing: ConditionalRule | null
  existingRules: ConditionalRule[]
}) {
  const save = useSaveConditionalRule()
  const { data: serviceTypes } = useServiceTypes()
  const { data: teams } = useTeams()
  const { data: positions } = useAllPositions()

  const [name, setName] = useState(editing?.name ?? '')
  const [serviceTypeId, setServiceTypeId] = useState(editing?.serviceTypeId ?? ALL_TYPES)
  const [triggerPositionId, setTriggerPositionId] = useState(editing?.triggerPositionId ?? '')
  const [triggerValue, setTriggerValue] = useState(editing?.triggerValue ?? 'female')
  const [strength, setStrength] = useState<'hard' | 'soft'>(editing?.strength ?? 'hard')
  const [effects, setEffects] = useState<EffectDraft[]>(
    editing?.effects.map((e) => ({
      targetPositionId: e.targetPositionId,
      minCount: String(e.minCount),
    })) ?? [{ targetPositionId: '', minCount: '1' }],
  )
  const [formError, setFormError] = useState<string | null>(null)

  const teamNameById = useMemo(() => new Map((teams ?? []).map((t) => [t.id, t.name])), [teams])
  const positionName = (id: string) => {
    const p = (positions ?? []).find((pos) => pos.id === id)
    return p ? `${teamNameById.get(p.team_id) ?? '?'} — ${p.name}` : '?'
  }

  // Only positions of teams serving the rule's service type make sense as
  // trigger or target; "all service types" allows every position.
  const selectablePositions = useMemo(() => {
    const servingTeams = (teams ?? []).filter(
      (t) => serviceTypeId === ALL_TYPES || teamServesType(t, serviceTypeId),
    )
    const teamIds = new Set(servingTeams.map((t) => t.id))
    return (positions ?? [])
      .filter((p) => teamIds.has(p.team_id))
      .sort((a, b) => positionName(a.id).localeCompare(positionName(b.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, positions, serviceTypeId, teamNameById])

  function setEffect(index: number, patch: Partial<EffectDraft>) {
    setEffects((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)))
  }

  async function submit() {
    setFormError(null)
    const trimmed = name.trim()
    if (!trimmed) return setFormError('Give the rule a name.')
    if (!triggerPositionId) return setFormError('Pick the position the rule watches.')
    const cleanEffects = effects
      .filter((e) => e.targetPositionId)
      .map((e) => ({
        targetPositionId: e.targetPositionId,
        minCount: Math.max(0, Number.parseInt(e.minCount, 10) || 0),
      }))
    if (cleanEffects.length === 0) {
      return setFormError('Add at least one position the rule sets a minimum for.')
    }
    if (new Set(cleanEffects.map((e) => e.targetPositionId)).size !== cleanEffects.length) {
      return setFormError('Each position can appear only once in a rule.')
    }

    // Reject trigger→target loops before they're stored (the resolver would
    // only break them defensively).
    const candidate: ConditionalRule = {
      id: editing?.id ?? 'candidate',
      name: trimmed,
      serviceTypeId: serviceTypeId === ALL_TYPES ? null : serviceTypeId,
      triggerPositionId,
      triggerAttribute: 'sex',
      triggerValue,
      strength,
      enabled: editing?.enabled ?? true,
      effects: cleanEffects,
    }
    const others = existingRules.filter((r) => r.id !== editing?.id)
    const cycle = findRuleCycle([...others, candidate])
    if (cycle) {
      return setFormError(
        `This rule would create a loop: ${cycle.map(positionName).join(' → ')}. ` +
          'A rule cannot (directly or through other rules) depend on its own outcome.',
      )
    }

    const vars: SaveConditionalRuleVars = {
      id: editing?.id,
      name: trimmed,
      serviceTypeId: candidate.serviceTypeId,
      triggerPositionId,
      triggerAttribute: 'sex',
      triggerValue,
      strength,
      enabled: candidate.enabled,
      effects: cleanEffects,
    }
    try {
      await save.mutateAsync(vars)
      toast.success(editing ? 'Rule updated' : 'Rule added')
      onOpenChange(false)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save the rule')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit rule' : 'New rule'}</DialogTitle>
          <DialogDescription>
            When the person in one position matches a condition, other positions
            need a different number of people.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cr-name">Name</Label>
            <Input
              id="cr-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Vocals balance"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cr-service-type">Applies to</Label>
            <Select value={serviceTypeId} onValueChange={setServiceTypeId}>
              <SelectTrigger id="cr-service-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TYPES}>All service types</SelectItem>
                {(serviceTypes ?? []).map((st) => (
                  <SelectItem key={st.id} value={st.id}>
                    {st.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>If the person in…</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={triggerPositionId} onValueChange={setTriggerPositionId}>
                <SelectTrigger className="w-full" aria-label="Trigger position">
                  <SelectValue placeholder="Pick a position" />
                </SelectTrigger>
                <SelectContent>
                  {selectablePositions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {positionName(p.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={triggerValue} onValueChange={setTriggerValue}>
                <SelectTrigger className="w-full sm:w-36" aria-label="Trigger value">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">is female</SelectItem>
                  <SelectItem value="male">is male</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>…then require</Label>
            {effects.map((effect, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  className="w-16"
                  value={effect.minCount}
                  onChange={(e) => setEffect(i, { minCount: e.target.value })}
                  aria-label="Minimum people"
                />
                <span className="text-muted-foreground text-sm">on</span>
                <Select
                  value={effect.targetPositionId}
                  onValueChange={(v) => setEffect(i, { targetPositionId: v })}
                >
                  <SelectTrigger className="min-w-0 flex-1" aria-label="Target position">
                    <SelectValue placeholder="Pick a position" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectablePositions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {positionName(p.id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {effects.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove this position"
                    onClick={() => setEffects((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                setEffects((prev) => [...prev, { targetPositionId: '', minCount: '1' }])
              }
            >
              <Plus className="size-4" />
              Add another position
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cr-strength">How strict</Label>
            <Select value={strength} onValueChange={(v) => setStrength(v as 'hard' | 'soft')}>
              <SelectTrigger id="cr-strength" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hard">Required — blocks publish (can be overridden)</SelectItem>
                <SelectItem value="soft">Preferred — shows a warning only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formError && <p className="text-destructive text-sm">{formError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            {editing ? 'Save rule' : 'Add rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ConditionalRulesCard() {
  const rulesQuery = useAllConditionalRules()
  const setEnabled = useSetRuleEnabled()
  const deleteRule = useDeleteConditionalRule()
  const { data: teams } = useTeams()
  const { data: positions } = useAllPositions()
  const { data: serviceTypes } = useServiceTypes()

  // Key the dialog by rule id (or 'new') so its internal state resets whenever
  // a different rule is opened.
  const [dialog, setDialog] = useState<{ editing: ConditionalRule | null } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ConditionalRule | null>(null)

  const rules = useMemo(
    () => (rulesQuery.data ?? []).map(toConditionalRule),
    [rulesQuery.data],
  )
  const teamNameById = useMemo(() => new Map((teams ?? []).map((t) => [t.id, t.name])), [teams])
  const positionName = (id: string) => {
    const p = (positions ?? []).find((pos) => pos.id === id)
    return p ? `${teamNameById.get(p.team_id) ?? '?'} ${p.name}` : 'a removed position'
  }

  async function toggle(rule: ConditionalRule, enabled: boolean) {
    try {
      await setEnabled.mutateAsync({ ruleId: rule.id, enabled })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the rule')
    }
  }

  async function confirmDelete() {
    const rule = pendingDelete
    setPendingDelete(null)
    if (!rule) return
    try {
      await deleteRule.mutateAsync(rule.id)
      toast.success('Rule deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the rule')
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Scheduling rules</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setDialog({ editing: null })}>
          <Plus className="size-4" />
          Add rule
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {rules.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No conditional rules yet. Example: if the Worship Leader is female,
            require 2 people on Male Vocals.
          </p>
        ) : (
          rules.map((rule) => {
            const typeName = rule.serviceTypeId
              ? serviceTypes?.find((st) => st.id === rule.serviceTypeId)?.name ?? '?'
              : 'All service types'
            return (
              <div
                key={rule.id}
                className="flex items-center gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {rule.name}{' '}
                    <Badge variant="secondary" className="ml-1 align-middle">
                      {rule.strength === 'hard' ? 'Required' : 'Preferred'}
                    </Badge>
                  </p>
                  <p className="text-muted-foreground truncate text-sm">
                    {ruleSentence(rule, positionName)} · {typeName}
                  </p>
                </div>
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(checked) => toggle(rule, checked)}
                  aria-label={`Enable rule ${rule.name}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit rule ${rule.name}`}
                  onClick={() => setDialog({ editing: rule })}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete rule ${rule.name}`}
                  onClick={() => setPendingDelete(rule)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )
          })
        )}
      </CardContent>

      {dialog && (
        <RuleDialog
          key={dialog.editing?.id ?? 'new'}
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null)
          }}
          editing={dialog.editing}
          existingRules={rules}
        />
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete rule "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Plans go back to their normal position minimums. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
