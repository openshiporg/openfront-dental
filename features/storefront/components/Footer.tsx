import { Mark } from './Brand'
import { hoursLines, zoneLabel, type Site } from '../lib/api'

export function Footer({ site }: { site: Site }) {
  return (
    <footer className="bg-[#dcebe6] text-[#1b2b2a]">
      <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-8 sm:px-10 md:grid-cols-2 lg:grid-cols-3">
        <div className="flex items-center gap-2.5 text-[#0f6b66]">
          <Mark className="size-8 text-[#3a9e98]" />
          <span className="font-[family-name:var(--font-sf-brand)] text-xl font-semibold lowercase">{site.practiceName}</span>
        </div>
        {site.locations.map(l => (
          <div key={l.id} className="text-[0.95rem] leading-relaxed">
            <p className="font-medium">{l.name.replace(`${site.practiceName} — `, '')}</p>
            <p><a href={`tel:${l.phone.replace(/[^\d+]/g, '')}`} className="underline underline-offset-2">{l.phone}</a></p>
            {hoursLines(l.hours).map(line => <p key={line}>{line} {zoneLabel(l.timeZone)}</p>)}
          </div>
        ))}
      </div>
    </footer>
  )
}
