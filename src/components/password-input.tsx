import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Password field with a reveal toggle (issue #138). Typing a password blind on
 * a phone, standing in the foyer, is where sign-ins go wrong — so every
 * password field in the app gets the same eye button.
 *
 * Takes the props of `Input` minus `type`, so `{...form.register('password')}`
 * works unchanged; the ref is forwarded to the input for react-hook-form.
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type'>
>(function PasswordInput({ className, ...props }, ref) {
  const [visible, setVisible] = React.useState(false)
  const Icon = visible ? EyeOff : Eye

  return (
    <div className="relative">
      <Input
        {...props}
        ref={ref}
        type={visible ? 'text' : 'password'}
        // Room for the button, so a long password never runs under it.
        className={cn('pr-9', className)}
      />
      <button
        type="button"
        // Not a tab stop: keyboard users move label → field → next field, and
        // a mouse or thumb is what reaches for the eye.
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        aria-controls={props.id}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg transition-colors focus-visible:ring-3 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        disabled={props.disabled}
      >
        <Icon className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
})
