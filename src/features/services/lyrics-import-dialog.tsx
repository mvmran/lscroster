import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  parseImportedLyrics,
  withGeneratedMeaning,
  withGeneratedTransliteration,
  withVerseHeadings,
} from '@/features/services/lyric-import'
import { matchLyricSectionHeader } from '@/features/services/lyric-sections'
import {
  useGenerateMeaning,
  useMeaningGenerationAvailable,
} from '@/features/services/use-meaning'
import { toLines, type LayeredLyrics } from '@/features/services/lyric-layers'

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
  const [numbering, setNumbering] = useState(true)
  const [working, setWorking] = useState(false)
  // Numbering rewrites the paste before it is parsed, so the summary below
  // counts the sections that will actually land — headings included.
  const source = useMemo(
    () => (numbering ? withVerseHeadings(text) : text),
    [text, numbering],
  )
  const parsed = useMemo(() => parseImportedLyrics(source), [source])
  const labelled = toLines(text).some((line) => matchLyricSectionHeader(line) !== null)
  const { data: meaningAvailable } = useMeaningGenerationAvailable()
  const generateMeaning = useGenerateMeaning()
  // A native-only paste leaves the base blank; `lyrics` then holds headers
  // alone, or nothing at all when the paste had none.
  const empty = parsed.layers.lyrics === '' && parsed.layers.native === ''
  const generating = parsed.needsTransliteration && parsed.script !== null
  // A paste that brought its own gloss is left alone — the team's words beat a
  // model's. Otherwise native script is enough to draft one, whatever the
  // script: the model reads languages the romaniser cannot.
  const drafting = meaningAvailable === true && parsed.hasNative && !parsed.hasMeaning

  function close(next: boolean) {
    if (!next) setText('')
    onOpenChange(next)
  }

  async function add() {
    setWorking(true)
    try {
      // Generation loads a ~110KB chunk on demand. If that fails — offline, a
      // stale cache — the paste still goes in, with the base left blank for the
      // team to type. Losing a pasted song to a network hiccup is the one
      // outcome worth ruling out.
      let layers = parsed.layers
      if (parsed.script && parsed.needsTransliteration) {
        try {
          layers = await withGeneratedTransliteration(layers, parsed.script)
        } catch {
          toast.warning('Could not generate a transliteration — the base is blank.')
        }
      }
      // Same bargain for the meaning: it is drafted from the native text so
      // the three layers land together, but a failed call never costs the
      // paste — the pane simply stays empty, with the editor's own
      // "draft it from the native text" link still there.
      if (drafting) {
        try {
          const meaning = await generateMeaning.mutateAsync({
            native: layers.native,
            language: parsed.script?.language ?? null,
          })
          layers = withGeneratedMeaning(layers, meaning)
        } catch {
          toast.warning('Could not draft the meaning — the meaning layer is empty.')
        }
      }
      onImport(layers)
      close(false)
    } finally {
      setWorking(false)
    }
  }

  const summary = empty
    ? 'Nothing to import yet.'
    : [
        parsed.sections === 0
          ? 'No section headers'
          : `${parsed.sections} section${parsed.sections === 1 ? '' : 's'}`,
        parsed.hasNative ? 'native' : null,
        parsed.hasMeaning ? 'meaning' : drafting ? 'meaning will be drafted' : null,
        generating
          ? 'transliteration will be generated'
          : parsed.needsTransliteration
            ? 'no transliteration — that script needs typing by hand'
            : null,
      ]
        .filter(Boolean)
        .join(' · ')

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import lyrics</DialogTitle>
          <DialogDescription>
            Paste the song below. Lines under a{' '}
            <span className="font-mono">Transliteration</span> heading become the
            lyrics, the text above it the native script, and lines under{' '}
            <span className="font-mono">Meaning</span> (or{' '}
            <span className="font-mono">Translation</span>) the English meaning —
            an English song with neither heading imports as lyrics alone. Paste
            native script on its own and a transliteration — and, where a
            meaning is missing, an English meaning — is drafted for you to
            correct. Whatever you import is added to the end of the editor;
            nothing already there is replaced.
          </DialogDescription>
        </DialogHeader>
        {/* Songs are pasted whole, so the box takes whatever height the dialog
            has left; the floor only rises once there is a screen to raise it on. */}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={20}
          autoFocus
          aria-label="Lyrics to import"
          placeholder={PLACEHOLDER}
          className="min-h-48 flex-1 font-sans text-sm sm:min-h-[26rem]"
        />
        <div className="flex items-start gap-2 text-xs">
          <Checkbox
            id="import-number-sections"
            checked={numbering}
            onCheckedChange={(next) => setNumbering(next === true)}
          />
          <label
            htmlFor="import-number-sections"
            className="text-muted-foreground cursor-pointer"
          >
            Number the paragraphs as <span className="font-mono">Verse 1</span>,{' '}
            <span className="font-mono">Verse 2</span> …
            {labelled && (
              <> — not this paste, though: it already names its own sections.</>
            )}
          </label>
        </div>
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
              disabled={empty || working}
              onClick={add}
              title="Add the pasted song to the end of the lyrics"
            >
              {working && <Loader2 className="size-4 animate-spin" />}
              {working && drafting ? 'Drafting…' : 'Add to lyrics'}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
