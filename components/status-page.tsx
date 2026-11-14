import type { ReactNode } from 'react'
import Link from 'next/link'
import { ShotclockLogo } from '@/components/shotclock-logo'

// A full-page message for missing pages and unexpected failures.
export function StatusPage({ code, title, description, children }: { code: string; title: string; description: string; children: ReactNode }) {
  return <div className="flex min-h-svh flex-col">
    <header className="border-b">
      <div className="mx-auto flex h-20 w-full max-w-6xl items-center px-6 sm:px-8"><Link href="/" aria-label="Shotclock home"><ShotclockLogo /></Link></div>
    </header>
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 pb-24 sm:px-8">
      <p className="text-sm font-medium tabular-nums text-[#A64320] dark:text-[#FFAE88]">{code}</p>
      <div className="flex flex-col gap-3"><h1 className="text-3xl font-semibold tracking-tight text-balance">{title}</h1><p className="text-pretty text-muted-foreground">{description}</p></div>
      <div className="flex flex-wrap gap-3">{children}</div>
    </main>
  </div>
}

