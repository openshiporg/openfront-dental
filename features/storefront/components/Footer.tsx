import { Mark } from './Brand'
import { addressLine, hoursLines, zoneLabel, type Site } from '../lib/api'

export function Footer({ site }: { site: Site }) {
  const first = site.locations[0]
  return (
    <footer className="bg-[#dcebe6] text-[#1b2b2a]">
      <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-8 sm:px-10 md:grid-cols-2">
        <div className="space-y-2 text-[0.95rem] leading-relaxed">
          <div className="flex items-center gap-2.5 text-[#0f6b66]">
            <Mark className="size-8 text-[#3a9e98]" />
            <span className="font-[family-name:var(--font-sf-brand)] text-xl font-semibold lowercase">{site.practiceName}</span>
          </div>
          {first ? (
            <>
              <p><a href={`tel:${first.phone.replace(/[^\d+]/g, '')}`} className="min-h-11 underline underline-offset-2">{first.phone}</a></p>
              <p><strong className="font-medium">Hours</strong> {hoursLines(first.hours).join(', ')} {zoneLabel(first.timeZone)}</p>
            </>
          ) : null}
        </div>
        <ul className="divide-y divide-[#b9d3cc] text-[0.95rem] leading-relaxed">
          {site.locations.map(l => (
            <li key={l.id}>
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.name} ${addressLine(l.address)}`)}`} target="_blank" rel="noreferrer" className="block min-h-11 py-2 underline-offset-2 hover:underline">
                <span className="block font-medium">{l.name.replace(`${site.practiceName} — `, '')}</span>
                <span className="block">{addressLine(l.address)}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  )
}
