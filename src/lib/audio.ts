/**
 * The page's one AudioContext, shared by the metronome and the key sounds so
 * they can play together. Created on first use, which must be a tap or click:
 * browsers only let a page start sound in answer to one.
 */

let context: AudioContext | null = null

/** Whether this browser can play synthesised sound at all. */
export function audioSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.AudioContext === 'function'
}

export function audioContext(): AudioContext {
  context ??= new AudioContext()
  void context.resume()
  return context
}

/** Calls `stop` whenever the browser tab is hidden. Background tabs throttle
 * timers, so anything scheduled from one would stutter rather than keep going. */
export function stopWhenHidden(stop: () => void) {
  if (typeof document === 'undefined') return
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stop()
  })
}
