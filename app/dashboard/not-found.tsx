import Link from 'next/link'

export const metadata = { title: 'Page not found' }

/** A staff link that does not exist, or a page this sign-in is not allowed to open. */
export default function DashboardNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">This page is not available</h1>
      <p className="mt-2 text-muted-foreground">It may not exist, or your role may not include it. Ask the practice owner if you need access.</p>
      <p className="mt-6"><Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 font-medium text-primary-foreground">Back to the dashboard</Link></p>
    </main>
  )
}
