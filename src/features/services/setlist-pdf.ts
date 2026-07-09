import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import {
  arrangementDisplayTitle,
  songSearchLinks,
  type ArrangementInfo,
  type Plan,
  type PlanItem,
} from '@/features/services/service-utils'

// The polished worship set-list PDF (issue #133), attached to the set-list
// email on publish. Mirrors the team's long-standing hand-made template:
// service information, who's serving, practice/service times, the song list
// with keys / BPM / reference links, and per-song flow notes. Built with
// jsPDF + autotable (both dynamically imported, like the run sheet).

interface ServingRow {
  team: string
  position: string
  names: string[]
}

export interface SetlistPdfData {
  churchName: string
  churchAddress: string | null
  times: { label: string; time: string }[]
  serving: ServingRow[]
}

/** 'HH:mm:ss' -> 'h:mmaaa' ('3:00pm'), matching the plan page. */
function timeLabel(time: string): string {
  return format(parseISO(`2000-01-01T${time}`), 'h:mmaaa')
}

/**
 * The set-list data the plan page doesn't already hold: labelled times, the
 * roster grouped team → position (teams in the plan's service-type order,
 * mirroring the publish email — issue #129), and church name/address.
 */
export async function fetchSetlistPdfData(
  planId: string,
  serviceTypeId: string,
): Promise<SetlistPdfData> {
  const [timesRes, assignmentsRes, churchRes, stTeamsRes] = await Promise.all([
    supabase
      .from('plan_times')
      .select('label, start_time, sort_order')
      .eq('plan_id', planId)
      .order('start_time'),
    supabase
      .from('plan_assignments')
      .select(
        'status, people(first_name, last_name), teams(id, name, sort_order), positions(name, sort_order)',
      )
      .eq('plan_id', planId)
      .neq('status', 'declined'),
    supabase.from('church_settings').select('name, address').maybeSingle(),
    supabase
      .from('service_type_teams')
      .select('team_id, sort_order')
      .eq('service_type_id', serviceTypeId),
  ])

  const times = (timesRes.data ?? [])
    .sort((a, b) => a.sort_order - b.sort_order || a.start_time.localeCompare(b.start_time))
    .map((t) => ({ label: t.label, time: timeLabel(t.start_time) }))

  const serviceTypeTeamSort = new Map(
    (stTeamsRes.data ?? []).map((r) => [r.team_id, r.sort_order]),
  )
  const teamSortKey = (id: string, globalSort: number) =>
    serviceTypeTeamSort.get(id) ?? 1_000_000 + globalSort

  interface TeamGroup {
    id: string
    name: string
    sort: number
    positions: Map<string, { name: string; sort: number; names: string[] }>
  }
  const teamGroups = new Map<string, TeamGroup>()
  for (const a of assignmentsRes.data ?? []) {
    const team = a.teams as unknown as { id: string; name: string; sort_order: number } | null
    const position = a.positions as unknown as { name: string; sort_order: number } | null
    const person = a.people as unknown as { first_name: string; last_name: string } | null
    if (!team || !position || !person) continue
    let group = teamGroups.get(team.id)
    if (!group) {
      group = { id: team.id, name: team.name, sort: team.sort_order, positions: new Map() }
      teamGroups.set(team.id, group)
    }
    let pos = group.positions.get(position.name)
    if (!pos) {
      pos = { name: position.name, sort: position.sort_order, names: [] }
      group.positions.set(position.name, pos)
    }
    pos.names.push(`${person.first_name} ${person.last_name}`.trim())
  }
  const serving: ServingRow[] = [...teamGroups.values()]
    .sort(
      (a, b) =>
        teamSortKey(a.id, a.sort) - teamSortKey(b.id, b.sort) ||
        a.name.localeCompare(b.name),
    )
    .flatMap((team) =>
      [...team.positions.values()]
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
        .map((p) => ({
          team: team.name,
          position: p.name,
          names: p.names.sort((a, b) => a.localeCompare(b)),
        })),
    )

  return {
    churchName: churchRes.data?.name ?? '',
    churchAddress: churchRes.data?.address ?? null,
    times,
    serving,
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

const INK: [number, number, number] = [24, 24, 27] // zinc-900
const MUTED: [number, number, number] = [113, 113, 122] // zinc-500
const LINE: [number, number, number] = [228, 228, 231] // zinc-200
const FILL: [number, number, number] = [244, 244, 245] // zinc-100
const LINK_BLUE: [number, number, number] = [37, 99, 235] // blue-600

export interface BuildSetlistPdfOptions {
  plan: Pick<Plan, 'id' | 'date' | 'title' | 'notes'>
  serviceTypeName: string
  items: PlanItem[]
  arrangementIndex: Map<string, ArrangementInfo>
  data: SetlistPdfData
}

/** The generated PDF, ready for the send-setlist Edge Function. */
export interface SetlistPdf {
  base64: string
  filename: string
}

export async function buildSetlistPdf(
  opts: BuildSetlistPdfOptions,
): Promise<SetlistPdf> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const doc = new jsPDF() // A4 portrait, millimetres
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const marginX = 14

  const dateLong = format(parseISO(opts.plan.date), 'EEEE d MMMM yyyy')
  const dateShort = format(parseISO(opts.plan.date), 'd MMM yyyy')

  // -- header band -----------------------------------------------------------
  doc.setFillColor(...INK)
  doc.rect(0, 0, pageW, 32, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(212, 212, 216)
  doc.text(opts.data.churchName.toUpperCase(), marginX, 11)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.setTextColor(255, 255, 255)
  doc.text('Worship Set List', marginX, 20)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(212, 212, 216)
  doc.text(`${opts.serviceTypeName} — ${dateLong}`, marginX, 27)

  let cursorY = 40

  function sectionHeading(title: string) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text(title.toUpperCase(), marginX, cursorY)
    cursorY += 2
  }

  function lastTableBottom(): number {
    return (
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? cursorY
    )
  }

  const labelValueStyles = {
    theme: 'grid' as const,
    margin: { left: marginX, right: marginX },
    styles: {
      fontSize: 9.5,
      cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 },
      lineColor: LINE,
      lineWidth: 0.15,
      textColor: INK,
    },
  }

  // -- service information ---------------------------------------------------
  sectionHeading('Service information')
  const infoRows: [string, string][] = [
    ['Date of service', dateLong],
    ['Service type', opts.serviceTypeName],
  ]
  if (opts.plan.title) infoRows.push(['Theme / title', opts.plan.title])
  autoTable(doc, {
    ...labelValueStyles,
    startY: cursorY,
    body: infoRows,
    columnStyles: {
      0: { cellWidth: 48, fontStyle: 'bold', fillColor: FILL },
    },
  })
  cursorY = lastTableBottom() + 8

  // -- who's serving ---------------------------------------------------------
  if (opts.data.serving.length > 0) {
    const teamCount = new Set(opts.data.serving.map((r) => r.team)).size
    sectionHeading("Who's serving")
    autoTable(doc, {
      ...labelValueStyles,
      startY: cursorY,
      body: opts.data.serving.map((r) => [
        teamCount > 1 ? `${r.team} — ${r.position}` : r.position,
        r.names.join(', '),
      ]),
      columnStyles: {
        0: { cellWidth: 62, fontStyle: 'bold', fillColor: FILL },
      },
    })
    cursorY = lastTableBottom() + 8
  }

  // -- times & location ------------------------------------------------------
  if (opts.data.times.length > 0 || opts.data.churchAddress) {
    sectionHeading('Times & location')
    const rows: [string, string][] = opts.data.times.map((t) => [t.label, t.time])
    if (opts.data.churchAddress) rows.push(['Address', opts.data.churchAddress])
    autoTable(doc, {
      ...labelValueStyles,
      startY: cursorY,
      body: rows,
      columnStyles: {
        0: { cellWidth: 48, fontStyle: 'bold', fillColor: FILL },
      },
    })
    cursorY = lastTableBottom() + 8
  }

  // -- song list --------------------------------------------------------------
  const songItems = opts.items.filter((i) => i.kind === 'song')
  const songs = songItems.map((item, index) => {
    const info = item.arrangement_id
      ? opts.arrangementIndex.get(item.arrangement_id)
      : undefined
    const title = info ? arrangementDisplayTitle(info) : item.title
    const referenceUrl = info?.arrangement.reference_url ?? null
    return {
      number: index + 1,
      title,
      key: item.key_override ?? info?.arrangement.song_key ?? '',
      bpm: info?.arrangement.bpm?.toString() ?? '',
      meter: info?.arrangement.meter ?? '',
      url: referenceUrl ?? songSearchLinks(title).listen,
      linkLabel: referenceUrl ? 'YouTube' : 'Search',
      notes: item.description?.trim() ?? '',
    }
  })

  if (songs.length > 0) {
    sectionHeading('Song list')
    autoTable(doc, {
      ...labelValueStyles,
      startY: cursorY,
      head: [['#', 'Song', 'Key', 'BPM', 'Meter', 'Listen']],
      headStyles: { fillColor: INK, textColor: [255, 255, 255], fontSize: 9 },
      body: songs.map((s) => [s.number, s.title, s.key, s.bpm, s.meter, s.linkLabel]),
      columnStyles: {
        0: { cellWidth: 9, halign: 'right' },
        2: { cellWidth: 14, halign: 'center' },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 16, halign: 'center' },
        5: { cellWidth: 22, textColor: LINK_BLUE },
      },
      didDrawCell: (data) => {
        // Make the Listen cell an actual hyperlink.
        if (data.section === 'body' && data.column.index === 5) {
          const song = songs[data.row.index]
          if (song) {
            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, {
              url: song.url,
            })
          }
        }
      },
    })
    cursorY = lastTableBottom() + 8
  }

  // -- notes (per-song flow / dynamics, then general plan notes) --------------
  const noteRows: [string, string][] = songs
    .filter((s) => s.notes)
    .map((s) => [`${s.number}. ${s.title}`, s.notes])
  if (opts.plan.notes?.trim()) noteRows.push(['General', opts.plan.notes.trim()])
  if (noteRows.length > 0) {
    sectionHeading('Notes')
    autoTable(doc, {
      ...labelValueStyles,
      startY: cursorY,
      body: noteRows,
      columnStyles: {
        0: { cellWidth: 62, fontStyle: 'bold', fillColor: FILL },
      },
    })
  }

  // -- footer on every page ----------------------------------------------------
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(
      `${opts.data.churchName} · ${opts.serviceTypeName} · ${dateShort}`,
      marginX,
      pageH - 8,
    )
    doc.text(`Page ${p} of ${pages}`, pageW - marginX, pageH - 8, { align: 'right' })
  }

  const safeName = opts.serviceTypeName.replace(/[^\w-]+/g, '') || 'Service'
  const safeDate = opts.plan.date.replace(/-/g, '')
  return {
    base64: arrayBufferToBase64(doc.output('arraybuffer')),
    filename: `SetList-${safeName}-${safeDate}.pdf`,
  }
}
