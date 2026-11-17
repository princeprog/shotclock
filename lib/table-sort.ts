export type SortDir = 'asc' | 'desc'
export type SortState<K extends string = string> = { key: K; dir: SortDir } | null
export type SortValue = string | number | null | undefined

// Clicking a column sorts ascending, then descending, then returns to the table's default order.
export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (!current || current.key !== key) return { key, dir: 'asc' }
  return current.dir === 'asc' ? { key, dir: 'desc' } : null
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const empty = (value: SortValue) => value === null || value === undefined || value === ''

// Stable sort for rows already in the browser. Empty values stay last in both directions.
export function sortRows<T, K extends string>(rows: readonly T[], sort: SortState<K>, accessors: Record<K, (row: T) => SortValue>): T[] {
  if (!sort) return [...rows]
  const read = accessors[sort.key]
  const factor = sort.dir === 'asc' ? 1 : -1
  return rows.map((row, index) => ({ row, index, value: read(row) })).sort((a, b) => {
    if (empty(a.value) || empty(b.value)) return empty(a.value) === empty(b.value) ? a.index - b.index : empty(a.value) ? 1 : -1
    const order = typeof a.value === 'number' && typeof b.value === 'number' ? a.value - b.value : collator.compare(String(a.value), String(b.value))
    return order * factor || a.index - b.index
  }).map((item) => item.row)
}

// Season lifecycle order, used wherever a status column is sorted.
export const statusRank = (status: string | null | undefined) => status ? ({ draft: 1, active: 2, completed: 3 } as Record<string, number>)[status] ?? 4 : null

// Query parameters for tables sorted by the API.
export function sortParams<K extends string>(sort: SortState<K>): Record<string, string> {
  return sort ? { sortBy: sort.key, sortDir: sort.dir } : {}
}
