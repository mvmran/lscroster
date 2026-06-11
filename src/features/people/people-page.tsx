import { Users } from 'lucide-react'
import { PagePlaceholder } from '@/components/page-placeholder'

export function PeoplePage() {
  return (
    <PagePlaceholder
      title="People"
      description="Your church directory: profiles, invitations, roles and CSV import."
      phase="Phase 1"
      icon={Users}
    />
  )
}
