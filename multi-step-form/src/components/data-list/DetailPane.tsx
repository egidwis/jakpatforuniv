import * as React from "react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

interface DetailPaneProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Row of status chips rendered under the title/subtitle */
  chips?: React.ReactNode
  /** Pinned strip between header and scrollable body (e.g. a tab bar) */
  nav?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  onClose: () => void
  className?: string
}

/**
 * Inline (non-modal) right-side detail pane — the Outlook-reading-pane
 * counterpart to DetailSheet. No portal, no overlay, no focus trap: the
 * list beside it stays interactive. Esc closes (unless a Radix layer
 * already handled it).
 */
export function DetailPane({
  title,
  subtitle,
  chips,
  nav,
  children,
  footer,
  onClose,
  className,
}: DetailPaneProps) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <aside
      className={cn(
        "flex w-[520px] shrink-0 flex-col border-l border-gray-200 bg-white",
        className
      )}
    >
      <div className="relative shrink-0 border-b px-5 py-4 pr-12">
        <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
        ) : null}
        {chips ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">{chips}</div>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
      {nav ? <div className="shrink-0 border-b bg-white px-5">{nav}</div> : null}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">{children}</div>
      {footer ? <div className="shrink-0 border-t px-5 py-3">{footer}</div> : null}
    </aside>
  )
}
