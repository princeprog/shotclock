import Image from 'next/image'
import { cn } from 'cn'

export function ShotclockLogo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Image src="/shotclock-mark.svg" width={36} height={36} alt="" aria-hidden="true" />
      <span className="text-base font-semibold tracking-tight">Shotclock<span className="text-[#E67145]">.</span></span>
    </span>
  )
}
