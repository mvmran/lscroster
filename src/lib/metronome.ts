import { audioContext, audioSupported, stopWhenHidden } from '@/lib/audio'

/**
 * A metronome built on the Web Audio API: no audio files, no library. Clicks
 * are short synthesised blips scheduled a little ahead on the audio clock (a
 * timer only tops the queue up), so the beat stays steady even when the page is
 * busy re-rendering.
 *
 * One metronome plays at a time, page-wide: starting another stops the first.
 * It also stops when the browser tab is hidden — background tabs throttle the
 * timer, which would make the click stutter rather than keep time.
 */

export type ClickKind = 'accent' | 'beat' | 'sub'

export interface ClickPattern {
  /** One bar of clicks, in order; the pattern repeats. */
  bar: ClickKind[]
  /** Clicks per counted beat (3 in compound meters, else 1). */
  clicksPerBeat: number
}

/** The slowest and fastest tempos the button will play. */
export const METRONOME_MIN_BPM = 20
export const METRONOME_MAX_BPM = 400

/** `{ beats: 6, unit: 8 }` from a time signature such as `6/8`, or null. */
export function parseMeter(
  meter: string | null | undefined,
): { beats: number; unit: number } | null {
  const match = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(meter ?? '')
  if (!match) return null
  const beats = Number(match[1])
  const unit = Number(match[2])
  return beats >= 1 && [1, 2, 4, 8, 16].includes(unit) ? { beats, unit } : null
}

/**
 * The click pattern for a meter such as `4/4`, `3/4` or `6/8`, or a plain
 * every-beat-the-same click when there is no meter or it isn't one.
 *
 * Simple meters click every beat with beat 1 accented. Compound meters (6/8,
 * 9/8, 12/8) count the dotted-crotchet pulse — the way a 6/8 song's tempo is
 * usually given — so the BPM is the pulse and each pulse carries two soft
 * clicks after it.
 */
export function clickPattern(meter: string | null | undefined): ClickPattern {
  const parsed = parseMeter(meter)
  if (!parsed) return { bar: ['beat'], clicksPerBeat: 1 }
  const { beats, unit } = parsed
  if (unit === 8 && beats > 3 && beats % 3 === 0) {
    const bar: ClickKind[] = []
    for (let pulse = 0; pulse < beats / 3; pulse++) {
      bar.push(pulse === 0 ? 'accent' : 'beat', 'sub', 'sub')
    }
    return { bar, clicksPerBeat: 3 }
  }
  return {
    bar: Array.from({ length: beats }, (_, i): ClickKind => (i === 0 ? 'accent' : 'beat')),
    clicksPerBeat: 1,
  }
}

// --- the engine ----------------------------------------------------------------

const LOOKAHEAD_S = 0.1
const TICK_MS = 25
const TONE: Record<ClickKind, { hz: number; peak: number }> = {
  accent: { hz: 1600, peak: 0.9 },
  beat: { hz: 1000, peak: 0.6 },
  sub: { hz: 800, peak: 0.25 },
}

interface Run {
  owner: symbol
  bpm: number
  pattern: ClickPattern
  /** Audio-clock time of the next click. */
  nextAt: number
  index: number
  /** Everything this run plays goes through here, so stopping is instant. */
  out: GainNode
  timer: ReturnType<typeof setInterval>
}

let audio: AudioContext | null = null
let run: Run | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function click(ctx: AudioContext, out: GainNode, kind: ClickKind, at: number) {
  const { hz, peak } = TONE[kind]
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.frequency.value = hz
  env.gain.setValueAtTime(0.0001, at)
  env.gain.exponentialRampToValueAtTime(peak, at + 0.002)
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.05)
  osc.connect(env).connect(out)
  osc.start(at)
  osc.stop(at + 0.06)
}

function topUp() {
  if (!run || !audio) return
  while (run.nextAt < audio.currentTime + LOOKAHEAD_S) {
    click(audio, run.out, run.pattern.bar[run.index], run.nextAt)
    run.nextAt += 60 / (run.bpm * run.pattern.clicksPerBeat)
    run.index = (run.index + 1) % run.pattern.bar.length
  }
}

function clampBpm(bpm: number) {
  return Math.min(METRONOME_MAX_BPM, Math.max(METRONOME_MIN_BPM, bpm))
}

/** Whether this browser can play the metronome at all. */
export const metronomeSupported = audioSupported

/**
 * Start clicking for `owner`, stopping whoever was playing. Must be called from
 * a tap or click: browsers only let a page start sound in answer to one.
 */
export function startMetronome(owner: symbol, bpm: number, pattern: ClickPattern) {
  if (!metronomeSupported()) return
  stopMetronome()
  audio = audioContext()
  const out = audio.createGain()
  out.connect(audio.destination)
  run = {
    owner,
    bpm: clampBpm(bpm),
    pattern,
    nextAt: audio.currentTime + 0.05,
    index: 0,
    out,
    timer: setInterval(topUp, TICK_MS),
  }
  topUp()
  notify()
}

/** Follow a tempo or meter edit without restarting the bar. */
export function updateMetronome(owner: symbol, bpm: number, pattern: ClickPattern) {
  if (run?.owner !== owner) return
  if (pattern.bar.length !== run.pattern.bar.length) run.index = 0
  run.bpm = clampBpm(bpm)
  run.pattern = pattern
}

/** Stop the metronome — only if `owner` is the one playing, when given. */
export function stopMetronome(owner?: symbol) {
  if (!run || (owner && run.owner !== owner)) return
  clearInterval(run.timer)
  run.out.disconnect()
  run = null
  notify()
}

/** Who is playing, for `useSyncExternalStore`. */
export function metronomeOwner(): symbol | null {
  return run?.owner ?? null
}

export function subscribeMetronome(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

stopWhenHidden(() => stopMetronome())
