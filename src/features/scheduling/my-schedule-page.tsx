import { CalendarCheck } from 'lucide-react'
import { PagePlaceholder } from '@/components/page-placeholder'

export function MySchedulePage() {
  return (
    <PagePlaceholder
      title="My Schedule"
      description="Your pending scheduling requests, upcoming dates and blockouts."
      phase="Phase 3"
      icon={CalendarCheck}
    />
  )
}
