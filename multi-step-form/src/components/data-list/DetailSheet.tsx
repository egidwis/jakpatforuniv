import * as React from "react"

import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"

interface DetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Row of status chips rendered under the title/subtitle */
  chips?: React.ReactNode
  /** Pinned strip between header and scrollable body (e.g. a tab bar) */
  nav?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}

/**
 * Reusable right-side drawer shell for admin detail views: sticky header
 * (title, subtitle, chips), scrollable body, and an optional pinned footer.
 */
export function DetailSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  chips,
  nav,
  children,
  footer,
}: DetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
      >
        <div className="shrink-0 border-b px-5 py-4 pr-12">
          <SheetTitle className="truncate text-base font-semibold">
            {title}
          </SheetTitle>
          {subtitle ? (
            <SheetDescription className="mt-0.5 text-sm text-gray-500">
              {subtitle}
            </SheetDescription>
          ) : (
            <SheetDescription className="sr-only">
              Detail panel
            </SheetDescription>
          )}
          {chips ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {chips}
            </div>
          ) : null}
        </div>
        {nav ? <div className="shrink-0 border-b bg-white px-5">{nav}</div> : null}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t px-5 py-3">{footer}</div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

interface DetailSheetSectionProps {
  title?: React.ReactNode
  /** Optional right-aligned action node (e.g. an edit button) */
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function DetailSheetSection({
  title,
  action,
  children,
  className,
}: DetailSheetSectionProps) {
  return (
    <section className={cn("space-y-2", className)}>
      {title || action ? (
        <div className="flex items-center gap-2">
          {title ? (
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {title}
            </h3>
          ) : null}
          {action ? <div className="ml-auto shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}
