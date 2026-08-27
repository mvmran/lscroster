import * as React from "react"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

/**
 * A push-button that physically sinks when it is on: resting it carries the
 * `raised` depth shadow, pressed it swaps to the inset `well` and drops a pixel,
 * so the state reads at a glance without relying on colour alone.
 */
function ToggleGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex h-7 min-w-14 select-none items-center justify-center rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-raised transition-all outline-none",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "active:translate-y-px",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-[state=on]:translate-y-px data-[state=on]:border-primary/40 data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:shadow-well",
        className
      )}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }
