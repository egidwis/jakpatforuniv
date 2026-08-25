import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Chip pill DNA JFU (pola stat-badge landing page): tint lembut,
// border 1px muda, label semibold normal-case. Nama variant dipertahankan.
const chipVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-semibold",
  {
    variants: {
      variant: {
        blue: "border-jfu-primary/20 bg-jfu-primary/[0.08] text-jfu-primary",
        amber: "border-amber-300 bg-amber-50 text-amber-800",
        green: "border-green-300 bg-green-50 text-green-800",
        red: "border-red-300 bg-red-50 text-red-800",
        orange: "border-orange-300 bg-orange-50 text-orange-800",
        indigo: "border-indigo-300 bg-indigo-50 text-indigo-800",
        purple: "border-purple-300 bg-purple-50 text-purple-800",
        slate: "border-slate-300 bg-slate-50 text-slate-800",
        outline: "border-border bg-transparent text-foreground",
      },
      size: {
        // Untuk baris rapat yang labelnya bisa panjang — mis. baris status di
        // footer drawer Review, yang kini memuat "Menunggu Perbaikan" dan
        // "Slot Dibatalkan", bukan lagi satu kata.
        xs: "h-5 px-2 text-[10px]",
        sm: "h-6 px-2.5 text-[11px]",
        md: "h-7 px-3 text-xs",
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
