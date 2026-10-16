import { SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PadButton } from '@/features/services/key-sound-buttons'
import { usePadSettings } from '@/features/settings/use-pad-settings'
import { padPresetFor } from '@/lib/pad-settings'

/**
 * Settings → Pad sound, for everyone: which pad they have, a quick listen, and
 * the way into the full page where they choose or tune it.
 */
export function PadSoundCard() {
  const { settings, isPending } = usePadSettings()
  const name = padPresetFor(settings)?.name ?? 'Custom'
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pad sound</CardTitle>
        <CardDescription>
          The pad the waveform buttons play on songs and Lyrics Sheets — just for you.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <span className="text-sm">
          <span className="text-muted-foreground">Now: </span>
          <span className="font-medium">{isPending ? '…' : name}</span>
        </span>
        <PadButton songKey="G" />
        <Button asChild variant="outline">
          <Link to="/settings/pad-sound">
            <SlidersHorizontal className="size-4" />
            Choose pad sound
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
