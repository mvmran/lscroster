import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Standard empty state: muted icon + short title + optional hint and action.
 * `card` renders its own Card (page-level empties); `plain` renders a dashed
 * inset box for use inside an existing Card.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  variant = 'card',
  className,
}: {
  icon?: LucideIcon
  title: string
  hint?: ReactNode
  action?: ReactNode
  variant?: 'card' | 'plain'
  className?: string
}) {
  const body = (
    <div className="flex flex-col items-center gap-2 text-center">
      {Icon && <Icon className="text-muted-foreground size-8" aria-hidden />}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
  if (variant === 'plain') {
    return (
      <div className={cn('rounded-md border border-dashed p-6', className)}>
        {body}
      </div>
    )
  }
  return (
    <Card className={className}>
      <CardContent className="py-12">{body}</CardContent>
    </Card>
  )
}
