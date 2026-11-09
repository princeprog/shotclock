const localOrigin = 'https://shotclock.invalid'

export function shouldChooseOrganization(status: 'pending' | 'error' | 'success', fetchStatus: 'fetching' | 'paused' | 'idle', hasOrganization: boolean): boolean {
  return status === 'success' && fetchStatus === 'idle' && !hasOrganization
}

export function organizationReturnPath(value: string | null): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/'
  try {
    const url = new URL(value, localOrigin)
    if (url.origin !== localOrigin || !url.pathname.startsWith('/manage/') || url.pathname === '/manage/organizations') return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

export function organizationPickerUrl(path: string): string {
  const returnTo = organizationReturnPath(path)
  return `/organizations?${new URLSearchParams({ returnTo })}`
}
