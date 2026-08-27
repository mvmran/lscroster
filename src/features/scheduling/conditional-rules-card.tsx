import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { fullName } from '@/features/people/person-utils'
import {
  findRuleCycle,
  isRuleBroken,
  ruleSentence,
  type ConditionalRule,
  type RuleCondition,
  type RuleEffect,
} from '@/features/scheduling/conditional-rules'
import {
  toConditionalRule,
  useAllConditionalRules,
  useDeleteConditionalRule,
  useSaveConditionalRule,
  useSetRuleEnabled,
  type ConditionalRuleRow,
  type SaveConditionalRuleVars,
} from '@/features/scheduling/use-scheduling-rules'
import {
  teamServesType,
  useAllPositions,
  useAllTeamMembers,
  useTeams,
} from '@/features/scheduling/use-teams'
import { useServiceTypes } from '@/features/services/use-service-types'

/**
 * Conditional relationship rules (issue #113 + extension): "if the person in
 * <position> <is female / is male / is a specific person / is anyone>, then
 * <other position(s)> need <N people / a specific person / the same person>".
 * Authored as a dropdown sentence so an invalid rule is hard to build; saved
 * rules render as a read-only sentence. Admins/leaders only (matches RLS).
 */

/** UI condition operator — the two sex values fold into the one select. */
type ConditionChoice = 'female' | 'male' | 'person' | 'any'

interface EffectDraft {
  kind: 'count' | 'person' | 'same-person'
  targetPositionId: string
  minCount: string
  personId: string
}

const ALL_TYPES = 'all'

