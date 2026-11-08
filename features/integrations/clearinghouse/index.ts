import { manualAdapter } from './manual'
import { stediAdapter } from './stedi'
import type { ClearinghouseAdapter } from './types'

export * from './types'
const registry = new Map<string, ClearinghouseAdapter>([[manualAdapter.key, manualAdapter], [stediAdapter.key, stediAdapter]])

export function registerClearinghouse(adapter: ClearinghouseAdapter) { registry.set(adapter.key, adapter) }
export function clearinghouseFor(key: string | null | undefined): ClearinghouseAdapter { return registry.get(key || 'manual') ?? manualAdapter }
export const clearinghouseKeys = () => [...registry.keys()]
