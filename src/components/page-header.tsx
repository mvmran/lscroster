import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Standard page chrome: optional back-link, an h1 title (with optional muted
 * count suffix and description) and a right-aligned actions slot that wraps
 * under the title on small screens.
 */
export function PageHeader({
  title,
  count,
  description,
  backTo,
  backLabel = 'Back',
  actions,
  className,
}: {
  title: ReactNode
  count?: number
  description?: ReactNode
  backTo?: string
  backLabel?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {backTo && (
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1" asChild>
            <Link to={backTo}>
              <ArrowLeft className="size-4" />
              {backLabel}
            </Link>
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {title}
          {count != null && (
            <span className="text-muted-foreground ml-2 text-base font-normal tabular-nums">
              {count}
            </span>
          )}
        </h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {description && (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}
    </div>
  )
}