function conditionToChoice(c: RuleCondition): ConditionChoice {
  if (c.kind === 'attribute') return c.value === 'male' ? 'male' : 'female'
  return c.kind
}

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
  const { data: members } = useAllTeamMembers()

  const [name, setName] = useState(editing?.name ?? '')
  const [serviceTypeId, setServiceTypeId] = useState(editing?.serviceTypeId ?? ALL_TYPES)
  const [triggerPositionId, setTriggerPositionId] = useState(editing?.triggerPositionId ?? '')
  const [conditionChoice, setConditionChoice] = useState<ConditionChoice>(
    editing ? conditionToChoice(editing.condition) : 'female',
  )
  const [conditionPersonId, setConditionPersonId] = useState(
    editing?.condition.kind === 'person' ? (editing.condition.personId ?? '') : '',
  )
  const [strength, setStrength] = useState<'hard' | 'soft'>(editing?.strength ?? 'hard')
  const [effects, setEffects] = useState<EffectDraft[]>(
    editing?.effects.map((e) => ({
      kind: e.kind,
      targetPositionId: e.targetPositionId,
      minCount: e.kind === 'count' ? String(e.minCount) : '1',
      personId: e.kind === 'person' ? (e.personId ?? '') : '',
    })) ?? [{ kind: 'count', targetPositionId: '', minCount: '1', personId: '' }],
  )
  const [formError, setFormError] = useState<string | null>(null)

  const teamNameById = useMemo(() => new Map((teams ?? []).map((t) => [t.id, t.name])), [teams])
  const positionName = (id: string) => {
    const p = (positions ?? []).find((pos) => pos.id === id)
    return p ? `${teamNameById.get(p.team_id) ?? '?'} — ${p.name}` : '?'
  }
  const personNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of members ?? []) map.set(m.person_id, fullName(m.people))
    return map
  }, [members])

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

  /**
   * People to offer for a position's person picker: everyone set up for it,
   * plus the current selection (a rule may reference someone no longer set up
   * — keep them visible rather than silently dropping the reference).
   */
  function peopleFor(positionId: string, keepId?: string): { id: string; name: string }[] {
    const list: { id: string; name: string }[] = []
    const seen = new Set<string>()
    for (const m of members ?? []) {
      const eligible =
        positionId === '' || m.team_member_positions.some((tp) => tp.position_id === positionId)
      if (!eligible || seen.has(m.person_id)) continue
      seen.add(m.person_id)
      list.push({ id: m.person_id, name: fullName(m.people) })
    }
    if (keepId && !seen.has(keepId)) {
      list.push({ id: keepId, name: personNameById.get(keepId) ?? 'Removed person' })
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }

  function setEffect(index: number, patch: Partial<EffectDraft>) {
    setEffects((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)))
  }

  async function submit() {
    setFormError(null)
    const trimmed = name.trim()
    if (!trimmed) return setFormError('Give the rule a name.')
    if (!triggerPositionId) return setFormError('Pick the position the rule watches.')
    if (conditionChoice === 'person' && !conditionPersonId) {
      return setFormError('Pick the person the rule watches for.')
    }

    const cleanEffects: RuleEffect[] = []
    const dupKeys = new Set<string>()
    for (const e of effects) {
      if (!e.targetPositionId) continue
      let effect: RuleEffect
      if (e.kind === 'count') {
        effect = {
          kind: 'count',
          targetPositionId: e.targetPositionId,
          minCount: Math.max(0, Number.parseInt(e.minCount, 10) || 0),
        }
      } else if (e.kind === 'person') {
        if (!e.personId) {
          return setFormError(
            `Pick the person required on ${positionName(e.targetPositionId)}.`,
          )
        }
        effect = { kind: 'person', targetPositionId: e.targetPositionId, personId: e.personId }
      } else {
        effect = { kind: 'same-person', targetPositionId: e.targetPositionId }
      }
      // Matches the DB's partial unique indexes: one count and one same-person
      // row per target; one row per (target, person) for named people.
      const key = `${effect.kind}|${effect.targetPositionId}|${effect.kind === 'person' ? effect.personId : ''}`
      if (dupKeys.has(key)) {
        return setFormError('Two of the requirements say the same thing — remove one.')
      }
      dupKeys.add(key)
      cleanEffects.push(effect)
    }
    if (cleanEffects.length === 0) {
      return setFormError('Add at least one requirement.')
    }

    const condition: RuleCondition =
      conditionChoice === 'person'
        ? { kind: 'person', personId: conditionPersonId }
        : conditionChoice === 'any'
          ? { kind: 'any' }
          : { kind: 'attribute', attribute: 'sex', value: conditionChoice }

    // Reject trigger→target loops before they're stored (the resolver would
    // only break them defensively).
    const candidate: ConditionalRule = {
      id: editing?.id ?? 'candidate',
      name: trimmed,
      serviceTypeId: serviceTypeId === ALL_TYPES ? null : serviceTypeId,
      triggerPositionId,
      condition,
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
      condition,
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit rule' : 'New rule'}</DialogTitle>
          <DialogDescription>
            When the person in one position matches a condition, other positions
            need certain people or numbers.
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
              <Select
                value={conditionChoice}
                onValueChange={(v) => setConditionChoice(v as ConditionChoice)}
              >
                <SelectTrigger className="w-full sm:w-44" aria-label="Condition">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">is female</SelectItem>
                  <SelectItem value="male">is male</SelectItem>
                  <SelectItem value="person">is a specific person…</SelectItem>
                  <SelectItem value="any">is anyone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {conditionChoice === 'person' && (
              <Select value={conditionPersonId} onValueChange={setConditionPersonId}>
                <SelectTrigger className="w-full" aria-label="Trigger person">
                  <SelectValue placeholder="Pick the person" />
                </SelectTrigger>
                <SelectContent>
                  {peopleFor(triggerPositionId, conditionPersonId || undefined).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>…then require</Label>
            {effects.map((effect, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Select
                    value={effect.kind}
                    onValueChange={(v) => setEffect(i, { kind: v as EffectDraft['kind'] })}
                  >
                    <SelectTrigger className="w-40 shrink-0" aria-label="Requirement type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="count">at least…</SelectItem>
                      <SelectItem value="person">a specific person…</SelectItem>
                      <SelectItem value="same-person">the same person</SelectItem>
                    </SelectContent>
                  </Select>
                  {effect.kind === 'count' && (
                    <Input
                      type="number"
                      min={0}
                      className="w-16"
                      value={effect.minCount}
                      onChange={(e) => setEffect(i, { minCount: e.target.value })}
                      aria-label="Minimum people"
                    />
                  )}
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
                      aria-label="Remove this requirement"
                      title="Remove this requirement"
                      onClick={() => setEffects((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
                {effect.kind === 'person' && (
                  <Select
                    value={effect.personId}
                    onValueChange={(v) => setEffect(i, { personId: v })}
                  >
                    <SelectTrigger className="w-full" aria-label="Required person">
                      <SelectValue placeholder="Pick the person" />
                    </SelectTrigger>
                    <SelectContent>
                      {peopleFor(effect.targetPositionId, effect.personId || undefined).map(
                        (p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                setEffects((prev) => [
                  ...prev,
                  { kind: 'count', targetPositionId: '', minCount: '1', personId: '' },
                ])
              }
            >
              <Plus className="size-4" />
              Add another requirement
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

/**
 * Health warnings for one rule — surfaced instead of letting a rule silently
 * misbehave: a deleted person (the rule no longer fires), someone on a break,
 * or someone no longer set up for the position the rule involves them in.
 */
function ruleWarnings(
  rule: ConditionalRule,
  row: ConditionalRuleRow | undefined,
  eligiblePersonIds: (positionId: string) => Set<string>,
): string[] {
  const warnings: string[] = []
  if (isRuleBroken(rule)) {
    warnings.push('A person this rule references was removed — the rule no longer applies.')
  }
  const checkPerson = (
    ref: { id: string; first_name: string; last_name: string; status: string } | null,
    positionId: string,
    role: string,
  ) => {
    if (!ref) return
    const name = fullName(ref)
    if (ref.status !== 'active') warnings.push(`${name} isn't active at the moment.`)
    if (!eligiblePersonIds(positionId).has(ref.id)) {
      warnings.push(`${name} isn't set up for the ${role} position.`)
    }
  }
  checkPerson(row?.trigger_person ?? null, rule.triggerPositionId, 'watched')
  for (const e of row?.conditional_rule_effects ?? []) {
    if (e.effect_kind === 'person') {
      checkPerson(e.required_person ?? null, e.target_position_id, 'required')
    }
  }
  return warnings
}

export function ConditionalRulesCard() {
  const rulesQuery = useAllConditionalRules()
  const setEnabled = useSetRuleEnabled()
  const deleteRule = useDeleteConditionalRule()
  const { data: teams } = useTeams()
  const { data: positions } = useAllPositions()
  const { data: serviceTypes } = useServiceTypes()
  const { data: members } = useAllTeamMembers()

  // Key the dialog by rule id (or 'new') so its internal state resets whenever
  // a different rule is opened.
  const [dialog, setDialog] = useState<{ editing: ConditionalRule | null } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ConditionalRule | null>(null)

  const rules = useMemo(
    () => (rulesQuery.data ?? []).map(toConditionalRule),
    [rulesQuery.data],
  )
  const rowById = useMemo(
    () => new Map((rulesQuery.data ?? []).map((r) => [r.id, r])),
    [rulesQuery.data],
  )
  const eligibleByPosition = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const m of members ?? []) {
      for (const tp of m.team_member_positions) {
        ;(map.get(tp.position_id) ?? map.set(tp.position_id, new Set()).get(tp.position_id)!).add(
          m.person_id,
        )
      }
    }
    return map
  }, [members])

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
            No conditional rules yet. Examples: if the Worship Leader is female,
            require 2 people on Male Vocals; if Sam leads, he also plays guitar.
          </p>
        ) : (
          rules.map((rule) => {
            const typeName = rule.serviceTypeId
              ? serviceTypes?.find((st) => st.id === rule.serviceTypeId)?.name ?? '?'
              : 'All service types'
            const warnings = ruleWarnings(
              rule,
              rowById.get(rule.id),
              (positionId) => eligibleByPosition.get(positionId) ?? new Set(),
            )
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
                    {warnings.length > 0 && (
                      <Badge
                        variant="outline"
                        className="ml-1 border-amber-300 bg-amber-50 align-middle text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                        title={warnings.join(' ')}
                      >
                        <AlertTriangle className="size-3" />
                        Needs attention
                      </Badge>
                    )}
                  </p>
                  <p className="text-muted-foreground truncate text-sm">
                    {ruleSentence(rule, positionName)} · {typeName}
                  </p>
                  {warnings.length > 0 && (
                    <p className="truncate text-xs text-amber-700 dark:text-amber-400">
                      {warnings.join(' ')}
                    </p>
                  )}
                </div>
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(checked) => toggle(rule, checked)}
                  aria-label={`Enable rule ${rule.name}`}
                  title={`Turn ${rule.name} on or off`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit rule ${rule.name}`}
                  title={`Edit ${rule.name}`}
                  onClick={() => setDialog({ editing: rule })}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete rule ${rule.name}`}
                  title={`Delete ${rule.name}`}
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
