'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { runCommand } from '../../actions/commands';
import { title } from '../../lib/format';

export type GridOperatory = { id: string; code: string; name: string; kind: string };
export type GridBlock = { id: string; operatoryId: string; startMin: number; endMin: number; label: string; provider: string; providerId: string | null; onlineBookable: boolean };
export type GridAppointment = {
  id: string; ref: string; operatoryId: string; startMin: number; endMin: number; status: string; version: number; typeId: string; typeName: string; colour: string;
  patient: string; provider: string; providerId: string | null; alerts: number; segments: { role: string; startMin: number; endMin: number }[];
};

const PX_PER_MIN = 1.6;
const STATUS_RING: Record<string, string> = {
  scheduled: 'ring-amber-400', confirmed: 'ring-emerald-500', arrived: 'ring-sky-500', seated: 'ring-cyan-600', ready_for_checkout: 'ring-lime-600',
  completed: 'ring-slate-300', broken: 'ring-red-500', cancelled: 'ring-red-300',
};

const clock = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${h < 12 ? 'a' : 'p'}`;
};

/**
 * One location-day by operatory. Template blocks shade the open hours; appointments sit on top with
 * their unit pattern (provider, assistant, hygienist, exam). Dragging a booked visit to another chair
 * or time asks the server to reschedule it: the server checks the template, the chair, the provider
 * and the patient again and refuses a clash, so the grid can never create a double booking.
 */
export function ScheduleGrid({ date, locationId, operatories, blocks, appointments, startMin, endMin, unitMinutes, offsetMinutes, selectedId, hrefFor }: {
  date: string; locationId: string; operatories: GridOperatory[]; blocks: GridBlock[]; appointments: GridAppointment[];
  startMin: number; endMin: number; unitMinutes: number; offsetMinutes: number; selectedId?: string | null; hrefFor: Record<string, string>;
}) {
  const router = useRouter();
  const [message, setMessage] = React.useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  const height = (endMin - startMin) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = Math.ceil(startMin / 60) * 60; m < endMin; m += 60) hours.push(m);

  const drop = (event: React.DragEvent<HTMLDivElement>, operatoryId: string) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/appointment');
    const grabOffset = Number(event.dataTransfer.getData('text/offset') || '0');
    const appointment = appointments.find((a) => a.id === id);
    if (!appointment) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const raw = startMin + (event.clientY - rect.top) / PX_PER_MIN - grabOffset;
    const minute = Math.max(startMin, Math.round(raw / unitMinutes) * unitMinutes);
    if (minute === appointment.startMin && operatoryId === appointment.operatoryId) return;
    const operatory = operatories.find((o) => o.id === operatoryId);
    const block = blocks.find((b) => b.operatoryId === operatoryId && b.startMin <= minute && minute < b.endMin);
    const providerId = block?.providerId ?? appointment.providerId;
    if (!window.confirm(`Move ${appointment.ref} (${appointment.patient}) to ${operatory?.code ?? 'chair'} at ${clock(minute)}?`)) return;
    const startsAt = new Date(Date.parse(`${date}T00:00:00Z`) + (minute - offsetMinutes) * 60_000).toISOString();
    setMessage(null);
    start(async () => {
      const r = await runCommand('rescheduleAppointment', {
        appointmentId: appointment.id, expectedVersion: appointment.version, locationId, operatoryId, typeId: appointment.typeId, startsAt, providerId, reason: 'Moved on the schedule',
      }, `rescheduleAppointment:${crypto.randomUUID()}`, ['/dashboard/platform/schedule']);
      if (!r.ok) setMessage({ kind: 'error', text: r.error });
      else { setMessage({ kind: 'ok', text: `Moved to ${operatory?.code} at ${clock(minute)}.` }); router.refresh(); }
    });
  };

  return (
    <div className="space-y-2">
      {message ? <p role={message.kind === 'error' ? 'alert' : 'status'} className={cn('text-sm', message.kind === 'error' ? 'text-red-600' : 'text-emerald-700')}>{message.text}</p> : null}
      {pending ? <p className="text-sm text-muted-foreground">Moving…</p> : null}
      <div className="max-w-full overflow-x-auto rounded-lg border">
        <div className="flex min-w-max">
          <div className="sticky left-0 z-20 w-14 shrink-0 border-r bg-background">
            <div className="h-10 border-b" />
            <div className="relative" style={{ height }}>
              {hours.map((m) => (
                <div key={m} className="absolute left-0 right-0 -translate-y-1/2 pr-2 text-right font-mono text-[11px] text-muted-foreground" style={{ top: (m - startMin) * PX_PER_MIN }}>{clock(m).replace(':00', '')}</div>
              ))}
            </div>
          </div>
          {operatories.map((op) => (
            <div key={op.id} className="w-40 shrink-0 border-r last:border-r-0 sm:w-44">
              <div className="sticky top-0 z-10 flex h-10 flex-col justify-center border-b bg-background px-2">
                <span className="text-sm font-semibold">{op.code}</span>
                <span className="truncate text-[11px] text-muted-foreground">{op.name}</span>
              </div>
              <div className="relative bg-muted/40" style={{ height }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, op.id)}>
                {hours.map((m) => <div key={m} className="absolute left-0 right-0 border-t border-dashed border-border/70" style={{ top: (m - startMin) * PX_PER_MIN }} />)}
                {blocks.filter((b) => b.operatoryId === op.id).map((b) => (
                  <div key={b.id} title={`${b.label} · ${b.provider}`} className="absolute left-0 right-0 border-y border-border/60 bg-background" style={{ top: (b.startMin - startMin) * PX_PER_MIN, height: (b.endMin - b.startMin) * PX_PER_MIN }}>
                    <span className="absolute right-1 top-0.5 font-mono text-[10px] text-muted-foreground">{b.provider}{b.onlineBookable ? ' · web' : ''}</span>
                  </div>
                ))}
                {appointments.filter((a) => a.operatoryId === op.id).map((a) => {
                  const muted = ['completed', 'broken', 'cancelled'].includes(a.status);
                  const draggable = ['scheduled', 'confirmed'].includes(a.status);
                  return (
                    <Link
                      key={a.id}
                      href={hrefFor[a.id]}
                      scroll={false}
                      draggable={draggable}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/appointment', a.id);
                        const rect = e.currentTarget.getBoundingClientRect();
                        e.dataTransfer.setData('text/offset', String(Math.round((e.clientY - rect.top) / PX_PER_MIN)));
                      }}
                      className={cn(
                        'absolute left-1 right-1 z-10 overflow-hidden rounded-md bg-background text-left shadow-sm ring-2 ring-inset transition hover:z-20 hover:shadow-md',
                        STATUS_RING[a.status] ?? 'ring-border', muted && 'opacity-60', selectedId === a.id && 'outline outline-2 outline-offset-1 outline-foreground',
                        draggable && 'cursor-grab',
                      )}
                      style={{ top: (a.startMin - startMin) * PX_PER_MIN + 1, height: Math.max(18, (a.endMin - a.startMin) * PX_PER_MIN - 2) }}
                    >
                      <span className="absolute inset-y-0 left-0 flex w-1.5 flex-col">
                        {a.segments.map((s, i) => (
                          <span key={i} title={title(s.role)} style={{ flexGrow: s.endMin - s.startMin, background: s.role === 'assistant' ? '#cbd5e1' : s.role === 'exam' ? '#f59e0b' : a.colour }} />
                        ))}
                      </span>
                      <span className="block pl-3 pr-1 pt-0.5 text-[11px] leading-tight">
                        <span className="block line-clamp-2 font-semibold">{a.patient}{a.alerts ? ' ⚠' : ''}</span>
                        <span className="block line-clamp-2 text-muted-foreground">{clock(a.startMin)} · {a.typeName}</span>
                        <span className="block line-clamp-2 text-[10px] text-muted-foreground">{a.provider} · {title(a.status)}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Drag a scheduled or confirmed visit to move it. Left stripe: provider (type colour), assistant (grey), dentist exam (amber). Ring colour is the status.</p>
    </div>
  );
}
