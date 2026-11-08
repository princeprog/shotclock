import { isIP } from 'node:net'

export function isTrustedMutation(origin: string | null, header: string | null, expectedOrigin: string): boolean {
  return origin === expectedOrigin && header === 'Shotclock'
}

export function isSafeRedirect(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !/[\\\u0000-\u001f\u007f]/.test(value)
}

// Enable only when a trusted ingress strips and replaces this header.
export function trustedClientHeaders(headers: Headers, secret?: string, headerName?: string): Record<string, string> {
  if (!secret && !headerName) return {}
  if (!secret || Buffer.byteLength(secret) < 32 || !headerName || !/^x-[a-z0-9-]+$/.test(headerName.toLowerCase())) throw new Error('Invalid trusted gateway configuration')
  const client = headers.get(headerName) ?? ''
  return isIP(client) ? { 'x-auth-client-ip': client, 'x-auth-gateway-secret': secret } : {}
}
