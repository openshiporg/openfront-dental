import Link from 'next/link'
import { Brand } from './Brand'

const LINKS = [['Visits', '/#visits'], ['Insurance', '/#insurance'], ['Smile Club', '/#smile-club'], ['Our dentists', '/#dentists'], ['Locations', '/#locations'], ['Patient sign in', '/account/sign-in']] as const

export function Header({ name }: { name: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#e4dccd] bg-[#f7f3ec]/95 backdrop-blur-none">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-1 sm:px-10">
        <Brand name={name} />
        <nav aria-label="Main" className="hidden items-center gap-8 text-[0.95rem] text-[#1b2b2a] lg:flex">
          {LINKS.map(([label, href]) => <Link key={href} href={href} className="min-h-11 content-center hover:text-[#0f6b66]">{label}</Link>)}
          <Link href="/book" className="rounded-[3px] bg-[#dc6244] px-5 py-2.5 font-medium text-white hover:bg-[#c75537]">Book a visit</Link>
        </nav>
        <details className="group relative lg:hidden">
          <summary className="flex size-11 cursor-pointer list-none items-center justify-center text-[#0f6b66] [&::-webkit-details-marker]:hidden" aria-label="Menu">
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </summary>
          <div className="absolute right-0 top-12 w-64 border border-[#e4dccd] bg-[#f7f3ec] p-2 shadow-sm">
            {LINKS.map(([label, href]) => <Link key={href} href={href} className="block min-h-11 content-center px-3 text-base text-[#1b2b2a]">{label}</Link>)}
            <Link href="/book" className="mt-1 block min-h-11 content-center bg-[#dc6244] px-3 font-medium text-white">Book a visit</Link>
          </div>
        </details>
      </div>
    </header>
  )
}
