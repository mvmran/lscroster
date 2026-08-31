import { describe, expect, it } from 'vitest'
import { mergeChordRows, splitInlineChords } from '@/features/services/chord-chart'

const VERSE = [
  "       D         D7        G        D",
  "T'was grace that taught my heart to fear",
  '    D7        Bm     A ',
  'And grace my fears relieved',
].join('\n')

describe('mergeChordRows', () => {
  it('anchors each chord to the column it was written at', () => {
    // The D sits at column 7; column 7 of the line below is the "r" of grace.
    expect(mergeChordRows(VERSE)).toBe(
      [
        "T'was g[D]race that [D7]taught my [G]heart to [D]fear",
        'And [D7]grace my f[Bm]ears re[A]lieved',
      ].join('\n'),
    )
  })

  it('leaves a paste with no chord rows exactly as it was', () => {
    const plain = 'Verse 1\nAmazing grace how sweet the sound\nThat saved a wretch like me'
    expect(mergeChordRows(plain)).toBe(plain)
  })

  it('is idempotent — a merged line is never merged again', () => {
    const once = mergeChordRows(VERSE)
    expect(mergeChordRows(once)).toBe(once)
  })

  it('keeps a section header and its blank lines', () => {
    const text = ['Verse 1', '   G   C', 'Amazing grace', '', 'Chorus'].join('\n')
    expect(mergeChordRows(text)).toBe(
      ['Verse 1', 'Ama[G]zing[C] grace', '', 'Chorus'].join('\n'),
    )
  })

  it('brackets an instrumental row in place when no lyric follows it', () => {
    const text = ['Intro', 'D  G  A', '', 'Verse 1', '   G', 'Amazing'].join('\n')
    expect(mergeChordRows(text)).toBe(
      ['Intro', '[D]   [G]   [A]', '', 'Verse 1', 'Ama[G]zing'].join('\n'),
    )
  })

  it('pads a line too short to reach a trailing chord', () => {
    expect(mergeChordRows('Bm      A\nbelieved')).toBe('[Bm]believed[A]')
  })

  it('does not read an ordinary lyric line as a row of chords', () => {
    // Every token has to be a chord, and "Add"/"Dad"/"Amen" fail on their
    // second letter, so a line is rejected by its first ordinary word.
    for (const line of ['Add to my faith', 'Amen amen', 'Bad company', 'A cappella']) {
      expect(mergeChordRows(`${line}\nthe next line`)).toBe(`${line}\nthe next line`)
    }
  })

  it('leaves a lone letter as a word unless the paste has a real chord row', () => {
    // "A" on its own line is a word as often as a chord; nothing in the line
    // says which, so the rest of the paste decides.
    expect(mergeChordRows('A\nlonely word')).toBe('A\nlonely word')
    expect(mergeChordRows('  G   C\nAmazing\n  A\ngrace')).toBe(
      'Am[G]azin[C]g\ngr[A]ace',
    )
  })
})

describe('splitInlineChords', () => {
  it('separates the words from the chords, line for line', () => {
    const merged = mergeChordRows(VERSE)
    const { lyrics, chords } = splitInlineChords(merged)
    expect(lyrics).toBe(
      ["T'was grace that taught my heart to fear", 'And grace my fears relieved'].join(
        '\n',
      ),
    )
    expect(chords).toBe(merged)
  })

  it('keeps the layers line-parallel when only some lines have chords', () => {
    const { lyrics, chords } = splitInlineChords('Am[G]azing\ngrace\nhow [C]sweet')
    expect(lyrics).toBe('Amazing\ngrace\nhow sweet')
    expect(chords).toBe('Am[G]azing\n\nhow [C]sweet')
  })

  it('drops the indent a chart used to place its chords', () => {
    // The two spaces only existed to push "Bm" over the right syllable in a
    // monospaced view. Once it is a bracket they are noise in the words.
    const { lyrics, chords } = splitInlineChords('[Bm]  You call me [A]out')
    expect(lyrics).toBe('You call me out')
    expect(chords).toBe('[Bm]You call me [A]out')
  })

  it('drops the same indent from both layers, chords kept in place', () => {
    // The chord line stands in for the lyric row when it carries words, so if
    // the two disagreed the line would shift as chords were switched off.
    const { lyrics, chords } = splitInlineChords('[G]   I will [D]call upon')
    expect(lyrics).toBe('I will call upon')
    expect(chords).toBe('[G]I will [D]call upon')
    expect(chords.replace(/\[[^\]]*\]/g, '')).toBe(lyrics)
  })

  it('drops a leading indent that comes before the first chord', () => {
    const { lyrics, chords } = splitInlineChords('   You call [A]out')
    expect(lyrics).toBe('You call out')
    expect(chords).toBe('You call [A]out')
  })

  it('trims a line that has no chords at all', () => {
    expect(splitInlineChords('   plain words').lyrics).toBe('plain words')
  })

  it('keeps the spacing inside a line', () => {
    // Only the indent goes: "Pra  -  ise" is how the chart spells the melisma.
    const { lyrics } = splitInlineChords('[F#m]Pra  -  [D]ise the [A]Lord')
    expect(lyrics).toBe('Pra  -  ise the Lord')
  })

  it('leaves a bracketed note to the band in the lyrics', () => {
    const { lyrics, chords } = splitInlineChords('[Verse 1]\n[x2] sing it')
    expect(lyrics).toBe('[Verse 1]\n[x2] sing it')
    expect(chords).toBe('')
  })

  it('gives an instrumental row a blank lyric line to sit against', () => {
    const { lyrics, chords } = splitInlineChords('[D]  [G]\nAm[C]azing')
    expect(lyrics).toBe('\nAmazing')
    expect(chords).toBe('[D]  [G]\nAm[C]azing')
  })

  it('reproduces the words of an indented chart exactly, indent aside', () => {
    const { lyrics } = splitInlineChords('[Bm]  Where feet may [A/C#]fail')
    expect(lyrics).toBe('Where feet may fail')
  })

  it('keeps the spacing of a bare chord row, which has no words to indent', () => {
    // The gaps are what separate one chord from the next here.
    expect(splitInlineChords('[D]   [G]  [A]').chords).toBe('[D]   [G]  [A]')
    expect(splitInlineChords('[| Bm / / / | G / / / |]').chords).toBe(
      '[| Bm / / / | G / / / |]',
    )
  })

  it('reproduces the words exactly, brackets and all removed', () => {
    const original = "T'was grace that taught my heart to fear"
    const row = '       D         D7        G        D'
    expect(splitInlineChords(mergeChordRows(`${row}\n${original}`)).lyrics).toBe(original)
  })
})
