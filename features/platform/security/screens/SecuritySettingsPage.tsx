import { q } from '../../lib/server';
import { Page, Section, Stat } from '../../components/ui';
import { MfaPanel } from '../MfaPanel';

export const dynamic = 'force-dynamic';

/** Your own sign-in security: two-step verification and recovery codes (staff only). */
export default async function SecuritySettingsPage() {
  const data: any = await q(`{ mfaStatus practiceSettings { requireStaffMfa sessionHours } }`).catch(() => ({}));
  const status = data.mfaStatus ?? {};
  const practice = data.practiceSettings ?? {};
  return (
    <Page title="Sign-in security" crumbs={[{ label: 'Practice settings' }]}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat name="Two-step verification" value={status.enrolled ? 'On' : 'Off'} />
        <Stat name="This session" value={status.verified ? 'Verified' : 'Password only'} />
        <Stat name="Recovery codes left" value={status.enrolled ? String(status.recoveryCodesRemaining ?? 0) : '—'} />
        <Stat name="Session length" value={`${practice.sessionHours ?? 12} h`} />
      </div>
      {practice.requireStaffMfa && !status.enrolled ? (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          This practice requires two-step verification for staff. Turn it on below before you work with patient records.
        </p>
      ) : null}
      <Section title="Two-step verification">
        <MfaPanel enrolled={Boolean(status.enrolled)} />
      </Section>
    </Page>
  );
}
