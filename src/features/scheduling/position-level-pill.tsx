import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  otherProficiency,
  PROFICIENCY_BADGE_CLASSES,
  PROFICIENCY_LABELS,
  type Proficiency,
} from '@/features/scheduling/scheduling-utils'

/**
 * A position a member can fill, showing its proficiency level (issue #30).
 * Trainees are flagged so leaders notice them on a roster. When `canManage` is
 * set the pill is a button that toggles the level (trainee ⇄ qualified).
 */
export function PositionLevelPill({
  name,
  proficiency,
  canManage,
  onToggle,
  disabled,
}: {
  name: string
  proficiency: Proficiency
  canManage: boolean
  onToggle?: () => void
  disabled?: boolean
}) {
  const isTrainee = proficiency === 'trainee'
  const label = isTrainee ? `${name} · Trainee` : name
  const variant = isTrainee ? 'outline' : 'secondary'
  const classes = cn(isTrainee && PROFICIENCY_BADGE_CLASSES.trainee)

  if (!canManage || !onToggle) {
    return (
      <Badge variant={variant} className={classes}>
        {label}
      </Badge>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={`Mark as ${PROFICIENCY_LABELS[otherProficiency(proficiency)]}`}
      className="rounded-full disabled:opacity-50"
    >
      <Badge
        variant={variant}
        className={cn(classes, 'cursor-pointer hover:opacity-80')}
      >
        {label}
      </Badge>
    </button>
  )
}
