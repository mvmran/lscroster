import { describe, expect, it } from 'vitest'
import { type Song } from '@/features/services/service-utils'
import {
  SIMILAR_ENOUGH,
  coreTitle,
  findSimilarSongs,
  foldRoman,
  normalizeTitle,
  titleSimilarity,
} from '@/features/services/song-duplicates'

/** True when the warning would be shown for these two titles. */
const flags = (a: string, b: string) => titleSimilarity(a, b) >= SIMILAR_ENOUGH

function song(title: string, extra: Partial<Song> = {}): Song {
  return {
    id: title,
    title,
    author: null,
    ccli_number: null,
    copyright: null,
    notes: null,
    tags: [],
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    default_key: null,
    bpm: null,
    meter: null,
    default_arrangement_id: null,
    arrangements: [],
    arrangement_links: [],
    ...extra,
  }
}

describe('normalizeTitle', () => {
  it('strips case, punctuation and accents', () => {
    expect(normalizeTitle('Holy, Holy, Holy!')).toBe('holy holy holy')
    expect(normalizeTitle('  Sanctíssima  ')).toBe('sanctissima')
    expect(normalizeTitle('10,000 Reasons')).toBe('10 000 reasons')
  })
})

describe('coreTitle', () => {
  it('drops a bracketed or dashed qualifier', () => {
    expect(coreTitle('Amazing Grace (slow)')).toBe('amazing grace')
    expect(coreTitle('Amazing Grace [Live]')).toBe('amazing grace')
    expect(coreTitle('Amazing Grace - Acoustic')).toBe('amazing grace')
  })

  it('keeps the title when it is nothing but a qualifier', () => {
    expect(coreTitle('(Reprise)')).toBe('reprise')
  })
})

describe('foldRoman', () => {
  it('folds the spellings that differ between two romanisations', () => {
    expect(foldRoman('nadha')).toBe(foldRoman('nada'))
    expect(foldRoman('yeshuve')).toBe(foldRoman('yesuve'))
    expect(foldRoman('yesuvee')).toBe(foldRoman('yesuve'))
    expect(foldRoman('swami')).toBe(foldRoman('svami'))
  })

  it('leaves digits alone', () => {
    expect(foldRoman('10 000 reasons')).toBe('10 000 reasons')
  })
})

describe('titleSimilarity', () => {
  it('scores an identical title 1, whatever the punctuation', () => {
    expect(titleSimilarity('Holy, Holy, Holy', 'Holy Holy Holy')).toBe(1)
  })

  it('ranks a qualifier above a romanisation above a longer title', () => {
    const qualifier = titleSimilarity('Amazing Grace', 'Amazing Grace (slow)')
    const romanisation = titleSimilarity('Yesuve Nee', 'Yeshuve Nee')
    const longer = titleSimilarity('Come Thou Fount', 'Come Thou Fount of Every Blessing')
    expect(qualifier).toBeGreaterThan(romanisation)
    expect(romanisation).toBeGreaterThan(longer)
    expect(longer).toBeGreaterThanOrEqual(SIMILAR_ENOUGH)
  })
})

describe('the duplicates the warning exists for', () => {
  it('flags one transliteration against another', () => {
    // The case from the field: identical in Malayalam, one dropped letter here.
    expect(flags('Ezhu Vilakkin Naduvil', 'Ezhu Vlakkin Naduvil')).toBe(true)
    expect(flags('Yesuve Ente Yesuve', 'Yeshuve Ente Yeshuve')).toBe(true)
    expect(flags('Nadha Nee Varum', 'Natha Nee Varum')).toBe(true)
    expect(flags('Aa Karathaaril', 'Aa Karathharil')).toBe(true)
  })

  it('flags the same song wearing a qualifier', () => {
    expect(flags('Amazing Grace', 'Amazing Grace (slow)')).toBe(true)
    expect(flags('Amazing Grace', 'Amazing Grace - Acoustic')).toBe(true)
    expect(flags('Amazing Grace', 'amazing grace')).toBe(true)
  })

  it('flags a title that is the other one plus its subtitle', () => {
    expect(flags('Come Thou Fount', 'Come Thou Fount of Every Blessing')).toBe(true)
  })

  it('flags punctuation and spacing differences', () => {
    expect(flags('10,000 Reasons', '10000 Reasons')).toBe(true)
    expect(flags('Holy, Holy, Holy', 'Holy Holy Holy')).toBe(true)
  })
})

