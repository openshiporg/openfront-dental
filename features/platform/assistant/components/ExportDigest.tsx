'use client';

import * as React from 'react';
import { pillClass } from '../../components/ActionButton';

/** The weekly digest: a file made on the page from what is already shown. Nothing is sent anywhere. */
export function ExportDigest({ rows }: { rows: { when: string; what: string; status: string; result: string }[] }) {
  const download = () => {
    const esc = (v: string) => `"${String(v).replaceAll('"', '""')}"`;
    const csv = ['When,Suggestion,Status,Result', ...rows.map((r) => [r.when, r.what, r.status, r.result].map(esc).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'weekly-digest.csv'; a.click();
    URL.revokeObjectURL(url);
  };
  return <button type="button" onClick={download} className={`${pillClass} min-h-11`}>Export digest</button>;
}
