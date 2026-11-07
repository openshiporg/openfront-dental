import { bigInt, decimal, integer, select, text } from '@keystone-6/core/fields'

/** Ledger cash in minor units (SCHEMA G2). */
export const minor = (options: { required?: boolean; defaultValue?: bigint; description?: string } = {}) =>
  bigInt({
    ...(options.defaultValue !== undefined ? { defaultValue: options.defaultValue } : {}),
    validation: { isRequired: options.required ?? options.defaultValue !== undefined },
    ...(options.description ? { ui: { description: options.description } } : {}),
  })

/** ISO-4217 currency code, default USD. */
export const ccy = () =>
  text({ defaultValue: 'USD', validation: { isRequired: true, match: { regex: /^[A-Z]{3}$/, explanation: 'ISO 4217 currency code required' } } })

const exact = (precision: number, scale: number) => (options: { required?: boolean; description?: string } = {}) =>
  decimal({
    precision,
    scale,
    validation: { isRequired: options.required ?? false },
    ...(options.description ? { ui: { description: options.description } } : {}),
  })

/** Percentages (coverage 80.0000, discount 15.0000): numeric(9,4) (SCHEMA G3). */
export const pct = exact(9, 4)
/** Anaesthetic carpules and similar small exact quantities: numeric(6,2) (SCHEMA G13). */
export const dec62 = exact(6, 2)
/** Computed rates and factors: numeric(28,12). */
export const rate = exact(28, 12)

/** Integer basis points (SCHEMA G4). */
export const bps = (defaultValue?: number) =>
  integer({ ...(defaultValue !== undefined ? { defaultValue } : {}), validation: { isRequired: defaultValue !== undefined } })

const option = (value: string) => ({ label: value.replaceAll('_', ' ').replaceAll('.', ' · '), value })

/**
 * A lifecycle status. It changes only through transition mutations (SCHEMA G7): never through the
 * generated create/update operations.
 */
export const lifecycle = (values: readonly string[], initial = values[0]) =>
  select({
    type: 'string',
    options: values.map(option),
    defaultValue: initial,
    validation: { isRequired: true },
    access: { create: () => false, update: () => false },
    ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } },
  })

/** A plain choice that staff may edit. */
export const choice = (values: readonly string[], initial: string | null = values[0]) =>
  select({
    type: 'string',
    options: values.map(option),
    ...(initial !== null ? { defaultValue: initial } : {}),
    validation: { isRequired: initial !== null },
  })

/** Compare-and-set version (SCHEMA G6). Incremented only by server code. */
export const versionField = () =>
  integer({
    defaultValue: 0,
    validation: { isRequired: true },
    access: { create: () => false, update: () => false },
    ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } },
  })

/** Server-written text that is visible but never edited through the API. */
export const systemText = (options: { indexed?: boolean | 'unique'; required?: boolean } = {}) =>
  text({
    ...(options.indexed ? { isIndexed: options.indexed } : {}),
    validation: { isRequired: options.required ?? false },
    access: { create: () => false, update: () => false },
    ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } },
  })

export const readOnly = { access: { create: () => false, update: () => false }, ui: { createView: { fieldMode: 'hidden' as const }, itemView: { fieldMode: 'read' as const } } }

/** A choice fixed at creation by server code (e.g. a grant scope): visible, never edited. */
export const fixedChoice = (values: readonly string[]) =>
  select({
    type: 'string',
    options: values.map(option),
    validation: { isRequired: true },
    access: { create: () => false, update: () => false },
    ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } },
  })