describe('the warnings it must not raise', () => {
  it('leaves different songs that share a word alone', () => {
    expect(flags('Amazing Grace', 'Amazing Love')).toBe(false)
    expect(flags('Holy Spirit', 'Holy Ground')).toBe(false)
    expect(flags('Be Thou My Vision', 'Be Still My Soul')).toBe(false)
    expect(flags('Great Is Thy Faithfulness', 'Great Are You Lord')).toBe(false)
  })

  it('does not treat a one-word title as contained in every longer one', () => {
    expect(flags('Come', 'Come Thou Fount')).toBe(false)
    expect(flags('Grace', 'Amazing Grace')).toBe(false)
  })

  it('scores an empty or punctuation-only title against nothing', () => {
    expect(titleSimilarity('', 'Amazing Grace')).toBe(0)
    expect(titleSimilarity('   ', 'Amazing Grace')).toBe(0)
    expect(titleSimilarity('!!!', 'Amazing Grace')).toBe(0)
  })
})

describe('findSimilarSongs', () => {
  const library = [
    song('Amazing Grace'),
    song('Amazing Grace (My Chains Are Gone)'),
    song('Amazing Love'),
    song('Ezhu Vilakkin Naduvil'),
    song('Retired Song', { status: 'archived' }),
  ]

  it('returns the near misses and leaves the rest of the library out', () => {
    const found = findSimilarSongs('Amazing Grace (slow)', library)
    // Both survive on equal terms — strip the qualifier off any of the three
    // and you are left with "amazing grace" — so the tie breaks on the title.
    // "Amazing Love" is not close enough to be here at all.
    expect(found.map((m) => m.song.title)).toEqual([
      'Amazing Grace',
      'Amazing Grace (My Chains Are Gone)',
    ])
    expect(found.map((m) => m.score)).toEqual([0.97, 0.97])
  })

  it('finds the song someone is about to romanise a second way', () => {
    expect(findSimilarSongs('Ezhu Vlakkin Naduvil', library).map((m) => m.song.title)).toEqual([
      'Ezhu Vilakkin Naduvil',
    ])
  })

  it('warns about an archived song too — that is the one about to be re-added', () => {
    expect(findSimilarSongs('Retired Song', library).map((m) => m.song.title)).toEqual([
      'Retired Song',
    ])
  })

  it('says nothing about a genuinely new song, or an empty box', () => {
    expect(findSimilarSongs('Cornerstone', library)).toEqual([])
    expect(findSimilarSongs('', library)).toEqual([])
  })
})

const LIBRARY = [
  'Aa Karathaaril',
  'Amazing Grace',
  'Amazing Grace / Yesuve Nee',
  'Be Thou My Vision',
  'Come Thou Fount',
  'Great Is Thy Faithfulness',
  'Holy, Holy, Holy',
  'It Is Well With My Soul',
  'Cornerstone',
  'What A Beautiful Name',
  'Way Maker',
  'Goodness Of God',
  'How Great Thou Art',
  'How Great Is Our God',
  'Blessed Assurance',
  'Blessed Be Your Name',
  'In Christ Alone',
  'Christ Is Enough',
  'O Come All Ye Faithful',
  'O Come O Come Emmanuel',
  'Ezhu Vilakkin Naduvil',
  'Yesuve Ente Yesuve',
  'Nandi Nandi',
  'Daivam Nallavan',
]

describe('a sweep of the whole library against itself', () => {
  it('flags nothing but the pairs that really are one song', () => {
    const flagged: string[] = []
    for (let i = 0; i < LIBRARY.length; i += 1) {
      for (let j = i + 1; j < LIBRARY.length; j += 1) {
        if (titleSimilarity(LIBRARY[i], LIBRARY[j]) >= SIMILAR_ENOUGH) {
          flagged.push(`${LIBRARY[i]} ~ ${LIBRARY[j]}`)
        }
      }
    }
    // The mashup genuinely opens with Amazing Grace, so the warning is right
    // to mention it. Nothing else in a library of near-miss titles trips.
    expect(flagged).toEqual(['Amazing Grace ~ Amazing Grace / Yesuve Nee'])
  })
})
