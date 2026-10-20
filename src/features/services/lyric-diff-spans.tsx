import { Fragment, type ReactNode } from 'react'
import { splitChordLine } from '@/features/services/lyric-layers'
import type { TextDiff } from '@/features/services/lyric-diff'
import { cn } from '@/lib/utils'

const overlaps = (ranges: Array<[number, number]>, start: number, end: number) =>
  ranges.some(([from, to]) => from < end && to > start)

/** `text` (starting at `offset` in its line), with the inserted parts in red. */
function marked(text: string, offset: number, ranges: Array<[number, number]>) {
  const pieces: ReactNode[] = []
  let cursor = 0
  for (const [from, to] of ranges) {
    const start = Math.max(from - offset, cursor)
    const end = Math.min(to - offset, text.length)
    if (end <= start) continue
    if (start > cursor) pieces.push(text.slice(cursor, start))
    pieces.push(
      <span key={start} className="text-destructive">
        {text.slice(start, end)}
      </span>,
    )
    cursor = end
  }
  if (cursor < text.length) pieces.push(text.slice(cursor))
  return pieces
}

/**
 * A pane's text with what isn't saved in red — the overlay the lyrics editor
 * lays over a pane once it loses focus (`diffText` says what). With `chords`,
 * bracketed chords are picked out as `ChordSpans` does, in the accent colour,
 * and a chord that changed is red until it is saved.
 *
 * Spans and newlines only, so the caller's `whitespace-pre`/`pre-wrap` box
 * lays it out exactly like the textarea underneath.
 */
export function DiffSpans({
  text,
  diff,
  chords = false,
}: {
  text: string
  diff: TextDiff
  chords?: boolean
}) {
  return (
    <>
      {text.split('\n').map((line, lineIndex) => {
        const ranges = diff.changed.get(lineIndex)?.inserted ?? []
        let offset = 0
        return (
          <Fragment key={lineIndex}>
            {lineIndex > 0 && '\n'}
            {chords
              ? splitChordLine(line).map((segment, i) => {
                  const start = offset
                  if (!segment.chord) {
                    offset += segment.text.length
                    return <span key={i}>{marked(segment.text, start, ranges)}</span>
                  }
                  // "[" + chord + "]", as the token matched it.
                  offset += segment.text.length + 2
                  const changed = overlaps(ranges, start, offset)
                  return (
                    <span
                      key={i}
                      className={cn(
                        'font-semibold',
                        changed ? 'text-destructive' : 'text-primary',
                      )}
                    >
                      <span className="opacity-50">[</span>
                      {segment.text}
                      <span className="opacity-50">]</span>
                    </span>
                  )
                })
              : marked(line, 0, ranges)}
          </Fragment>
        )
      })}
    </>
  )
}
