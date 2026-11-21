'use client'

import { cn } from 'cn'

// The Shotclock mark dribbling while its hand ticks round like a shot clock and a ring counts down.
export function RestoringSession({ size = 'page', title = 'Restoring your session', detail = 'Hang tight, getting you back in the game.' }: { size?: 'page' | 'inline'; title?: string; detail?: string }) {
  const page = size === 'page'
  return (
    <div role="status" aria-live="polite" className={cn('sc-appear flex flex-col items-center text-center', page ? 'gap-7' : 'gap-5 py-10')}>
      <span className="sr-only">{title}</span>
      <div aria-hidden="true" className={cn('relative grid place-items-center', page ? 'size-36' : 'size-28')}>
        <svg viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90">
          <circle cx="60" cy="60" r="56" pathLength={100} className="fill-none stroke-border" strokeWidth="2" />
          <circle cx="60" cy="60" r="56" pathLength={100} className="sc-countdown fill-none stroke-[#E67145]" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="100" />
        </svg>
        <div className="flex flex-col items-center">
          <svg viewBox="0 0 64 64" fill="none" className={cn('sc-dribble drop-shadow-sm', page ? 'size-20' : 'size-16')}>
            <rect width="64" height="64" rx="18" fill="#E67145" />
            <path d="M25 10.5h14" stroke="#181310" strokeWidth="3.5" strokeLinecap="round" />
            <circle cx="32" cy="35" r="20" stroke="#181310" strokeWidth="3.5" />
            <path d="M12.5 35h39M32 15.5v39M18.5 21.5c7.5 5.5 10.5 17.5 0 27M45.5 21.5c-7.5 5.5-10.5 17.5 0 27" stroke="#181310" strokeWidth="2.5" strokeLinecap="round" />
            <g className="sc-sweep"><path d="M32 35l8-9" stroke="#FFF5E9" strokeWidth="3.5" strokeLinecap="round" /></g>
            <circle cx="32" cy="35" r="2.5" fill="#FFF5E9" />
          </svg>
          <span className={cn('sc-floor mt-1.5 h-1.5 rounded-full bg-foreground/15 blur-[2px]', page ? 'w-14' : 'w-11')} />
        </div>
      </div>
      <div aria-hidden="true" className="flex flex-col gap-1.5">
        <p className={cn('font-semibold tracking-tight text-foreground', page ? 'text-lg' : 'text-base')}>{title}</p>
        <p className="text-sm text-balance text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}
