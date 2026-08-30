import { format, parseISO } from 'date-fns'
import { chordsIn, parseSongKey, type ChordNotation } from '@/features/services/chord-notation'
import {
  isInlineChordLine,
  splitChordLine,
  zipLyricLines,
} from '@/features/services/lyric-layers'
import { lyricsSheetMeta, type LyricsSheetEntry } from '@/features/services/service-utils'

export interface LyricsSheetPdfOptions {
  serviceName: string
  /** Plan date as 'yyyy-MM-dd'. */
  planDate: string
  churchName?: string | null
  entries: LyricsSheetEntry[]
  /** Print the English gloss under each line (#139). */
  meaning?: boolean
  /**
   * Print chords above each line (#139). Chords are placed by their `[…]`
   * brackets rather than by column, so the sheet stays in the proportional
   * face throughout and each bracketed chord is simply set in bold.
   *
   * The native-script layer is deliberately not offered here: jsPDF's core
   * fonts carry no Indic glyphs, and even with an embedded Noto face its
   * shaping neither forms conjuncts nor reorders pre-base vowel signs. The
   * Latin transliteration is what makes this sheet printable at all.
   */
  chords?: boolean
  /**
   * Which notation to print the chords in. They are stored as numbers of the
   * key, so this is a choice about the printout, not a conversion of the song
   * — and it follows the switch on screen, so what is printed is what was
   * being read when Print was pressed.
   */
  notation?: ChordNotation
}

/**
 * Two-column lyrics sheet PDF (issue #26). jsPDF has no native column flow, so
 * we lay it out by hand: a cursor fills the left column top-to-bottom, spills
 * into the right column, then onto a new page. Songs follow setlist order.
 * jsPDF is dynamically imported so it stays out of the main bundle.
 *
 * Filename: LyricsSheet-<ServiceName>-<YYYYMMDD>.pdf
 */
