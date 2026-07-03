import { useCallback, useMemo, useState } from "react"

/**
 * Generic row-selection hook for data lists / tables.
 *
 * Selection is keyed by string id and survives across pages: `toggleAll`
 * only adds/removes the ids of the current page, leaving other selected
 * ids untouched.
 */
export function useRowSelection() {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  const isSelected = useCallback((id: string) => selected.has(id), [selected])

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const toggleAll = useCallback((pageIds: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev)
      const everySelected =
        pageIds.length > 0 && pageIds.every((id) => prev.has(id))
      if (everySelected) {
        pageIds.forEach((id) => next.delete(id))
      } else {
        pageIds.forEach((id) => next.add(id))
      }
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setSelected(new Set())
  }, [])

  const allSelected = useCallback(
    (pageIds: string[]) =>
      pageIds.length > 0 && pageIds.every((id) => selected.has(id)),
    [selected]
  )

  const someSelected = useCallback(
    (pageIds: string[]) => {
      const selectedCount = pageIds.reduce(
        (acc, id) => (selected.has(id) ? acc + 1 : acc),
        0
      )
      return selectedCount > 0 && selectedCount < pageIds.length
    },
    [selected]
  )

  const count = selected.size

  return useMemo(
    () => ({
      selected,
      isSelected,
      toggle,
      toggleAll,
      clear,
      count,
      allSelected,
      someSelected,
    }),
    [
      selected,
      isSelected,
      toggle,
      toggleAll,
      clear,
      count,
      allSelected,
      someSelected,
    ]
  )
}
