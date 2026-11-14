'use client'

import './globals.css'

// Replaces the root layout when it fails, so it renders its own document and avoids app providers.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en">
    <body className="antialiased">
      <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center gap-6 px-6 sm:px-8">
        <p className="text-sm font-medium text-[#A64320]">Shotclock</p>
        <div className="flex flex-col gap-3"><h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1><p className="text-muted-foreground">Shotclock couldn’t load. Try again in a moment.</p></div>
        <div><button type="button" onClick={reset} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">Try again</button></div>
      </main>
    </body>
  </html>
}

