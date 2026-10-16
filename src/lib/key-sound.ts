/**
 * Sounds that demonstrate a song's key, synthesised with the Web Audio API (no
 * files, no library):
 *
 * - the **cadence** — I–IV–V–I on a soft keyboard, about 3.5 s, one-shot;
 * - the **pad** — a continuous worship-style pad on the key's full chord (root,
 *   fifth and the major or minor 3rd), until stopped.
 *
 * One of each plays at a time, page-wide; they can overlap each other and the
 * metronome. Both stop when the browser tab is hidden.
 */
import { audioContext, audioSupported, stopWhenHidden } from '@/lib/audio'

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
 * The pad's notes as MIDI: root and fifth low, then the chord again an octave
 * up with its 3rd — open at the bottom so it isn't muddy, the 3rd up where it
 * says major or minor.
 */
export function padNotes({ tonic, minor }: KeyTone): number[] {
  const root = tonic < 4 ? 48 + tonic : 36 + tonic
  return [root, root + 7, root + 12, root + 12 + (minor ? 3 : 4), root + 19]
}

export function startPad(owner: symbol, key: KeyTone) {
  if (!keySoundSupported()) return
  stopPad()
  const ctx = audioContext()
  const at = ctx.currentTime
  const out = ctx.createGain()
  out.gain.setValueAtTime(0.0001, at)
  out.gain.exponentialRampToValueAtTime(0.5, at + 1.5)
  // Detuned saws through a low-pass that drifts slowly: warm, and alive.
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 900
  filter.Q.value = 0.7
  const drift = ctx.createOscillator()
  const depth = ctx.createGain()
  drift.frequency.value = 0.12
  depth.gain.value = 350
  drift.connect(depth).connect(filter.frequency)
  filter.connect(out).connect(output(ctx))
  const oscillators = [drift]
  padNotes(key).forEach((note, i) => {
    for (const cents of [-7, 7]) {
      const osc = ctx.createOscillator()
      const level = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.value = hz(note)
      osc.detune.value = cents
      level.gain.value = i === 0 ? 0.07 : 0.05
      osc.connect(level).connect(filter)
      oscillators.push(osc)
    }
  })
  for (const osc of oscillators) osc.start(at)
  pad = {
    owner,
    out,
    // Fade out rather than cut, like lifting a hand off the keys.
    stop: () => {
      const now = ctx.currentTime
      out.gain.cancelScheduledValues(now)
      out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), now)
      out.gain.exponentialRampToValueAtTime(0.0001, now + 0.8)
      for (const osc of oscillators) osc.stop(now + 0.85)
    },
  }
  notify()
}

/** Stop the pad — only if `owner` is the one playing, when given. */
export function stopPad(owner?: symbol) {
  if (!pad || (owner && pad.owner !== owner)) return
  pad.stop()
  pad = null
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
