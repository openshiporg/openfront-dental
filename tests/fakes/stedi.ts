import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** A fake Stedi sandbox: recorded fixtures keyed by member id; counts calls so tests can prove no duplicate. */
export const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'stedi', name), 'utf8'))

const BY_MEMBER: Record<string, string | 'timeout' | 'gateway'> = {
  'SUM-4401-A': 'eligibility-active.json', 'SUM-4402-B': 'eligibility-inactive.json', 'SUM-4403-C': 'eligibility-aaa-75.json',
  'SUM-4404-D': 'eligibility-aaa-42.json', 'SUM-4405-E': 'timeout', 'SUM-4406-F': 'gateway',
}

export function fakeStedi() {
  const calls: { url: string; headers: Record<string, string>; body: any }[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    calls.push({ url: String(url), headers: init.headers as Record<string, string>, body })
    const what = BY_MEMBER[body.subscriber?.memberId]
    if (what === 'timeout') throw Object.assign(new Error('aborted'), { name: 'TimeoutError' })
    if (what === 'gateway') return new Response('{}', { status: 504 })
    if (!what) return new Response(JSON.stringify(fixture('eligibility-aaa-75.json')), { status: 200 })
    return new Response(JSON.stringify(fixture(what)), { status: 200 })
  }) as unknown as typeof fetch
  return { fetch: fetchImpl, calls }
}
