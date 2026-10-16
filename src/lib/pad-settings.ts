import { z } from 'zod'

/**
 * How the pad sounds: the synth settings behind every Pad button (song page,
 * a plan's Edit song, the Lyrics Sheet), chosen per person at Settings → Pad
 * sound and stored in `person_sound_prefs.pad` (0054).
 *
 * The presets were tuned by ear on a stand-alone audition page; **Dark Warm**
 * is the user's own tuning and the default for everyone, **Plain Vanilla** the
 * pad the app shipped with first.
 */

export const PAD_WAVES = ['sawtooth', 'triangle', 'sine', 'square'] as const

/** Which notes the pad holds, as semitones above its root. `third` is 3 or 4. */
export const PAD_VOICINGS = {
  full: { label: 'Full chord (1-5 · 1-3-5)', notes: (third: number) => [0, 7, 12, 12 + third, 19] },
  open: { label: 'Open (1-5 · 3-5-8)', notes: (third: number) => [0, 7, 12 + third, 19, 24] },
  add9: { label: 'Add9, no 3rd (1-5 · 1-9-5)', notes: () => [0, 7, 12, 14, 19] },
  add9_3: { label: 'Add9 with 3rd (1-5 · 3-5-9)', notes: (third: number) => [0, 7, 12 + third, 19, 26] },
  sus2: { label: 'Sus2 (1-5 · 9-5)', notes: () => [0, 7, 14, 19] },
  fifths: { label: 'Root and 5th only', notes: () => [0, 7, 12, 19] },
  drone: { label: 'Low drone (1 · 1-5-8)', notes: () => [-12, 0, 7, 12] },
} as const

export type PadVoicing = keyof typeof PAD_VOICINGS

const voicingIds = Object.keys(PAD_VOICINGS) as [PadVoicing, ...PadVoicing[]]

/**
 * The settings, with the ranges the controls allow. Stored JSON is parsed with
 * this; anything out of range or missing falls back to the default.
 */
export const padSettingsSchema = z.object({
  wave: z.enum(PAD_WAVES),
  voices: z.number().int().min(1).max(4),
  detune: z.number().min(0).max(30),
  cutoff: z.number().min(200).max(5000),
  q: z.number().min(0.1).max(8),
  drift: z.number().min(0).max(1000),
  rate: z.number().min(0.01).max(0.5),
  attack: z.number().min(0.1).max(6),
  release: z.number().min(0.2).max(6),
  reverb: z.number().min(0).max(1),
  room: z.number().min(1).max(8),
  spread: z.number().min(0).max(1),
  sparkle: z.number().min(0).max(1),
  voicing: z.enum(voicingIds),
  octave: z.number().int().min(-1).max(1),
  level: z.number().min(0).max(1),
})

export type PadSettings = z.infer<typeof padSettingsSchema>

export interface PadPreset {
  id: string
  name: string
  /** One line on what it sounds like. */
  note: string
  settings: PadSettings
}

export const PAD_PRESETS: PadPreset[] = [
  {
    id: 'dark-warm',
    name: 'Dark Warm',
    note: 'Low, warm saws in a room — the default',
    settings: { wave: 'sawtooth', voices: 3, detune: 10, cutoff: 550, q: 1.2, drift: 250, rate: 0.04, attack: 3, release: 2.5, reverb: 0.75, room: 3.5, spread: 0.6, sparkle: 0, voicing: 'add9_3', octave: 0, level: 0.6 },
  },
  {
    id: 'plain-vanilla',
    name: 'Plain Vanilla',
    note: 'Bright saws, no reverb — the first pad',
    settings: { wave: 'sawtooth', voices: 2, detune: 7, cutoff: 900, q: 0.7, drift: 350, rate: 0.12, attack: 1.5, release: 0.8, reverb: 0, room: 3, spread: 0, sparkle: 0, voicing: 'full', octave: 0, level: 0.5 },
  },
  {
    id: 'warm-soft',
    name: 'Warm & Soft',
    note: 'Triangles, gentle room',
    settings: { wave: 'triangle', voices: 2, detune: 6, cutoff: 1400, q: 0.5, drift: 200, rate: 0.08, attack: 2.5, release: 2, reverb: 0.35, room: 3, spread: 0.5, sparkle: 0, voicing: 'full', octave: 0, level: 0.6 },
  },
  {
    id: 'ambient-worship',
    name: 'Ambient Worship',
    note: 'Add9, big room, sparkle',
    settings: { wave: 'sawtooth', voices: 3, detune: 12, cutoff: 800, q: 0.8, drift: 400, rate: 0.05, attack: 4, release: 3, reverb: 0.6, room: 5, spread: 0.8, sparkle: 0.25, voicing: 'add9', octave: 0, level: 0.6 },
  },
  {
    id: 'organ',
    name: 'Organ',
    note: 'Pure sines, light room',
    settings: { wave: 'sine', voices: 1, detune: 0, cutoff: 3000, q: 0.3, drift: 0, rate: 0.1, attack: 0.8, release: 1.2, reverb: 0.3, room: 2.5, spread: 0.3, sparkle: 0.15, voicing: 'open', octave: 0, level: 0.7 },
  },
  {
    id: 'strings',
    name: 'Strings',
    note: 'Bright, quick swell',
    settings: { wave: 'sawtooth', voices: 3, detune: 15, cutoff: 2200, q: 0.4, drift: 150, rate: 0.2, attack: 1.2, release: 1.5, reverb: 0.45, room: 3, spread: 0.7, sparkle: 0, voicing: 'open', octave: 0, level: 0.5 },
  },
  {
    id: 'glass-shimmer',
    name: 'Glass Shimmer',
    note: 'Airy sus2, high sparkle',
    settings: { wave: 'triangle', voices: 2, detune: 5, cutoff: 3000, q: 0.5, drift: 300, rate: 0.1, attack: 3, release: 3, reverb: 0.7, room: 5.5, spread: 0.9, sparkle: 0.5, voicing: 'sus2', octave: 0, level: 0.55 },
  },
  {
    id: 'deep-drone',
    name: 'Deep Drone',
    note: 'Low root and 5th, dark',
    settings: { wave: 'sawtooth', voices: 2, detune: 8, cutoff: 450, q: 0.9, drift: 150, rate: 0.04, attack: 3.5, release: 3, reverb: 0.5, room: 4.5, spread: 0.5, sparkle: 0, voicing: 'drone', octave: 0, level: 0.65 },
  },
]

/** Dark Warm: what everyone hears until they choose otherwise. */
export const DEFAULT_PAD: PadSettings = PAD_PRESETS[0].settings

/** Stored JSON as settings; the default for anything missing or unreadable. */
export function parsePadSettings(value: unknown): PadSettings {
  const parsed = padSettingsSchema.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_PAD
}

/** The preset these settings are exactly, or null when they've been tuned. */
export function padPresetFor(settings: PadSettings): PadPreset | null {
  const keys = Object.keys(settings) as (keyof PadSettings)[]
  return PAD_PRESETS.find((p) => keys.every((k) => p.settings[k] === settings[k])) ?? null
}

/** Settings a playing pad can follow without restarting (see `updatePad`). */
export const PAD_LIVE_SETTINGS = ['cutoff', 'q', 'drift', 'rate', 'reverb', 'level'] as const
