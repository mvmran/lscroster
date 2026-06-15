import { AlertCircle, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { RULE_SHORT_LABELS, type RuleResult } from '@/features/scheduling/validate-service'

const ERROR_CLASS = 'border-red-500/50 text-red-700 dark:text-red-400'
const WARNING_CLASS = 'border-amber-500/50 text-amber-700 dark:text-amber-400'

/**
 * Render a small badge per validation result — red for errors, amber for
 * warnings — with the full message as the hover title. Shared by the scheduling
 * panel and the matrix so live badges look identical everywhere (issue #34).
 */
export function RuleBadges({
  results,
  className,
}: {
  results: RuleResult[]
  className?: string
}) {
  if (results.length === 0) return null
  return (
    <>
      {results.map((r, i) => {
        const isError = r.severity === 'error'
        const Icon = isError ? AlertTriangle : AlertCircle
        return (
          <Badge
            key={`${r.code}-${i}`}
            variant="outline"
            title={r.message}
            className={`shrink-0 ${isError ? ERROR_CLASS : WARNING_CLASS} ${className ?? ''}`}
          >
            <Icon className="size-3" />
            {RULE_SHORT_LABELS[r.code] ?? r.code}
          </Badge>
        )
      })}
    </>
  )
}
