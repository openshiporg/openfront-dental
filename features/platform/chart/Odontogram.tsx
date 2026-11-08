import Link from 'next/link';
import { PERMANENT, PRIMARY, toFdi, toPalmer } from '@/features/keystone/lib/teeth';

/*
 * Odontogram. Teeth are stored and linked by Universal number; the label shows Universal, FDI or Palmer.
 * Surfaces are always read in the canonical order (M O D B I F L). Server-rendered SVG: no client code.
 * Status colours: existing (blue), planned (red), completed (green), condition (amber).
 */

export type ChartMark = { id: string; kind: 'procedure' | 'condition'; tooth: string; surfaces: string; status: string; conditionStatus?: string | null; label: string };
export type Numbering = 'universal' | 'fdi' | 'palmer';

const COLOURS = { existing: '#2563eb', planned: '#dc2626', completed: '#16a34a', condition: '#d97706' } as const;

export function markColour(m: Pick<ChartMark, 'kind' | 'status'>) {
  if (m.kind === 'condition') return COLOURS.condition;
  if (m.status === 'existing_current' || m.status === 'existing_other') return COLOURS.existing;
  if (m.status === 'completed' || m.status === 'posted') return COLOURS.completed;
  return COLOURS.planned;
}

export function toothLabel(tooth: string, numbering: Numbering) {
  return numbering === 'fdi' ? toFdi(tooth) : numbering === 'palmer' ? toPalmer(tooth) : tooth;
}

const W = 44; // tooth cell
const S = 30; // tooth square

/** The five surface shapes inside a 30 x 30 square, keyed by the surface the shape stands for. */
function shapes(tooth: string): { key: string; points: string }[] {
  const upper = (/^\d+$/.test(tooth) ? Number(tooth) <= 16 : 'ABCDEFGHIJ'.includes(tooth));
  const rightSide = /^\d+$/.test(tooth) ? Number(tooth) <= 8 || (Number(tooth) >= 25 && Number(tooth) <= 32) : 'ABCDETSRQP'.includes(tooth);
  const top = upper ? 'B' : 'L';
  const bottom = upper ? 'L' : 'B';
  // The patient's right is on the left of the screen: mesial faces the midline.
  const left = rightSide ? 'D' : 'M';
  const right = rightSide ? 'M' : 'D';
  return [
    { key: top, points: '0,0 30,0 22,8 8,8' },
    { key: bottom, points: '0,30 30,30 22,22 8,22' },
    { key: left, points: '0,0 8,8 8,22 0,30' },
    { key: right, points: '30,0 22,8 22,22 30,30' },
    { key: 'O', points: '8,8 22,8 22,22 8,22' },
  ];
}

function Tooth({ tooth, x, y, marks, numbering, href, selected, labelAbove }: { tooth: string; x: number; y: number; marks: ChartMark[]; numbering: Numbering; href: string; selected: boolean; labelAbove: boolean }) {
  const missing = marks.some((m) => m.kind === 'condition' && m.label.toLowerCase().includes('missing') && m.conditionStatus !== 'resolved');
  const wholeTooth = marks.filter((m) => !m.surfaces);
  const bySurface = (key: string) => marks.filter((m) => m.surfaces && (m.surfaces.includes(key) || (key === 'O' && /[OI]/.test(m.surfaces))));
  return (
    <Link href={href} aria-label={`Tooth ${toothLabel(tooth, numbering)}${marks.length ? `, ${marks.map((m) => m.label).join(', ')}` : ''}`}>
      <g transform={`translate(${x},${y})`} opacity={missing ? 0.45 : 1}>
        <text x={W / 2} y={labelAbove ? -6 : S + 15} textAnchor="middle" fontSize="11" fontFamily="ui-monospace, monospace" fill={selected ? '#0f172a' : '#64748b'} fontWeight={selected ? 700 : 400}>{toothLabel(tooth, numbering)}</text>
        <g transform={`translate(${(W - S) / 2},0)`}>
          {shapes(tooth).map((sh) => {
            const hit = bySurface(sh.key)[0];
            return <polygon key={sh.key} points={sh.points} fill={hit ? markColour(hit) : '#ffffff'} fillOpacity={hit ? 0.85 : 1} stroke="#94a3b8" strokeWidth="1" />;
          })}
          <rect x="0" y="0" width={S} height={S} fill="none" stroke={wholeTooth[0] ? markColour(wholeTooth[0]) : selected ? '#0f172a' : '#64748b'} strokeWidth={wholeTooth[0] || selected ? 3 : 1.25} rx="3" />
          {missing ? <path d="M3 3 L27 27 M27 3 L3 27" stroke="#475569" strokeWidth="2" /> : null}
        </g>
      </g>
    </Link>
  );
}

/** One arch row. `teeth` run left to right as the clinician faces the patient. */
function Arch({ teeth, y, marks, numbering, hrefFor, selected, upper }: { teeth: string[]; y: number; marks: Map<string, ChartMark[]>; numbering: Numbering; hrefFor: (t: string) => string; selected?: string; upper: boolean }) {
  return <>{teeth.map((t, i) => <Tooth key={t} tooth={t} x={i * W + 4} y={y} marks={marks.get(t) ?? []} numbering={numbering} href={hrefFor(t)} selected={selected === t} labelAbove={upper} />)}</>;
}

export function Odontogram({ marks, numbering, dentition, selected, hrefFor }: { marks: ChartMark[]; numbering: Numbering; dentition: 'permanent' | 'primary'; selected?: string; hrefFor: (tooth: string) => string }) {
  const byTooth = new Map<string, ChartMark[]>();
  for (const m of marks) if (m.tooth) byTooth.set(m.tooth, [...(byTooth.get(m.tooth) ?? []), m]);
  const upper = dentition === 'permanent' ? PERMANENT.slice(0, 16) : PRIMARY.slice(0, 10);
  const lower = dentition === 'permanent' ? PERMANENT.slice(16).reverse() : PRIMARY.slice(10).reverse();
  const cols = upper.length;
  const width = cols * W + 8;
  const offset = ((16 - cols) * W) / 2;
  return (
    <div className="max-w-full overflow-x-auto">
      <svg role="img" aria-label="Tooth chart" viewBox={`0 0 ${width} 170`} width={width} height={170} className="mx-auto block min-w-[560px]">
        <Arch teeth={upper} y={22} marks={byTooth} numbering={numbering} hrefFor={hrefFor} selected={selected} upper />
        <line x1={width / 2} x2={width / 2} y1="14" y2="156" stroke="#cbd5e1" strokeDasharray="3 3" />
        <Arch teeth={lower} y={100} marks={byTooth} numbering={numbering} hrefFor={hrefFor} selected={selected} upper={false} />
        <text x="2" y="165" fontSize="10" fill="#94a3b8">Patient’s right</text>
        <text x={width - 2} y="165" textAnchor="end" fontSize="10" fill="#94a3b8">Patient’s left</text>
      </svg>
      {offset ? null : null}
    </div>
  );
}

export function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {([['Existing', COLOURS.existing], ['Planned', COLOURS.planned], ['Completed', COLOURS.completed], ['Condition', COLOURS.condition]] as const).map(([name, colour]) => (
        <span key={name} className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm" style={{ background: colour }} />{name}</span>
      ))}
    </div>
  );
}
