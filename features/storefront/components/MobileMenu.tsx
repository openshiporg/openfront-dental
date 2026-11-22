'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

/** The phone menu: a full-height drawer that closes on a link, on the backdrop and on Escape. */
export function MobileMenu({ links, phone }: { links: readonly (readonly [string, string])[]; phone?: string }) {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const closer = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const from = opener.current
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    closer.current?.focus()
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; from?.focus() }
  }, [open])

  const ring = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3a9e98]'
  return (
    <div className="lg:hidden">
      <button ref={opener} type="button" aria-label="Menu" aria-expanded={open} aria-controls="sf-menu" onClick={() => setOpen(true)} className={`-mr-2 flex size-11 items-center justify-center rounded-full text-[#0f6b66] ${ring}`}>
        <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
      </button>
      {open ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-[#1b2b2a]/45" onClick={() => setOpen(false)} aria-hidden />
          <div id="sf-menu" role="dialog" aria-modal="true" aria-label="Menu" className="absolute inset-y-0 right-0 flex w-[min(21rem,86vw)] flex-col bg-[#f7f3ec] shadow-xl">
            <div className="flex h-[3.25rem] shrink-0 items-center justify-between border-b border-[#e4dccd] pl-5 pr-2">
              <p className="text-lg font-semibold text-[#0b4f4b]">Menu</p>
              <button ref={closer} type="button" aria-label="Close menu" onClick={() => setOpen(false)} className={`flex size-11 items-center justify-center rounded-full text-[#0f6b66] ${ring}`}>
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
              {links.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex min-h-[3.25rem] items-center border-b border-[#e4dccd] text-lg text-[#1b2b2a] ${ring}`}>{label}</Link>)}
            </nav>
            <div className="shrink-0 space-y-1 border-t border-[#e4dccd] px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Link href="/book" onClick={() => setOpen(false)} className={`flex min-h-12 items-center justify-center rounded-[3px] bg-[#dc6244] text-lg font-medium text-white ${ring}`}>Book a visit</Link>
              {phone ? <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={`flex min-h-12 items-center justify-center text-lg text-[#0f6b66] underline underline-offset-4 ${ring}`}>Call {phone}</a> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
