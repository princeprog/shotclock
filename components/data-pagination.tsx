'use client'

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PaginationMeta } from '@/lib/pagination'

export function DataPagination({ meta, onPageChange, onPageSizeChange }: { meta: PaginationMeta; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void }) {
  const first = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1
  const last = Math.min(meta.page * meta.pageSize, meta.total)
  const sizes = [10, 20].filter((size) => size === 10 || meta.total > 10)

  return <div className="flex flex-wrap items-center justify-between gap-4 border-t px-5 py-3 text-sm text-muted-foreground">
    <div className="flex items-center gap-2">
      {sizes.length > 1 && <><span id="page-size-label">Rows per page</span><Select value={String(meta.pageSize)} onValueChange={(value) => { if (value) onPageSizeChange(Number(value)) }} items={sizes.map((size) => ({ value: String(size), label: String(size) }))}><SelectTrigger aria-labelledby="page-size-label" size="sm"><SelectValue /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectGroup>{sizes.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectGroup></SelectContent></Select></>}
    </div>
    <nav aria-label="Table pagination" className="flex items-center gap-3">
      <span aria-live="polite">{first}–{last} of {meta.total}</span>
      <span>Page {meta.page} of {meta.totalPages}</span>
      <Button type="button" size="icon-sm" variant="outline" aria-label="Previous page" disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}><ChevronLeftIcon /></Button>
      <Button type="button" size="icon-sm" variant="outline" aria-label="Next page" disabled={meta.page >= meta.totalPages} onClick={() => onPageChange(meta.page + 1)}><ChevronRightIcon /></Button>
    </nav>
  </div>
}
