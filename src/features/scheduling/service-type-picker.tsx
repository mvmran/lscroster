import { Check } from 'lucide-react'
import type { Tables } from '@/types/database'
import { cn } from '@/lib/utils'

/**
 * Multi-select list of service types, used when scoping a team. Mirrors the
 * "Teams required" picker on the service-type editor — they edit the same
 * service_type_teams join from opposite sides.
 */
export function ServiceTypePicker({
  serviceTypes,
  selectedIds,
  onToggle,
}: {
  serviceTypes: Tables<'service_types'>[] | undefined
  selectedIds: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="max-h-60 overflow-y-auto rounded-md border">
      {!serviceTypes || serviceTypes.length === 0 ? (
        <p className="text-muted-foreground p-3 text-sm">
          No service types yet. Create some first to scope this team.
        </p>
      ) : (
        <ul className="divide-y">
          {serviceTypes.map((st) => {
            const on = selectedIds.includes(st.id)
            return (
              <li key={st.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggle(st.id)}
                  className="hover:bg-accent flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm"
                >
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded border',
                      on
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-input',
                    )}
                  >
                    {on && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{st.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