export async function downloadLyricsSheetPdf(opts: LyricsSheetPdfOptions) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF() // A4 portrait, millimetres

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const marginX = 14
  const marginTop = 16
  const marginBottom = 16
  const gutter = 8
  const cols = 2
  const colWidth = (pageW - marginX * 2 - gutter * (cols - 1)) / cols
  const contentBottom = pageH - marginBottom

  const dateLong = format(parseISO(opts.planDate), 'EEE d MMM yyyy')
  const dateShort = format(parseISO(opts.planDate), 'd MMM yyyy')

  let col = 0
  let bodyTop = marginTop
  let y = marginTop
  let pageNum = 1

  const colX = () => marginX + col * (colWidth + gutter)

  function footer(n: number) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(`${opts.serviceName} · ${dateShort}`, marginX, pageH - 8)
    doc.text(`Page ${n}`, pageW - marginX, pageH - 8, { align: 'right' })
  }

  // -- page 1 header --------------------------------------------------------
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120)
  if (opts.churchName) doc.text(opts.churchName, marginX, marginTop)
  const titleY = opts.churchName ? marginTop + 7 : marginTop
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(20)
  doc.text(`${opts.serviceName} — ${dateLong}`, marginX, titleY)
  doc.setDrawColor(210)
  doc.line(marginX, titleY + 3, pageW - marginX, titleY + 3)
  bodyTop = titleY + 9
  y = bodyTop

  function advanceColumn() {
    if (col < cols - 1) {
      col += 1
      y = bodyTop
    } else {
      footer(pageNum)
      doc.addPage()
      pageNum += 1
      col = 0
      bodyTop = marginTop
      y = marginTop
    }
  }

  function atColumnTop() {
    return y <= bodyTop + 0.01
  }

  function drawWrapped(
    text: string,
    size: number,
    style: 'normal' | 'bold' | 'italic',
    color: number,
    lineHeight: number,
  ) {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(text, colWidth) as string[]
    for (const line of lines) {
      if (y + lineHeight > contentBottom) advanceColumn()
      doc.setFont('helvetica', style)
      doc.setFontSize(size)
      doc.setTextColor(color)
      doc.text(line, colX(), y)
      y += lineHeight
    }
  }

  /**
   * A chord line, with its `[…]` chords in bold and anything between them (the
   * syllables of a full ChordPro line) in the lighter body weight.
   *
   * jsPDF draws one style per call, so this lays the line out piece by piece
   * and measures as it goes — `drawWrapped` can't mix weights within a line.
   * Pieces break at whitespace, and a row that wraps drops the space it broke
   * on so the continuation starts hard against the margin.
   */
  function drawChordLine(
    line: string,
    size: number,
    lineHeight: number,
    wordColor: number,
  ) {
    const pieces = splitChordLine(line).flatMap((segment) =>
      (segment.chord ? `[${segment.text}]` : segment.text)
        .split(/(\s+)/)
        .filter((part) => part !== '')
        .map((text) => ({ text, chord: segment.chord })),
    )
    const measure = (piece: { text: string; chord: boolean }) => {
      doc.setFont('helvetica', piece.chord ? 'bold' : 'normal')
      doc.setFontSize(size)
      return doc.getTextWidth(piece.text)
    }

    if (y + lineHeight > contentBottom) advanceColumn()
    let x = colX()
    for (const piece of pieces) {
      const width = measure(piece)
      if (x > colX() && x + width > colX() + colWidth) {
        y += lineHeight
        if (y + lineHeight > contentBottom) advanceColumn()
        x = colX()
        if (piece.text.trim() === '') continue
      }
      doc.setFont('helvetica', piece.chord ? 'bold' : 'normal')
      doc.setFontSize(size)
      doc.setTextColor(piece.chord ? 60 : wordColor)
      doc.text(piece.text, x, y)
      x += width
    }
    y += lineHeight
  }

  const TITLE_SIZE = 11
  const META_SIZE = 8
  const LYRIC_SIZE = 9.5
  const MEANING_SIZE = 8
  const MEANING_LH = 3.6
  const CHORD_LH = 3.8
  const TITLE_LH = 5.2
  const META_LH = 4
  const LYRIC_LH = 4.3
  const STANZA_GAP = 2.6
  const SONG_GAP = 4.5

  for (const entry of opts.entries) {
    const meta = lyricsSheetMeta(entry)
    // Keep the title (and its meta line) with the first lines of lyrics so a
    // song title never strands at the bottom of a column.
    const keepTogether = TITLE_LH + (meta ? META_LH : 0) + LYRIC_LH * 2
    if (!atColumnTop() && y + keepTogether > contentBottom) advanceColumn()

    drawWrapped(entry.title, TITLE_SIZE, 'bold', 15, TITLE_LH)
    if (meta) drawWrapped(meta, META_SIZE, 'italic', 120, META_LH)
    y += 1

    if (entry.lyrics && entry.lyrics.trim()) {
      // Chords sit above the line they belong to, bracketed rather than
      // column-positioned, so the whole sheet stays proportional.
      // Read the stored numbers back in the key this plan plays the song in.
      const layers = {
        ...entry.layers,
        chords: chordsIn(entry.layers.chords, opts.notation ?? 'numbers', parseSongKey(entry.key)),
      }
      for (const line of zipLyricLines(layers)) {
        const showChords = opts.chords && line.chords.trim() !== ''
        // An inline chord line carries the words its chords are anchored to,
        // so it is drawn *as* the lyric row — at the lyric's leading and in
        // the lyric's ink — rather than as a lighter row above a second copy.
        const replaced = showChords && isInlineChordLine(line.chords)
        if (line.text.trim() === '' && !showChords) {
          if (!atColumnTop()) y += STANZA_GAP // preserve stanza breaks
          continue
        }
        if (showChords) {
          drawChordLine(
            line.chords,
            LYRIC_SIZE,
            replaced ? LYRIC_LH : CHORD_LH,
            replaced ? 30 : 120,
          )
        }
        if (!replaced) drawWrapped(line.text, LYRIC_SIZE, 'normal', 30, LYRIC_LH)
        if (opts.meaning && line.meaning.trim() !== '') {
          drawWrapped(line.meaning, MEANING_SIZE, 'italic', 125, MEANING_LH)
        }
      }
    } else {
      drawWrapped('(no lyrics added)', LYRIC_SIZE, 'italic', 150, LYRIC_LH)
    }
    y += SONG_GAP
  }

  footer(pageNum)

  const safeName = opts.serviceName.replace(/[^\w-]+/g, '') || 'Service'
  const safeDate = opts.planDate.replace(/-/g, '')
  doc.save(`LyricsSheet-${safeName}-${safeDate}.pdf`)
}
