import { describe, expect, it } from 'vitest'
import {
  buildLyricsSheet,
  comparePlansByDateTime,
  findClashingPlans,
  lyricsSheetMeta,
  playableUrl,
  songSearchLinks,
  weeklyDates,
  type ArrangementInfo,
  type ArrangementLyrics,
  type ClashCandidate,
  type PlanChronological,
  type PlanItem,
  type SongArrangement,
} from '@/features/services/service-utils'

describe('weeklyDates (issue #72)', () => {
  it('returns just the start date when no end is given equal to start', () => {
    expect(weeklyDates('2026-07-05', '2026-07-05')).toEqual(['2026-07-05'])
  })

  it('includes the start and every 7-day step up to and including the end', () => {
    expect(weeklyDates('2026-07-05', '2026-07-26')).toEqual([
      '2026-07-05',
      '2026-07-12',
      '2026-07-19',
      '2026-07-26',
    ])
  })

  it('stops before overshooting when the end is not on a weekly boundary', () => {
    expect(weeklyDates('2026-07-05', '2026-07-20')).toEqual([
      '2026-07-05',
      '2026-07-12',
      '2026-07-19',
    ])
  })

  it('falls back to a single date when the end is before the start', () => {
    expect(weeklyDates('2026-07-12', '2026-07-05')).toEqual(['2026-07-12'])
  })

  it('crosses month/year boundaries correctly', () => {
    expect(weeklyDates('2026-12-27', '2027-01-10')).toEqual([
      '2026-12-27',
      '2027-01-03',
      '2027-01-10',
    ])
  })

  it('respects the cap to avoid runaway loops', () => {
    expect(weeklyDates('2026-01-01', '2030-01-01', 3)).toEqual([
      '2026-01-01',
      '2026-01-08',
      '2026-01-15',
    ])
  })
})

