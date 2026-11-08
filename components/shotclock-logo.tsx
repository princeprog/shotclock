import Image from 'next/image'
import { cn } from 'cn'

export function ShotclockLogo({ className, compactInSidebar = false }: { className?: string; compactInSidebar?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Image src="/shotclock-mark.svg" width={36} height={36} alt="" aria-hidden="true" className={compactInSidebar ? 'shrink-0 transition-[width,height] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none group-data-[collapsible=icon]:size-8' : undefined} />
      <span className={cn('text-base font-semibold tracking-tight whitespace-nowrap', compactInSidebar && 'transition-opacity duration-150 motion-reduce:transition-none group-data-[collapsible=icon]:opacity-0')}>Shotclock<span className="text-[#E67145]">.</span></span>
    </span>
  )
}
