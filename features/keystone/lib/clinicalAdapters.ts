/*
 * Interfaces for the outside systems the clinical side will meet later (imaging software, eRx partners, finding vendors).
 * Only the in-house modes exist today: the manual imaging upload and the print prescription. Nothing here calls out, sends or
 * runs on a timer, and no vendor is wired in. A real adapter is added later by implementing the interface and registering it.
 */

export const IMAGING_MODALITIES = ['bitewing', 'periapical', 'fmx', 'panoramic', 'ceph', 'cbct', 'intraoral_photo', 'extraoral_photo', 'scan_stl'] as const

/** A study as an imaging system reports it. The bridge only describes studies; the office's own record is made by a command. */
export type BridgeStudy = { bridgeRef: string; patientRef: string; modality: (typeof IMAGING_MODALITIES)[number]; teeth: string[]; acquiredAt: string }

export interface ImagingBridgeAdapter {
  key: string
  /** Studies the imaging system has acquired since the given time. A manual adapter returns none. */
  listStudies(since: Date): Promise<BridgeStudy[]>
}

/** Manual mode: staff record a study by hand after the images are taken in the imaging software. There is no bridge. */
export const manualImagingAdapter: ImagingBridgeAdapter & { statusText: string } = { key: 'manual', statusText: 'Imaging: manual entry (no imaging software connected)', listStudies: async () => [] }

/** A finding handed over by an outside reader (a person or a software vendor). The office stores it as a record to look at, nothing more. */
export type FindingIntake = { studyId: string; vendor: string; device: string; modelVersion: string; clearanceRef?: string; findingType: string; tooth?: string; surfaces?: string; confidence?: string }

const CONFIDENCE = /^(0(\.\d{1,4})?|1(\.0{1,4})?)$/
/** Checks a finding before it is stored. Returns a message for the first problem, or null. */
export function findingProblem(f: Partial<FindingIntake>): string | null {
  if (!f.device?.trim()) return 'Say which device or reader produced the finding.'
  if (!f.modelVersion?.trim()) return 'Say which version produced the finding.'
  if (!f.findingType?.trim()) return 'Say what was found.'
  if (f.confidence && !CONFIDENCE.test(f.confidence)) return 'Confidence is a number from 0 to 1.'
  return null
}

export type ErxMode = 'print' | 'erx'
export interface ErxAdapter {
  key: string
  mode: ErxMode
  /** Whether prescriptions can be sent to a pharmacy electronically. */
  connected: boolean
  /** What the screen says about this mode. */
  statusText: string
}

/** Print mode: the prescription is signed and printed for the patient. No eRx partner is connected. */
export const printErxAdapter: ErxAdapter = { key: 'print', mode: 'print', connected: false, statusText: 'eRx: print (no eRx partner connected)' }

const erxAdapters = new Map<string, ErxAdapter>([[printErxAdapter.key, printErxAdapter]])
export const registerErxAdapter = (a: ErxAdapter) => { erxAdapters.set(a.key, a) }
export const unregisterErxAdapter = (key: string) => { if (key !== 'print') erxAdapters.delete(key) }
/** The adapter in use: a connected partner if one is registered, otherwise print. */
export const activeErxAdapter = (): ErxAdapter => [...erxAdapters.values()].find(a => a.connected) ?? printErxAdapter
