import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAD,
  PAD_PRESETS,
  padPresetFor,
  padSettingsSchema,
  parsePadSettings,
} from '@/lib/pad-settings'

describe('pad presets', () => {
  it('defaults to Dark Warm, exactly as tuned', () => {
    expect(PAD_PRESETS[0].name).toBe('Dark Warm')
    expect(DEFAULT_PAD).toEqual({
      wave: 'sawtooth', voices: 3, detune: 10, cutoff: 550, q: 1.2, drift: 250, rate: 0.04,
      attack: 3, release: 2.5, reverb: 0.75, room: 3.5, spread: 0.6, sparkle: 0,
      voicing: 'add9_3', octave: 0, level: 0.6,
    })
  })

  it('keeps the first pad as Plain Vanilla', () => {
    const vanilla = PAD_PRESETS.find((p) => p.id === 'plain-vanilla')
    expect(vanilla?.settings).toMatchObject({ wave: 'sawtooth', voices: 2, detune: 7, cutoff: 900, reverb: 0, voicing: 'full' })
  })

  it('every preset is valid and has a unique id', () => {
    for (const p of PAD_PRESETS) expect(padSettingsSchema.safeParse(p.settings).success).toBe(true)
    expect(new Set(PAD_PRESETS.map((p) => p.id)).size).toBe(PAD_PRESETS.length)
  })
})

describe('parsePadSettings', () => {
  it('reads stored settings', () => {
    const vanilla = PAD_PRESETS[1].settings
    expect(parsePadSettings(JSON.parse(JSON.stringify(vanilla)))).toEqual(vanilla)
  })

  it('falls back to the default for anything it can’t read', () => {
    expect(parsePadSettings(null)).toEqual(DEFAULT_PAD)
    expect(parsePadSettings({ wave: 'sawtooth' })).toEqual(DEFAULT_PAD)
    expect(parsePadSettings({ ...DEFAULT_PAD, cutoff: 99999 })).toEqual(DEFAULT_PAD)
    expect(parsePadSettings({ ...DEFAULT_PAD, voicing: 'jazz' })).toEqual(DEFAULT_PAD)
  })
})

describe('padPresetFor', () => {
  it('names a preset only when the settings match it exactly', () => {
    expect(padPresetFor(DEFAULT_PAD)?.name).toBe('Dark Warm')
    expect(padPresetFor({ ...PAD_PRESETS[3].settings })?.name).toBe('Ambient Worship')
    expect(padPresetFor({ ...DEFAULT_PAD, reverb: 0.5 })).toBeNull()
  })
})
