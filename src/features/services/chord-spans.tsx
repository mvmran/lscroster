import { Fragment } from 'react'
import { splitChordLine } from '@/features/services/lyric-layers'

/**
 * Chord text with its `[…]` chords picked out in the accent colour.
 *
 * The brackets are kept, dimmed: they are what separates a chord from the
 * syllable it sits against in a full ChordPro line ("[G]Amazing"), where weight
 * and colour alone would read as one run-on word.
 *
 * Spans only, no wrapper — the caller supplies the box, because the two callers
 * want different ones: the read sheet sets a single chord line, the editor lays
 * a whole pane over its textarea. Line breaks are emitted as newlines rather
 * than elements, so a caller that preserves them (`whitespace-pre`) keeps a
 * blank chord row occupying its line and stays in step with the lyrics beside
 * it.
 */
export function ChordSpans({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, lineIndex) => (
        <Fragment key={lineIndex}>
          {lineIndex > 0 && '\n'}
          {splitChordLine(line).map((segment, i) =>
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
        </Fragment>
      ))}
    </>
  )
}
