import { recordedFetch } from '../../features/integrations/clearinghouse/recorded'

/** A fake Stedi sandbox over the recorded fixtures; counts calls so tests can prove no duplicate. */
export function fakeStedi() {
  const calls: { url: string; headers: Record<string, string>; body: any }[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) })
    return recordedFetch(url, init)
  }) as unknown as typeof fetch
  return { fetch: fetchImpl, calls }
}
