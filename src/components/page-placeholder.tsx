import type { LucideIcon } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface PagePlaceholderProps {
  title: string
  description: string
  phase: string
  icon: LucideIcon
}

export function PagePlaceholder({
  title,
  description,
  phase,
  icon: Icon,
}: PagePlaceholderProps) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <Card>
        <CardHeader className="items-center text-center">
          <Icon className="text-muted-foreground mx-auto mb-2 size-10" />
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-center text-sm">
          Planned for {phase}.
        </CardContent>
      </Card>
    </div>
  )
}
