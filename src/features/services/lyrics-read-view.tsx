import { useState } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  hasAnyLayer,
  LAYER_LABELS,
  LYRIC_LAYER_KEYS,
  splitChordLine,
  zipLyricLines,
  type LayeredLyrics,
  type LyricLayerKey,
} from '@/features/services/lyric-layers'
import { cn } from '@/lib/utils'

/**
 * A chord line with its `[…]` chords picked out in the accent colour.
 *
 * The brackets are kept, dimmed: they are what separates a chord from the
 * syllable it sits against in a full ChordPro line ("[G]Amazing"), where weight
 * and colour alone would read as one run-on word. Anything outside a bracket is
 * left in the muted body style, so a bare chord row looks like chords and an
 * inline line looks like lyrics with chords over them.
 */
function ChordLine({ text }: { text: string }) {
  return (
    <div className="text-muted-foreground text-xs whitespace-pre-wrap">
      {splitChordLine(text).map((segment, i) =>
        segment.chord ? (
          <span key={i} className="text-primary font-semibold">
            <span className="opacity-50">[</span>
            {segment.text}
            <span className="opacity-50">]</span>
          </span>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </div>
  )
}

/**
 * Read-only lyrics with their layers stacked around each line (#139).
 *
 * Chords sit **above** the line they belong to — that is where a musician reads
 * them, even though the editor puts them beside it — with the native script and
 * the English gloss below. Layers are toggled per reader and default to off, so
 * the sheet still opens as plain lyrics for everyone who only wants to sing.
 *
 * Every layer is set in the proportional body face: chords are placed by
 * their `[…]` brackets rather than by column, so nothing here needs a monospace
 * grid, and the native script in particular renders far better without one.
 *
 * Falls back to the plain text when no layer carries anything, which is every
 * English song and every song entered before this existed.
 */
export function LyricsReadView({
  layers,
  className,
}: {
  layers: LayeredLyrics
  className?: string
}) {
  const available = LYRIC_LAYER_KEYS.filter((key) => layers[key].trim() !== '')
  const [shown, setShown] = useState<LyricLayerKey[]>([])

  if (!hasAnyLayer(layers)) {
    return (
      <pre
        className={cn(
          'text-muted-foreground font-sans text-sm whitespace-pre-wrap',
          className,
        )}
      >
        {layers.lyrics}
      </pre>
    )
  }

  const on = (key: LyricLayerKey) => shown.includes(key)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <ToggleGroup
        type="multiple"
        value={shown}
        onValueChange={(next) => setShown(next as LyricLayerKey[])}
        className="self-start"
      >
        {available.map((key) => (
          <ToggleGroupItem
            key={key}
            value={key}
            title={`${on(key) ? 'Hide' : 'Show'} the ${LAYER_LABELS[key].toLowerCase()} line under each lyric`}
          >
            {LAYER_LABELS[key]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="text-sm">
        {zipLyricLines(layers).map((line, i) => (
          <div key={i} className={line.text.trim() === '' ? 'h-3' : 'py-0.5'}>
            {on('chords') && line.chords.trim() !== '' && (
              <ChordLine text={line.chords} />
            )}
            <div className="whitespace-pre-wrap">{line.text}</div>
            {on('native') && line.native.trim() !== '' && (
              <div className="text-muted-foreground whitespace-pre-wrap">
                {line.native}
              </div>
            )}
            {on('meaning') && line.meaning.trim() !== '' && (
              <div className="text-muted-foreground text-xs italic whitespace-pre-wrap">
                {line.meaning}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
