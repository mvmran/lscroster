import { describe, expect, it } from 'vitest'
import { BRAND_PRESETS, clampHue, DEFAULT_BRAND_HUE, presetName } from './brand'

describe('clampHue', () => {
  it('keeps hues inside the column CHECK range (0-360)', () => {
    expect(clampHue(-20)).toBe(0)
    expect(clampHue(400)).toBe(360)
    expect(clampHue(278)).toBe(278)
  })

  it('rounds fractional hues to whole degrees (the column is smallint)', () => {
    expect(clampHue(184.6)).toBe(185)
  })

  it('falls back to the shipped default for junk', () => {
    expect(clampHue(Number.NaN)).toBe(DEFAULT_BRAND_HUE)
  })
})

describe('presetName', () => {
  it('names an exact preset', () => {
    expect(presetName(278)).toBe('Indigo')
    expect(presetName(185)).toBe('Teal')
  })

  it('calls a hue between presets custom', () => {
    expect(presetName(210)).toBe('Custom')
  })

  it('has a name for every preset', () => {
    for (const preset of BRAND_PRESETS) {
      expect(presetName(preset.hue)).toBe(preset.name)
    }
  })
})