describe('findClashingPlans (issue #78)', () => {
  const plan = (
    id: string,
    date: string,
    start: string | null,
    end: string | null,
    name = 'Sunday Service',
    startOverride: string | null = null,
  ): ClashCandidate => ({
    id,
    date,
    title: null,
    start_time: startOverride,
    service_types: { name, default_start_time: start, end_time: end },
  })

  const existing = [
    plan('a', '2026-07-05', '10:00:00', '11:30:00'),
    plan('b', '2026-07-05', '18:00:00', '19:30:00', 'Evening Service'),
    plan('c', '2026-07-12', '10:00:00', '11:30:00'),
  ]

  it('flags a service that overlaps an existing one on the same date', () => {
    const clashes = findClashingPlans(
      { date: '2026-07-05', start: '10:00:00', end: '11:30:00' },
      existing,
    )
    expect(clashes.map((c) => c.id)).toEqual(['a'])
  })

  it('flags overlap even when start and end differ', () => {
    const clashes = findClashingPlans(
      { date: '2026-07-05', start: '11:00:00', end: '12:00:00' },
      existing,
    )
    expect(clashes.map((c) => c.id)).toEqual(['a'])
  })

  it('does not flag a same-day service at a non-overlapping time', () => {
    const clashes = findClashingPlans(
      { date: '2026-07-05', start: '12:00:00', end: '13:00:00' },
      existing,
    )
    expect(clashes).toEqual([])
  })

  it('does not flag services on a different date', () => {
    const clashes = findClashingPlans(
      { date: '2026-07-19', start: '10:00:00', end: '11:30:00' },
      existing,
    )
    expect(clashes).toEqual([])
  })

  it('excludes the plan being duplicated from the comparison', () => {
    const clashes = findClashingPlans(
      { date: '2026-07-05', start: '10:00:00', end: '11:30:00', excludeId: 'a' },
      existing,
    )
    expect(clashes).toEqual([])
  })

  it('warns when the new service has no time (cannot rule out a clash)', () => {
    const clashes = findClashingPlans(
      { date: '2026-07-05', start: null, end: null },
      existing,
    )
    expect(clashes.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it("honours an existing plan's per-plan start override when comparing", () => {
    // Plan 'd' is a normally-10am service moved to 18:30 on the same day; a new
    // 10am service should NOT clash with it (its window shifted to the evening).
    const withOverride = [
      plan('d', '2026-07-05', '10:00:00', '11:30:00', 'Sunday Service', '18:30:00'),
    ]
    expect(
      findClashingPlans({ date: '2026-07-05', start: '10:00:00', end: '11:30:00' }, withOverride),
    ).toEqual([])
    // But a new evening service overlapping the moved window does clash.
    expect(
      findClashingPlans(
        { date: '2026-07-05', start: '19:00:00', end: '20:00:00' },
        withOverride,
      ).map((c) => c.id),
    ).toEqual(['d'])
  })
})

describe('comparePlansByDateTime', () => {
  const p = (
    date: string,
    typeName: string,
    defaultStart: string | null,
    override: string | null = null,
  ): PlanChronological & { id: string } => ({
    id: `${date} ${typeName}`,
    date,
    start_time: override,
    service_types: { name: typeName, default_start_time: defaultStart },
  })

  const order = (plans: (PlanChronological & { id: string })[]) =>
    [...plans].sort(comparePlansByDateTime).map((x) => x.id)

  it('orders by date first, whatever the service type', () => {
    expect(
      order([
        p('2026-07-12', 'Sunday 10am', '10:00:00'),
        p('2026-07-05', 'Wednesday Prayer', '19:00:00'),
      ]),
    ).toEqual(['2026-07-05 Wednesday Prayer', '2026-07-12 Sunday 10am'])
  })

  it('puts the morning service before the evening one on the same day', () => {
    // The bug this fixes: prev/next used to skip a same-day service of another
    // type entirely.
    expect(
      order([
        p('2026-07-05', 'Sunday 5pm', '17:00:00'),
        p('2026-07-05', 'Sunday 10am', '10:00:00'),
      ]),
    ).toEqual(['2026-07-05 Sunday 10am', '2026-07-05 Sunday 5pm'])
  })

  it("honours a plan's own start-time override", () => {
    // A 10am service moved to 6:30pm sorts after the 5pm one that day.
    expect(
      order([
        p('2026-07-05', 'Sunday 10am', '10:00:00', '18:30:00'),
        p('2026-07-05', 'Sunday 5pm', '17:00:00'),
      ]),
    ).toEqual(['2026-07-05 Sunday 5pm', '2026-07-05 Sunday 10am'])
  })

  it('sorts a plan with no start time after the timed ones that day', () => {
    expect(
      order([
        p('2026-07-05', 'Working Bee', null),
        p('2026-07-05', 'Sunday 10am', '10:00:00'),
      ]),
    ).toEqual(['2026-07-05 Sunday 10am', '2026-07-05 Working Bee'])
  })

  it('falls back to the service type name when two start together', () => {
    expect(
      order([
        p('2026-07-05', 'Kids Church', '10:00:00'),
        p('2026-07-05', 'Adults Service', '10:00:00'),
      ]),
    ).toEqual(['2026-07-05 Adults Service', '2026-07-05 Kids Church'])
  })
})

describe('songSearchLinks', () => {
  it('sends the chord search to Worship Together, title and artist together', () => {
    // The query lives in the fragment because that is where Worship Together's
    // own search box puts it — a Cludo widget reads `#?cludoquery=` on load.
    expect(songSearchLinks('Man of Sorrows', 'Hillsong Worship').chords).toBe(
      'https://www.worshiptogether.com/search-results/' +
        '#?cludoquery=Man%20of%20Sorrows%20Hillsong%20Worship&cludopage=1',
    )
  })

  it('searches on the title alone when the song has no author', () => {
    expect(songSearchLinks('Man of Sorrows').chords).toBe(
      'https://www.worshiptogether.com/search-results/' +
        '#?cludoquery=Man%20of%20Sorrows&cludopage=1',
    )
    expect(songSearchLinks('Man of Sorrows', null).chords).toBe(
      songSearchLinks('Man of Sorrows').chords,
    )
  })

  it('escapes a title that would otherwise break the query', () => {
    const { chords } = songSearchLinks("O Praise the Name (Anástasis)", 'Hillsong')
    expect(chords).toContain('An%C3%A1stasis')
    expect(chords).not.toContain(' ')
  })

  it('leaves the lyrics and listen searches alone', () => {
    const links = songSearchLinks('Amazing Grace', 'John Newton')
    expect(links.lyrics).toContain('google.com/search')
    expect(links.listen).toContain('youtube.com/results')
  })
})

describe('buildLyricsSheet key and tempo', () => {
  const arrangement: SongArrangement = {
    id: 'arr-1',
    name: 'Default',
    song_key: 'D',
    bpm: 72,
    meter: '4/4',
    is_default: true,
    sort_order: 0,
    reference_url: 'https://youtu.be/demo',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
  const info: ArrangementInfo = {
    arrangement,
    songs: [{ id: 'song-1', title: 'Amazing Grace' }],
  }
  const arrangements = new Map([['arr-1', info]])
  const lyrics = new Map<string, ArrangementLyrics>()

  function songItem(overrides: Partial<PlanItem>): PlanItem {
    return {
      id: 'item-1',
      plan_id: 'plan-1',
      sort_order: 0,
      kind: 'song',
      title: 'Amazing Grace',
      arrangement_id: 'arr-1',
      lyrics_id: null,
      key_override: null,
      bpm_override: null,
      length_seconds: 240,
      description: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      ...overrides,
    }
  }

  it('falls back to the arrangement when the plan overrides nothing', () => {
    const [entry] = buildLyricsSheet([songItem({})], arrangements, lyrics)
    expect(entry.key).toBe('D')
    expect(entry.bpm).toBe(72)
    expect(entry.referenceUrl).toBe('https://youtu.be/demo')
    expect(lyricsSheetMeta(entry)).toBe('Key D  ·  72 BPM  ·  4/4')
  })

  it('prefers the plan’s own key and tempo when it sets them', () => {
    const [entry] = buildLyricsSheet(
      [songItem({ key_override: 'G', bpm_override: 60 })],
      arrangements,
      lyrics,
    )
    expect(entry.key).toBe('G')
    expect(entry.bpm).toBe(60)
  })

  it('overrides the two independently', () => {
    const [slower] = buildLyricsSheet([songItem({ bpm_override: 60 })], arrangements, lyrics)
    expect(slower.key).toBe('D')
    expect(slower.bpm).toBe(60)

    const [transposed] = buildLyricsSheet(
      [songItem({ key_override: 'G' })],
      arrangements,
      lyrics,
    )
    expect(transposed.key).toBe('G')
    expect(transposed.bpm).toBe(72)
  })
})

describe('playableUrl', () => {
  it('passes an ordinary http(s) link through', () => {
    expect(playableUrl('https://youtu.be/abc')).toBe('https://youtu.be/abc')
    expect(playableUrl('  http://example.com/x  ')).toBe('http://example.com/x')
  })

  it('refuses anything that is not a web link', () => {
    // The song page validates on save, but this is what builds the href — a
    // scheme that can run code must never reach it.
    expect(playableUrl('javascript:alert(1)')).toBeNull()
    expect(playableUrl('data:text/html,<script>')).toBeNull()
    expect(playableUrl('youtu.be/abc')).toBeNull()
    expect(playableUrl('')).toBeNull()
    expect(playableUrl(null)).toBeNull()
  })
})
