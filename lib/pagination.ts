export type PaginationMeta = { page: number; pageSize: number; total: number; totalPages: number }
export type PaginatedResult<T> = PaginationMeta & { items: T[] }

export function requirePaginatedResult<T>(value: unknown): PaginatedResult<T> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The server returned an unexpected pagination response. Restart the API and try again.')
  const result = value as Record<string, unknown>
  if (!Array.isArray(result.items) || !Number.isSafeInteger(result.page) || !Number.isSafeInteger(result.pageSize) || !Number.isSafeInteger(result.total) || !Number.isSafeInteger(result.totalPages) || (result.page as number) < 1 || (result.pageSize as number) < 1 || (result.total as number) < 0 || (result.totalPages as number) < 1 || (result.page as number) > (result.totalPages as number)) {
    throw new Error('The server returned an unexpected pagination response. Restart the API and try again.')
  }
  return result as PaginatedResult<T>
}
