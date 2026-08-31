/**
 * ChordPro directives — the `{…}` lines a proper ChordPro file carries.
 *
 * ```
 * {title:It Is Well With My Soul}
 * {key: C}
 * {comment: Verse 2}
 * ```
 *
 * The chords in such a file are already the bracket notation this app stores,
 * so those import unchanged. The directives are the part that used to go
 * wrong: every one of them is a line, and a line that is not recognised is a
 * line to sing. A song imported this way came in with `{title:…}` as its first
 * lyric and no sections at all, because `{comment: Verse}` is where its
 * structure lives.
 *
 * So every `{…}` line is taken as a directive and none survives as a lyric:
 *
 * - **Structure** — `{comment: Verse 2}`, `{start_of_chorus}` — becomes the
 *   plain header line the rest of the importer already understands, but only
 *   when it names a section. `{comment: Capo 2}` is a note to the band and is
 *   left where it was written.
 * - **Metadata** — title, artist, key, tempo, time — is collected and handed
 *   back for the import dialog to offer, rather than being applied behind
 *   anyone's back.
 * - **Anything else** — `{ccli}`, `{end_of_chorus}`, `{x_custom}` — is dropped.
 *   Carrying an unknown directive into the words is the one outcome that is
 *   certainly wrong.
 */

import { matchLyricSectionHeader } from '@/features/services/lyric-sections'

/** What a ChordPro file says about the song, where it says anything. */
export interface ImportedMetadata {
  title: string | null
  artist: string | null
  /** The key the chart is written in — what its chords are numbered against. */
  key: string | null
  bpm: number | null
  meter: string | null
}

export const EMPTY_METADATA: ImportedMetadata = {
  title: null,
  artist: null,
  key: null,
  bpm: null,
  meter: null,
}

/** True when a file said nothing we can use. */
export function hasMetadata(meta: ImportedMetadata): boolean {
  return Object.values(meta).some((value) => value !== null)
}

/** `{name: value}` — the name, and whatever is left inside the braces. */
const DIRECTIVE = /^\s*\{\s*([a-zA-Z_]+)\s*:?\s*([^}]*?)\s*\}\s*$/

/** ChordPro's short forms are as common as the long ones. */
const ALIASES: Record<string, string> = {
  t: 'title',
  st: 'subtitle',
  su: 'subtitle',
  a: 'artist',
  k: 'key',
  c: 'comment',
  ci: 'comment',
  cb: 'comment',
  bpm: 'tempo',
  meter: 'time',
}

/**
 * `{start_of_chorus}` and friends: a section named by the directive itself.
 * The closing `{end_of_…}` carries nothing and is simply dropped.
 */
const SECTION_OPEN = /^start_of_(.+)$/
const SHORT_OPEN: Record<string, string> = {
  soc: 'chorus',
  sov: 'verse',
  sob: 'bridge',
}

/**
 * Read the directives out of a paste.
 *
 * Returns the text with every `{…}` line resolved — to a header, to nothing,
 * or left alone when it is a genuine note — and whatever the file said about
 * itself. Idempotent: the result holds no directives, so running it twice
 * changes nothing (and reports no metadata the second time).
 */
export function stripDirectives(text: string): {
  text: string
  metadata: ImportedMetadata
} {
  const metadata: ImportedMetadata = { ...EMPTY_METADATA }
  const out: string[] = []

  for (const line of text.split('\n')) {
    const match = DIRECTIVE.exec(line)
    if (!match) {
      out.push(line)
      continue
    }
    const raw = match[1].toLowerCase()
    const name = ALIASES[raw] ?? raw
    const value = match[2].trim()

    // A section the directive names rather than describes.
    const opened = SHORT_OPEN[raw] ?? SECTION_OPEN.exec(name)?.[1]
    if (opened) {
      const header = matchLyricSectionHeader(opened.replace(/_/g, ' '))
      if (header) out.push(header.label)
      continue
    }

    if (name === 'comment') {
      // Its structure lives here in most files, but not every comment is a
      // section — keep the ones that are notes, without their braces.
      const header = matchLyricSectionHeader(value)
      out.push(header ? header.label : value)
      continue
    }

    switch (name) {
      case 'title':
        metadata.title ??= value || null
        break
      case 'artist':
      case 'subtitle':
        metadata.artist ??= value || null
        break
      case 'key':
        metadata.key ??= value || null
        break
      case 'tempo': {
        const bpm = Number.parseInt(value, 10)
        if (Number.isInteger(bpm) && bpm > 0) metadata.bpm ??= bpm
        break
      }
      case 'time':
        metadata.meter ??= value || null
        break
      default:
        // Unknown, or a closing directive: not a lyric either way.
        break
    }
  }

  return { text: out.join('\n'), metadata }
}
