import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { initials } from '@/features/people/person-utils'
import type { Person } from '@/features/people/use-people'
import { cn } from '@/lib/utils'

interface PersonAvatarProps {
  person: Pick<Person, 'first_name' | 'last_name'>
  photoUrl?: string | null
  className?: string
}

export function PersonAvatar({ person, photoUrl, className }: PersonAvatarProps) {
  return (
    <Avatar className={cn('size-9', className)}>
      {photoUrl && <AvatarImage src={photoUrl} alt={fullNameAlt(person)} />}
      <AvatarFallback>{initials(person)}</AvatarFallback>
    </Avatar>
  )
}

function fullNameAlt(person: Pick<Person, 'first_name' | 'last_name'>) {
  return `${person.first_name} ${person.last_name}`
}
