import MfaForm from '@/features/platform/security/MfaForm';
import { sanitizeDashboardRedirect } from '@/features/dashboard/lib/security';

export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  return <MfaForm from={sanitizeDashboardRedirect((await searchParams).from)} />;
}
