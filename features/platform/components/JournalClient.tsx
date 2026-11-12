'use client';

import * as React from 'react';
import { DownloadButton } from './Phase6Actions';

/** Picks the office and dates, then downloads the ledger journal as a CSV. */
export function JournalClient({ locationOptions, from, to, paths }: { locationOptions: { id: string; name: string }[]; from: string; to: string; paths: string[] }) {
  const [loc, setLoc] = React.useState(locationOptions[0]?.id ?? '');
  const [a, setA] = React.useState(from);
  const [b, setB] = React.useState(to);
  const input = 'h-11 w-full rounded-md border bg-background px-3 text-sm';
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm"><span className="block font-medium">Office</span><select value={loc} onChange={(e) => setLoc(e.target.value)} className={input}>{locationOptions.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span className="block font-medium">From</span><input type="date" value={a} onChange={(e) => setA(e.target.value)} className={input} /></label>
        <label className="space-y-1 text-sm"><span className="block font-medium">To</span><input type="date" value={b} onChange={(e) => setB(e.target.value)} className={input} /></label>
      </div>
      <DownloadButton op="exportJournalCsv" vars={{ locationId: loc, from: a, to: b }} paths={paths}>Download CSV</DownloadButton>
    </div>
  );
}
