import Link from 'next/link'

export function Mark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25z" />
      <path d="M16 2.5 10 16l6 13.5 6-13.5z" />
      <path d="M4.3 9.25 10 16 4.3 22.75M27.7 9.25 22 16l5.7 6.75M10 16h12" />
    </svg>
  )
}

export function Brand({ name }: { name: string }) {
  const words = name.toLowerCase().split(' ')
  const last = words.pop() ?? ''
  return (
    <Link href="/" aria-label={name} className="flex min-h-11 items-center gap-2.5 text-[#0f6b66] no-underline">
      <Mark className="size-8 shrink-0 text-[#3a9e98]" />
      <span className="font-[family-name:var(--font-sf-brand)] text-[1.2rem] leading-none sm:text-[1.45rem]">
        {words.length ? <span className="font-semibold">{words.join(' ')} </span> : null}<span className="font-normal">{last}</span>
      </span>
    </Link>
  )
}
