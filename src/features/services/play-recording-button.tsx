import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { playableUrl } from '@/features/services/service-utils'

/**
 * A small ▶ that opens a reference recording in a new tab — YouTube and the like
 * start playing there. Greyed out, with the reason as its hint, until the box
 * holds a full http(s) link.
 */
export function PlayRecordingButton({ url }: { url: string }) {
  const href = playableUrl(url)
  if (!href) {
    return (
      // A disabled Button has pointer-events: none, so the hint lives on a span.
      <span
        className="inline-flex"
        title={
          url.trim() === ''
            ? 'Add a link to play it'
            : 'Enter a full link starting with http:// or https:// to play it'
        }
      >
        <Button variant="outline" size="icon" disabled aria-label="Play recording">
          <Play className="size-4" />
        </Button>
      </span>
    )
  }
  return (
    <Button variant="outline" size="icon" className="shrink-0" asChild>
      {/* With asChild the child wins, so the hint goes on the link itself. */}
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        title="Play in a new tab"
        aria-label="Play this recording in a new tab"
      >
        <Play className="size-4 fill-current" />
      </a>
    </Button>
  )
}
