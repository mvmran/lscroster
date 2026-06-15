import { format, parseISO } from 'date-fns'
import { lyricsSheetMeta, type LyricsSheetEntry } from '@/features/services/service-utils'

export interface LyricsSheetPdfOptions {
  serviceName: string
  /** Plan date as 'yyyy-MM-dd'. */
  planDate: string
  churchName?: string | null
  entries: LyricsSheetEntry[]
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

  const TITLE_SIZE = 11
  const META_SIZE = 8
  const LYRIC_SIZE = 9.5
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
      const rawLines = entry.lyrics.replace(/\r\n/g, '\n').split('\n')
      for (const raw of rawLines) {
        if (raw.trim() === '') {
          if (!atColumnTop()) y += STANZA_GAP // preserve stanza breaks
        } else {
          drawWrapped(raw, LYRIC_SIZE, 'normal', 30, LYRIC_LH)
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
