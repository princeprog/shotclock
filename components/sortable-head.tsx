'use client'

import { useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react'
import { TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { nextSort, sortRows, type SortState, type SortValue } from '@/lib/table-sort'

// A column header whose label is a sort button with the direction icon beside it.
export function SortableHead<K extends string>({ column, sort, onSort, children, className, end = false, ...props }: Omit<ComponentProps<typeof TableHead>, 'children' | 'align'> & { column: K; sort: SortState<K>; onSort: (column: K) => void; children: ReactNode; end?: boolean }) {
  const active = sort?.key === column
  const Icon = !active ? ChevronsUpDownIcon : sort.dir === 'asc' ? ArrowUpIcon : ArrowDownIcon
  return (
    <TableHead scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={className} {...props}>
      <button type="button" onClick={() => onSort(column)} className={cn('group/sort inline-flex h-8 items-center gap-1 rounded-md px-2 font-medium transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring', end ? '-mr-2 flex-row-reverse' : '-ml-2', active && 'text-foreground')}>
        {children}
        <Icon aria-hidden="true" className={cn('size-3.5 shrink-0 transition-colors', active ? 'text-foreground' : 'text-muted-foreground/50 group-hover/sort:text-muted-foreground')} />
      </button>
    </TableHead>
  )
}

// Sort state for a table whose rows are already loaded. Returns the sorted rows and the header wiring.
export function useTableSort<T, K extends string>(rows: readonly T[], accessors: Record<K, (row: T) => SortValue>, initial: SortState<K> = null) {
  const [sort, setSort] = useState<SortState<K>>(initial)
  const sorted = useMemo(() => sortRows(rows, sort, accessors), [rows, sort, accessors])
  return { sorted, sort, onSort: (column: K) => setSort((current) => nextSort(current, column)) }
}

