import { CalendarDays } from 'lucide-react'
import { PagePlaceholder } from '@/components/page-placeholder'

export function ServicesPage() {
  return (
    <PagePlaceholder
      title="Services"
      description="Service types, dated plans, the order of service and the song library."
      phase="Phase 2"
      icon={CalendarDays}
    />
  )
}
