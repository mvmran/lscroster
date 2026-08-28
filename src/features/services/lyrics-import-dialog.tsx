import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { parseImportedLyrics } from '@/features/services/lyric-import'
import type { LayeredLyrics } from '@/features/services/lyric-layers'

const PLACEHOLDER = [
  'Verse 1',
  '<native script>',
  'Transliteration',
  '<singable text>',
  'Meaning',
  '<English meaning>',
].join('\n')

/**
 * Paste a song in the team's plain-text format and add it to the editor.
 *
 * The paste is parsed live so the summary can say what was recognised before
 * anything lands: a wrong paste is caught here rather than in a wall of text.
 * Nothing is saved — the parsed lines are appended to the editor buffer, where
 * they are reviewed and saved like any other edit.
 */
export function LyricsImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (layers: LayeredLyrics) => void
}) {
  const [text, setText] = useState('')
  const parsed = useMemo(() => parseImportedLyrics(text), [text])
  const empty = parsed.layers.lyrics === ''

  function close(next: boolean) {
    if (!next) setText('')
    onOpenChange(next)
  }

  const summary = empty
    ? 'Nothing to import yet.'
    : [
        parsed.sections === 0
          ? 'No section headers'
          : `${parsed.sections} section${parsed.sections === 1 ? '' : 's'}`,
        parsed.hasNative ? 'native' : null,
        parsed.hasMeaning ? 'meaning' : null,
      ]
        .filter(Boolean)
        .join(' · ')

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import lyrics</DialogTitle>
          <DialogDescription>
            Paste the song below. Lines under a{' '}
            <span className="font-mono">Transliteration</span> heading become the
            lyrics, the text above it the native script, and lines under{' '}
            <span className="font-mono">Meaning</span> the English meaning — an
            English song with neither heading imports as lyrics alone. Whatever
            you import is added to the end of the editor; nothing already there
            is replaced.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          autoFocus
          aria-label="Lyrics to import"
          placeholder={PLACEHOLDER}
          className="min-h-40 flex-1 font-sans text-sm"
        />
        <p className="text-muted-foreground text-xs">{summary}</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          {/* A disabled button swallows its own title, so the reason rides on
              a wrapper span instead. */}
          <span
            className="inline-flex"
            title={empty ? 'Paste a song above first' : undefined}
          >
            <Button
              type="button"
              disabled={empty}
              onClick={() => {
                onImport(parsed.layers)
                close(false)
              }}
              title="Add the pasted song to the end of the lyrics"
            >
              Add to lyrics
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
