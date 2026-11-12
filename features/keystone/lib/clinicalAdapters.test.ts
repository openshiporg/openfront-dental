import { afterEach, describe, expect, it } from 'vitest'
import { activeErxAdapter, findingProblem, manualImagingAdapter, printErxAdapter, registerErxAdapter, unregisterErxAdapter } from './clinicalAdapters'

import { ERX_STATUS_TEXT, IMAGING_STATUS_TEXT } from '../../platform/lib/adapterText'

describe('clinical adapter interfaces', () => {
  afterEach(() => unregisterErxAdapter('partner'))
  it('manual imaging has no bridge and returns no studies', async () => {
    expect(manualImagingAdapter.key).toBe('manual')
    expect(await manualImagingAdapter.listStudies(new Date(0))).toEqual([])
  })
  it('eRx is print mode, honestly labelled, until a partner is connected', () => {
    expect(activeErxAdapter()).toBe(printErxAdapter)
    expect(activeErxAdapter().statusText).toBe('eRx: print (no eRx partner connected)')
    expect(activeErxAdapter().connected).toBe(false)
  })
  it('a connected partner takes over, and print returns when it is removed; print cannot be removed', () => {
    registerErxAdapter({ key: 'partner', mode: 'erx', connected: true, statusText: 'eRx: connected' })
    expect(activeErxAdapter().key).toBe('partner')
    unregisterErxAdapter('partner'); unregisterErxAdapter('print')
    expect(activeErxAdapter().key).toBe('print')
  })
  it('the words on the screens match the adapters', () => {
    expect(ERX_STATUS_TEXT).toBe(printErxAdapter.statusText)
    expect(IMAGING_STATUS_TEXT).toBe(manualImagingAdapter.statusText)
  })
  it('refuses findings without a device, version, type, or with a bad confidence', () => {
    const ok = { device: 'Reader A', modelVersion: '1.2', findingType: 'possible caries' }
    expect(findingProblem(ok)).toBeNull()
    expect(findingProblem({ ...ok, device: '' })).toMatch(/device/)
    expect(findingProblem({ ...ok, modelVersion: ' ' })).toMatch(/version/)
    expect(findingProblem({ ...ok, findingType: '' })).toMatch(/what was found/)
    expect(findingProblem({ ...ok, confidence: '1.5' })).toMatch(/0 to 1/)
    expect(findingProblem({ ...ok, confidence: '0.87' })).toBeNull()
  })
})
