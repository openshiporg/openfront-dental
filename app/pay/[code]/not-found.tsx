import Link from 'next/link'
import { shell } from '@/features/storefront/lib/fonts'

export default function PayLinkNotFound() {
  return (
    <main className={`${shell} mx-auto flex max-w-md flex-col justify-center px-5 py-10`}>
      <h1 className="text-[2rem] font-semibold leading-tight text-[#0b4f4b]">This link is not available</h1>
      <p className="mt-3 text-lg">The link may have expired or been replaced by a newer statement. Please call your dental office and we will help you.</p>
      <p className="mt-5"><Link href="/" className="inline-flex min-h-11 items-center underline decoration-[#3a9e98] decoration-2 underline-offset-4">Go to the practice’s site</Link></p>
    </main>
  )
}
