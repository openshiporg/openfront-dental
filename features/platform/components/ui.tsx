import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { title as words } from '../lib/format';

const GREEN = ['active', 'approved', 'completed', 'delivered', 'confirmed', 'checked_in', 'seated', 'arrived', 'in_progress', 'ready_for_checkout', 'live', 'paid', 'ok', 'applied', 'acknowledged', 'verified', 'enrolled', 'granted', 'converted', 'executed', 'replied_confirm', 'sent', 'booked', 'published']
const AMBER = ['pending', 'requested', 'draft', 'running', 'executing', 'proposed', 'validated', 'leased', 'submitted', 'unconfirmed', 'unknown', 'paused', 'started', 'held', 'scheduled', 'queued', 'offered', 'possible', 'no_reply', 'prospect', 'invited']
const BLUE = ['sandbox', 'manual_export', 'expired', 'superseded', 'rescheduled', 'inactive', 'merged_into', 'scheduled_elsewhere', 'suppressed', 'replied_other', 'reverted', 'released', 'new']
const RED = ['rejected', 'rejected_spam', 'cancelled', 'failed', 'dead', 'revoked', 'broken', 'no_show', 'breached', 'archived', 'deceased', 'replied_cancel', 'disabled', 'suspended', 'blocked']
const DOT: Record<string, string> = Object.fromEntries([
  ...GREEN.map(v => [v, 'bg-emerald-500']), ...AMBER.map(v => [v, 'bg-amber-500']), ...BLUE.map(v => [v, 'bg-blue-500']), ...RED.map(v => [v, 'bg-red-500']),
])

export function Status({ value, className }: { value?: string | null; className?: string }) {
  if (!value) return null;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-muted-foreground', className)}>
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT[value] || 'bg-muted-foreground/50')} />
      {words(value)}
    </span>
  );
}

/** A screen. `status` puts the record's state as a dot on the title line. */
export function Page({ title, status, crumbs = [], children }: { title: string; status?: string | null; crumbs?: { label: string; href?: string }[]; children: React.ReactNode }) {
  return (
    <PageContainer
      title={title}
      breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, ...crumbs.map((c) => ({ type: (c.href ? 'link' : 'page') as 'link' | 'page', label: c.label, href: c.href })), { type: 'page', label: title }]}
      header={<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"><h1 className="min-w-0 break-words text-xl font-semibold tracking-tight">{title}</h1><Status value={status} /></div>}
    >
      <div className="min-w-0 space-y-6 px-4 pb-10 md:px-6">{children}</div>
    </PageContainer>
  );
}

/** A list item's first line: name, then its state as a dot. */
export function TitleLine({ children, status, className }: { children: React.ReactNode; status?: string | null; className?: string }) {
  return <div className={cn('flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5', className)}>{children}<Status value={status} /></div>;
}

export function Tabs({ items, active }: { items: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {items.map((i) => (
          <Link key={i.key} href={i.href} className={cn('whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium', i.key === active ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
            {i.label}{i.count !== undefined ? <span className="ml-1.5 font-mono text-xs text-muted-foreground">{i.count}</span> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-3 border-b pb-2">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Row({ children, href, className }: { children: React.ReactNode; href?: string; className?: string }) {
  const cls = cn('flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-3 text-sm last:border-b-0', href && 'hover:bg-muted/40', className);
  return href ? <Link href={href} className={cls}>{children}</Link> : <div className={cls}>{children}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-sm text-muted-foreground">{children}</p>;
}

export function Stat({ name, value }: { name: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{name}</div>
      <div className="mt-1 break-words text-lg font-semibold">{value}</div>
    </div>
  );
}

export const Meta = ({ children }: { children: React.ReactNode }) => <span className="min-w-0 break-words text-xs text-muted-foreground">{children}</span>;
