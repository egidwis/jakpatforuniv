import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const chipVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium",
  {
    variants: {
      variant: {
        blue: "border-blue-200 bg-blue-50 text-blue-700",
        amber: "border-amber-200 bg-amber-50 text-amber-700",
        green: "border-green-200 bg-green-50 text-green-700",
        red: "border-red-200 bg-red-50 text-red-700",
        orange: "border-orange-200 bg-orange-50 text-orange-700",
        indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
        purple: "border-purple-200 bg-purple-50 text-purple-700",
        slate: "border-slate-200 bg-slate-50 text-slate-700",
        outline: "border-border bg-transparent text-foreground",
      },
      size: {
        sm: "h-5 px-1.5 text-[10px]",
        md: "h-6 px-2 text-xs",
      },
    },
    defaultVariants: {
      variant: "slate",
      size: "md",
    },
  }
)

export type ChipVariant = NonNullable<
  VariantProps<typeof chipVariants>["variant"]
>

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {
  /** Renders a small dot in currentColor before the children */
  dot?: boolean
  /** Adds animate-pulse to the dot (only visible when `dot` is set) */
  pulse?: boolean
}

function Chip({
  className,
  variant,
  size,
  dot = false,
  pulse = false,
  children,
  ...props
}: ChipProps) {
  return (
    <span className={cn(chipVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full bg-current",
            pulse && "animate-pulse"
          )}
        />
      )}
      {children}
    </span>
  )
}

export { Chip, chipVariants }
