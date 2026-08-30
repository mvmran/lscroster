import { useState } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { chordsIn, parseSongKey } from '@/features/services/chord-notation'
import { useChordNotation } from '@/features/services/use-chord-notation'
import {
  hasAnyLayer,
  isInlineChordLine,
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
 * and colour alone would read as one run-on word.
 *
 * `inline` says the line carries the lyric's own words, which is what an
 * imported chord chart produces. It then stands in for the lyric line rather
 * than sitting above it, so the words are set at full size in the body colour
 * — printing them twice, once greyed and once not, is the alternative. A bare
 * row of chords keeps the muted style and stays above the line it belongs to.
 */
function ChordLine({ text, inline }: { text: string; inline?: boolean }) {
  return (
    <div
      className={cn(
        'whitespace-pre-wrap',
        inline ? 'text-sm' : 'text-muted-foreground text-xs',
      )}
    >
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
 * the English gloss below. A chord line imported from a chord chart carries the
 * lyric's own words, and stands in for the lyric row instead. Layers are toggled per reader and default to off, so
 * the sheet still opens as plain lyrics for everyone who only wants to sing.
 *
 * Every layer is set in the proportional body face: chords are placed by
 * their `[…]` brackets rather than by column, so nothing here needs a monospace
 * grid, and the native script in particular renders far better without one.
 *
 * Falls back to the plain text when no layer carries anything, which is every
 * English song and every song entered before this existed.
 *
 * Chords arrive as they are stored — numbers of the key — and are read back in
 * `songKey`, so the sheet shows the chords of the key this plan actually plays
 * the song in. `songKey` therefore wants the plan item's key override where
 * there is one, not the arrangement's own key.
 */
export function LyricsReadView({
  layers,
  songKey,
  className,
}: {
  layers: LayeredLyrics
  /** The key to read the chord numbers back in. Without it they stay numbers. */
  songKey?: string | null
  className?: string
}) {
  const available = LYRIC_LAYER_KEYS.filter((key) => layers[key].trim() !== '')
  const [shown, setShown] = useState<LyricLayerKey[]>([])
  // Read-only here: the switch that sets this lives once per screen, on the
  // card around these songs, because the choice is one the whole sheet shares.
  const [notation] = useChordNotation()
  const chords = chordsIn(layers.chords, notation, parseSongKey(songKey))

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
        {zipLyricLines({ ...layers, chords }).map((line, i) => {
          const showChords = on('chords') && line.chords.trim() !== ''
          // An inline chord line already holds the words, so the lyric row
          // below it would be a second copy of them.
          const replaced = showChords && isInlineChordLine(line.chords)
          const blank = line.text.trim() === '' && !showChords
          return (
            <div key={i} className={blank ? 'h-3' : 'py-0.5'}>
              {showChords && <ChordLine text={line.chords} inline={replaced} />}
              {!replaced && <div className="whitespace-pre-wrap">{line.text}</div>}
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
          )
        })}
      </div>
    </div>
  )
}
