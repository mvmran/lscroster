import type { ComponentProps } from 'react'
import { Badge } from '@/components/ui/badge'
import { STATUS_OUTLINE, STATUS_SOFT, type StatusTone } from '@/lib/status'
import { cn } from '@/lib/utils'

/**
 * A Badge in one of the canonical semantic tones. `soft` is the filled
 * at-a-glance style; `outline` the quieter bordered style.
 */
export function StatusBadge({
  tone,
  variant = 'soft',
  className,
  ...props
}: Omit<ComponentProps<typeof Badge>, 'variant'> & {
  tone: StatusTone
  variant?: 'soft' | 'outline'
}) {
  return (
    <Badge
      variant={variant === 'outline' ? 'outline' : 'secondary'}
      className={cn(
        variant === 'outline' ? STATUS_OUTLINE[tone] : STATUS_SOFT[tone],
        className,
      )}
      {...props}
    />
  )
}
