import Link from 'next/link'
import { Brand } from './Brand'
import { MobileMenu } from './MobileMenu'

const LINKS = [['Visits', '/#visits'], ['Insurance', '/#insurance'], ['Smile Club', '/#smile-club'], ['Our dentists', '/#dentists'], ['Locations', '/#locations'], ['Patient sign in', '/account/sign-in']] as const

export function Header({ name, phone }: { name: string; phone?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#e4dccd] bg-[#f7f3ec]">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-1 sm:px-10">
        <Brand name={name} />
        <nav aria-label="Main" className="hidden items-center gap-8 text-[0.95rem] text-[#1b2b2a] lg:flex">
          {LINKS.map(([label, href]) => <Link key={href} href={href} className="min-h-11 content-center hover:text-[#0f6b66]">{label}</Link>)}
          <Link href="/book" className="rounded-[3px] bg-[#dc6244] px-5 py-2.5 font-medium text-white hover:bg-[#c75537]">Book a visit</Link>
        </nav>
        <MobileMenu links={LINKS} phone={phone} />
      </div>
    </header>
  )
}
