import { type ChordNotation } from '@/features/services/chord-notation'
import { cn } from '@/lib/utils'

/**
 * Letters or numbers, wherever chords are read or written.
 *
 * An old-style sliding switch: the notation being read is the one you can see,
 * and the knob covers the other. Two words' worth of meaning in the width of a
 * word — every row it sits on already carries a handful of layer buttons, and a
 * labelled pair of buttons crowded them.
 *
 * It always sits immediately after a Chord toggle — in the lyrics editor, and
 * on a plan's Media card — so the one place the notation is chosen is the place
 * the chords are turned on. One per screen: the choice is shared
 * (`useChordNotation`), so a second copy on the same screen would only be a
 * control that moves on its own.
 *
 * Both labels are the accent colour and the knob a lighter shade of it, so the
 * control reads as one object whichever way it is thrown, and the state is told
 * by which character is showing rather than by a colour that has to be learnt.
 *
 * It is never dimmed for being beside the wrong pane: the choice outlives the
 * screen it is made on, so setting it before opening the chords is a reasonable
 * thing to do, and a Sunday-morning control that refuses the first press is
 * worse than one pressed early.
 */
export function ChordNotationToggle({
  value,
  onChange,
  disabled,
}: {
  value: ChordNotation
  onChange: (next: ChordNotation) => void
  disabled?: boolean
}) {
  const numbers = value === 'numbers'
  return (
    // A disabled button swallows its own title, so the hint rides on a wrapper
    // span — which is exactly when the hint matters most.
    <span
      className="inline-flex"
      title={
        disabled
          ? 'Open the Chord pane to switch between letter and number chords'
          : numbers
            ? 'Chords are numbers of the key — switch to letters'
            : 'Chords are letters — switch to numbers of the key'
      }
    >
    <button
      type="button"
      role="switch"
      aria-checked={numbers}
      aria-label="Chord notation"
      disabled={disabled}
      onClick={() => onChange(numbers ? 'letters' : 'numbers')}
      className="border-primary/25 bg-primary/25 focus-visible:ring-ring/50 relative inline-flex h-6 w-11 shrink-0 items-center rounded-md border transition-colors outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {/* The one under the knob is hidden outright rather than left for the
          knob to cover: the knob is a tint over the track, not an opaque cap,
          and a label showing faintly through it would say both at once. */}
      <span
        className={cn(
          'text-primary z-0 flex w-1/2 justify-center font-mono text-[11px] font-semibold transition-opacity',
          numbers && 'opacity-0',
        )}
      >
        G
      </span>
      <span
        className={cn(
          'text-primary z-0 flex w-1/2 justify-center font-mono text-[11px] font-semibold transition-opacity',
          !numbers && 'opacity-0',
        )}
      >
        1
      </span>
      <span
        aria-hidden
        className={cn(
          // Inset on every side so the track shows as a slot around it, and
          // exactly half the track wide — so one full width of travel carries
          // it from covering the left label to covering the right one.
          // `accent` is the light end of the brand ramp, which reads as the
          // raised face on a pale track; in dark mode the ramp runs the other
          // way, so the knob takes a stronger tint to stay the lighter of the
          // two rather than reading as a hole cut in the track.
          'bg-accent dark:bg-primary/45 ring-primary/25 dark:ring-primary/40 pointer-events-none absolute inset-y-0.5 left-0.5 z-10 w-[calc(50%-2px)] rounded-sm shadow-sm ring-1 transition-transform',
          numbers ? 'translate-x-0' : 'translate-x-full',
        )}
      />
    </button>
    </span>
  )
}
