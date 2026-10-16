/**
 * Sounds that demonstrate a song's key, synthesised with the Web Audio API (no
 * files, no library):
 *
 * - the **cadence** — I–IV–V–I on a soft keyboard, about 3.5 s, one-shot;
 * - the **pad** — a continuous worship-style pad in the key, until stopped,
 *   sounding the way the person's pad settings say (`pad-settings`; Dark Warm
 *   unless they chose otherwise).
 *
 * One of each plays at a time, page-wide; they can overlap each other and the
 * metronome. Both stop when the browser tab is hidden.
 */
import { audioContext, audioSupported, stopWhenHidden } from '@/lib/audio'
import { DEFAULT_PAD, PAD_VOICINGS, type PadSettings } from '@/lib/pad-settings'

export interface KeyTone {
  /** The tonic as semitones above C, 0–11. */
  tonic: number
  minor: boolean
}

export const keySoundSupported = audioSupported

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

interface Playing {
  owner: symbol
  /** Everything it plays goes through here, so stopping is one call. */
  out: GainNode
  stop: () => void
}

let cadence: Playing | null = null
let pad: Playing | null = null
let bus: GainNode | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

/** Shared output: a little headroom and a compressor, so chords never clip. */
function output(ctx: AudioContext): GainNode {
  if (!bus) {
    bus = ctx.createGain()
    bus.gain.value = 0.7
    bus.connect(ctx.createDynamicsCompressor()).connect(ctx.destination)
  }
  return bus
}

/** A soft keyboard note: a few sine partials, a quick attack and a decay. */
function keyboardNote(
  ctx: AudioContext,
  out: AudioNode,
  midi: number,
  at: number,
  length: number,
  gain: number,
) {
  const env = ctx.createGain()
  env.gain.setValueAtTime(0.0001, at)
  env.gain.exponentialRampToValueAtTime(gain, at + 0.01)
  env.gain.exponentialRampToValueAtTime(gain * 0.35, at + 0.4)
  env.gain.exponentialRampToValueAtTime(0.0001, at + length)
  env.connect(out)
  for (const [multiple, level] of [[1, 1], [2, 0.45], [3, 0.18], [4, 0.08]]) {
    const osc = ctx.createOscillator()
    const partial = ctx.createGain()
    osc.frequency.value = hz(midi) * multiple
    partial.gain.value = level
    osc.connect(partial).connect(env)
    osc.start(at)
    osc.stop(at + length + 0.05)
  }
}

/**
 * The cadence's chords as MIDI notes: a bass note and a close-voiced triad
 * near middle C, moving smoothly — I, IV (second inversion), V (first
 * inversion), I. Minor keys take i and iv, and the major V that pulls home.
 */
export function cadenceChords({ tonic, minor }: KeyTone): { bass: number; notes: number[] }[] {
  const t = tonic <= 6 ? 60 + tonic : 48 + tonic
  const third = minor ? 3 : 4
  const home = { bass: t - 12, notes: [t, t + third, t + 7] }
  return [
    home,
    { bass: t - 7, notes: [t, t + 5, t + (minor ? 8 : 9)] },
    { bass: t - 5, notes: [t - 1, t + 2, t + 7] },
    home,
  ]
}

const CADENCE_LENGTHS = [0.65, 0.65, 0.65, 1.8]

export function playCadence(owner: symbol, key: KeyTone) {
  if (!keySoundSupported()) return
  stopCadence()
  const ctx = audioContext()
  const out = ctx.createGain()
  out.connect(output(ctx))
  let at = ctx.currentTime + 0.05
  cadenceChords(key).forEach((chord, i) => {
    const length = CADENCE_LENGTHS[i] + 0.3
    keyboardNote(ctx, out, chord.bass, at, length, 0.2)
    for (const note of chord.notes) keyboardNote(ctx, out, note, at, length, 0.12)
    at += CADENCE_LENGTHS[i]
  })
  const total = CADENCE_LENGTHS.reduce((a, b) => a + b, 0) + 0.4
  const timer = setTimeout(() => stopCadence(owner), total * 1000)
  cadence = {
    owner,
    out,
    stop: () => {
      clearTimeout(timer)
      out.disconnect()
    },
  }
  notify()
}

/** Stop the cadence — only if `owner` is the one playing, when given. */
export function stopCadence(owner?: symbol) {
  if (!cadence || (owner && cadence.owner !== owner)) return
  cadence.stop()
  cadence = null
  notify()
}

/**
 * The pad's notes as MIDI for a voicing. The root sits low but not muddy
 * (E2–D♯3, the octave setting moves it); the voicing stacks the rest above it.
 */
export function padNotes(
  { tonic, minor }: KeyTone,
  { voicing, octave }: Pick<PadSettings, 'voicing' | 'octave'> = DEFAULT_PAD,
): number[] {
  const root = (tonic < 4 ? 48 + tonic : 36 + tonic) + 12 * octave
  return PAD_VOICINGS[voicing].notes(minor ? 3 : 4).map((n) => root + n)
}

/**
 * A reverb tail — stereo noise decaying over `seconds` — so the pad sounds in a
 * room rather than in a box. Rendered once per room size.
 */
