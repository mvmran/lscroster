import { describe, expect, it } from 'vitest'
import { diffText, hasChanges, hasInserted } from '@/features/services/lyric-diff'

const SAVED = [
  'Verse 1',
  'Amazing grace',
  'How sweet the sound',
  '',
  'Chorus',
  'My chains are gone',
].join('\n')
const lines = (...rows: string[]) => rows.join('\n')

describe('diffText', () => {
  it('finds nothing in an unchanged text', () => {
    expect(hasChanges(diffText(SAVED, SAVED))).toBe(false)
  })

  it('marks the characters typed into a line', () => {
    const draft = SAVED.replace('How sweet', 'How very sweet')
    const diff = diffText(SAVED, draft)
    expect([...diff.changed.keys()]).toEqual([2])
    // "very" — the space after it doesn't count.
    expect(diff.changed.get(2)?.inserted).toEqual([[4, 8]])
  })

  it('marks a replaced character, and a deletion with the bar alone', () => {
    const swapped = diffText(SAVED, SAVED.replace('grace', 'grade'))
    expect(swapped.changed.get(1)?.inserted).toEqual([[11, 12]])
    const shortened = diffText(SAVED, SAVED.replace('grace', 'grac'))
    expect(shortened.changed.get(1)).toEqual({ inserted: [] })
    expect(hasInserted(shortened)).toBe(false)
  })

  it('ignores changes that are only spaces, and blank lines', () => {
    const spaced = SAVED.replace('Amazing grace', 'Amazing  grace  ')
      .replace('\n\n', '\n\n\n')
    expect(hasChanges(diffText(SAVED, spaced))).toBe(false)
  })

  it('leaves the lines after a new one alone', () => {
    const draft = SAVED.replace('Amazing grace\n', 'Amazing grace\nA brand new line\n')
    const diff = diffText(SAVED, draft)
    expect([...diff.changed.keys()]).toEqual([2])
    expect(diff.changed.get(2)?.inserted).toEqual([
      [0, 1],
      [2, 7],
      [8, 11],
      [12, 16],
    ])
  })

  it('ticks where a line was taken out', () => {
    const diff = diffText(SAVED, SAVED.replace('How sweet the sound\n', ''))
    expect(diff.changed.size).toBe(0)
    expect([...diff.removedBefore]).toEqual([2])
    const last = diffText(
      SAVED,
      lines('Verse 1', 'Amazing grace', 'How sweet the sound', '', 'Chorus'),
    )
    expect([...last.removedBefore]).toEqual([5])
  })

  it('marks a changed chord by the characters that differ', () => {
    const saved = '[1]Amazing [4]grace'
    const diff = diffText(saved, '[1]Amazing [5]grace')
    expect(diff.changed.get(0)?.inserted).toEqual([[12, 13]])
  })

  it('treats everything as new against nothing saved', () => {
    const diff = diffText('', 'One\n\nTwo')
    expect([...diff.changed.keys()]).toEqual([0, 2])
  })
})
