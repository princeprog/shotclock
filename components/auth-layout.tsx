import Link from 'next/link'
import { ShotclockLogo } from '@/components/shotclock-logo'

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <Link href="/login" className="w-fit rounded-md focus-visible:outline-2 focus-visible:outline-offset-4">
          <ShotclockLogo />
        </Link>
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>

      <div className="hidden min-h-svh items-center bg-[#191919] px-12 py-16 text-[#f6f4f2] lg:flex xl:px-20" aria-hidden="true">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-12">
          <svg viewBox="0 0 480 330" fill="none" className="w-full" aria-hidden="true">
            <rect x="1" y="1" width="478" height="328" rx="2" stroke="#494642" strokeWidth="1.5" />
            <path d="M160 1v117a80 80 0 0 0 160 0V1M112 1v80a128 128 0 0 0 256 0V1M240 1v42" stroke="#494642" strokeWidth="1.5" />
            <circle cx="240" cy="51" r="8" stroke="#E67145" strokeWidth="2" />
            <path d="M217 40h46" stroke="#E67145" strokeWidth="2" strokeLinecap="round" />
            <path d="M1 276h478" stroke="#494642" strokeWidth="1.5" />
            <path d="M191 329a49 49 0 0 1 98 0" stroke="#494642" strokeWidth="1.5" />
          </svg>
          <div>
            <p className="text-3xl leading-tight font-semibold tracking-tight text-balance xl:text-4xl">Keep your game moving.</p>
            <p className="mt-3 text-base leading-relaxed text-[#bdb8b3]">Everything you need, right on the clock.</p>
          </div>
        </div>
      </div>
    </main>
  )
}
