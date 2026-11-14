import { PortalSignIn } from '@/features/storefront/components/PortalSignIn'

export const metadata = { title: 'Patient sign in' }

export default function SignInPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10 sm:px-10">
      <h1 className="mb-6 text-[2.4rem] font-semibold leading-tight text-[#0b4f4b]">Patient sign in</h1>
      <PortalSignIn />
    </main>
  )
}
