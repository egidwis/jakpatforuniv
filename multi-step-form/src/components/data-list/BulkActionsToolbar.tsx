import * as React from "react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

interface BulkActionsToolbarProps {
  count: number
  onClear: () => void
  /** Action buttons slot, rendered between the count and the clear button */
  children?: React.ReactNode
  /** Shifts the pill's center left, to keep it centered over the list column when the pane is open */
  shiftLeftPx?: number
}

/**
 * Floating bulk-actions pill shown at the bottom of a data list while at
 * least one row is selected. z-40 keeps it below modals/sheets (z-50).
 */
export function BulkActionsToolbar({
  count,
  onClear,
  children,
  shiftLeftPx = 0,
}: BulkActionsToolbarProps) {
  const visible = count > 0
  const [entered, setEntered] = React.useState(false)

  React.useEffect(() => {
    if (!visible) {
      setEntered(false)
      return
    }
    // Let the browser paint the initial (hidden) state first so the
    // opacity/translate transition runs on entrance.
    const timer = window.setTimeout(() => setEntered(true), 10)
    return () => window.clearTimeout(timer)
  }, [visible])

  if (!visible) return null

  return (
    <div
      style={shiftLeftPx ? { left: `calc(50% - ${shiftLeftPx}px)` } : undefined}
      className={cn(
        "fixed bottom-6 left-1/2 z-40 -translate-x-1/2",
        "flex items-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-lg",
        "transition-all duration-200 ease-out",
        entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      )}
    >
      <span className="whitespace-nowrap text-sm font-semibold text-gray-900">
        {count} selected
      </span>
      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-gray-200" />
      {children}
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3.5 w-3.5" />
        Clear
      </button>
    </div>
  )
}
