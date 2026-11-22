import { Figtree, Tektur } from 'next/font/google'

const body = Figtree({ subsets: ['latin'], variable: '--font-sf-body' })
const brand = Tektur({ subsets: ['latin'], variable: '--font-sf-brand', weight: ['400', '600'] })

/** The patient site's type and colours. It is a light site; `scheme-light` keeps form controls light on a dark phone. */
export const shell = `${body.variable} ${brand.variable} scheme-light min-h-dvh bg-[#f7f3ec] font-[family-name:var(--font-sf-body)] text-[#1b2b2a] antialiased`