const impulses = new Map<string, AudioBuffer>()
function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const key = seconds.toFixed(1)
  const cached = impulses.get(key)
  if (cached) return cached
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3
  }
  impulses.set(key, buffer)
  return buffer
}

/** The pad's own output: a compressor straight to the speakers, no headroom
 * cut, so it is as loud as the page it was tuned on. */
let padBus: DynamicsCompressorNode | null = null

interface PadNodes {
  filter: BiquadFilterNode
  depth: GainNode
  drift: OscillatorNode
  dry: GainNode
  wet: GainNode
  level: GainNode
}
let padNodes: PadNodes | null = null

/**
 * Start a pad for `owner` in `key`, sounding the way `settings` say — detuned
 * oscillators per note, spread across the stereo field, through a low-pass
 * that drifts slowly, a fade in, and a dry/reverb mix.
 */
export function startPad(owner: symbol, key: KeyTone, settings: PadSettings = DEFAULT_PAD) {
  if (!keySoundSupported()) return
  stopPad()
  const ctx = audioContext()
  const s = settings
  const at = ctx.currentTime
  if (!padBus) {
    padBus = ctx.createDynamicsCompressor()
    padBus.connect(ctx.destination)
  }

  const out = ctx.createGain()
  out.gain.setValueAtTime(0.0001, at)
  out.gain.exponentialRampToValueAtTime(1, at + s.attack)
  const level = ctx.createGain()
  level.gain.value = s.level
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = s.cutoff
  filter.Q.value = s.q
  const drift = ctx.createOscillator()
  const depth = ctx.createGain()
  drift.frequency.value = s.rate
  depth.gain.value = s.drift
  drift.connect(depth).connect(filter.frequency)
  const dry = ctx.createGain()
  const wet = ctx.createGain()
  const verb = ctx.createConvolver()
  verb.buffer = impulse(ctx, s.room)
  dry.gain.value = 1 - s.reverb * 0.6
  wet.gain.value = s.reverb * 1.4
  filter.connect(out)
  out.connect(dry).connect(level)
  out.connect(verb).connect(wet).connect(level)
  level.connect(padBus)

  const oscillators = [drift]
  const notes = padNotes(key, s)
  const each = 0.32 / (notes.length * Math.sqrt(s.voices))
  notes.forEach((note, i) => {
    for (let v = 0; v < s.voices; v++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const pan = ctx.createStereoPanner()
      osc.type = s.wave
      osc.frequency.value = hz(note)
      osc.detune.value = s.voices === 1 ? 0 : -s.detune + (2 * s.detune * v) / (s.voices - 1)
      const side = s.voices === 1 ? (i % 2 ? 0.5 : -0.5) : -1 + (2 * v) / (s.voices - 1)
      pan.pan.value = side * s.spread
      gain.gain.value = each * (i === 0 ? 1.2 : 1)
      osc.connect(gain).connect(pan).connect(filter)
      oscillators.push(osc)
    }
  })
  // A soft sine an octave above the top notes, for air.
  if (s.sparkle > 0) {
    for (const note of notes.slice(-2)) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = hz(note + 12)
      gain.gain.value = 0.05 * s.sparkle
      osc.connect(gain).connect(out)
      oscillators.push(osc)
    }
  }
  for (const osc of oscillators) osc.start(at)
  padNodes = { filter, depth, drift, dry, wet, level }
  pad = {
    owner,
    out,
    // Fade out rather than cut, like lifting a hand off the keys.
    stop: () => {
      const now = ctx.currentTime
      out.gain.cancelScheduledValues(now)
      out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), now)
      out.gain.exponentialRampToValueAtTime(0.0001, now + s.release)
      for (const osc of oscillators) osc.stop(now + s.release + 0.05)
    },
  }
  notify()
}

/**
 * Move a playing pad to new filter, drift, reverb and level settings without
 * restarting it (`PAD_LIVE_SETTINGS`); anything else needs `startPad` again.
 */
export function updatePad(owner: symbol, settings: PadSettings) {
  if (pad?.owner !== owner || !padNodes) return
  const now = audioContext().currentTime
  const n = padNodes
  n.filter.frequency.setTargetAtTime(settings.cutoff, now, 0.05)
  n.filter.Q.setTargetAtTime(settings.q, now, 0.05)
  n.depth.gain.setTargetAtTime(settings.drift, now, 0.05)
  n.drift.frequency.setTargetAtTime(settings.rate, now, 0.05)
  n.dry.gain.setTargetAtTime(1 - settings.reverb * 0.6, now, 0.05)
  n.wet.gain.setTargetAtTime(settings.reverb * 1.4, now, 0.05)
  n.level.gain.setTargetAtTime(settings.level, now, 0.05)
}

/** Stop the pad — only if `owner` is the one playing, when given. */
export function stopPad(owner?: symbol) {
  if (!pad || (owner && pad.owner !== owner)) return
  pad.stop()
  pad = null
  padNodes = null
  notify()
}

/** Who is playing what, for `useSyncExternalStore`. */
export const cadenceOwner = (): symbol | null => cadence?.owner ?? null
export const padOwner = (): symbol | null => pad?.owner ?? null

export function subscribeKeySound(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

stopWhenHidden(() => {
  stopCadence()
  stopPad()
})
