import { getNamedType, isObjectType, isListType, isNonNullType, type GraphQLSchema, type GraphQLObjectType, type GraphQLOutputType } from 'graphql'

/*
 * The generic MCP read tools take a field list from the caller. It is never spliced into a query string.
 * It is parsed here into plain field names (letters, digits, underscore) with optional `{ … }` nesting, every
 * name is checked against the schema type, depth is bounded, and the query is rebuilt from the parsed tree.
 * No arguments, aliases, fragments, directives, variables or string literals can get through, so a caller
 * cannot add a `where`, `orderBy` or a nested `(take: …)`. Field access still applies: the query runs as the caller.
 */

export const MCP_MAX_DEPTH = 3
export const MCP_MAX_FIELDS = 60
export const MCP_MAX_TAKE = 50

export class SelectionError extends Error {}

type Node = { name: string; children: Node[] | null }

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

function tokenize(fields: string): string[] {
  if (typeof fields !== 'string' || fields.length > 2000) throw new SelectionError('fields must be a short list of field names.')
  const tokens = fields.replace(/,/g, ' ').match(/[{}]|[^\s{}]+/g) ?? []
  for (const token of tokens) if (token !== '{' && token !== '}' && !NAME.test(token)) throw new SelectionError(`"${token.slice(0, 40)}" is not a field name. Only field names and { } nesting are allowed.`)
  return tokens
}

function parse(tokens: string[]): Node[] {
  let i = 0
  const level = (depth: number): Node[] => {
    const nodes: Node[] = []
    while (i < tokens.length && tokens[i] !== '}') {
      const token = tokens[i++]
      if (token === '{') throw new SelectionError('A { must follow a field name.')
      const node: Node = { name: token, children: null }
      if (tokens[i] === '{') {
        i++
        if (depth + 1 > MCP_MAX_DEPTH) throw new SelectionError(`Selections may nest at most ${MCP_MAX_DEPTH} levels.`)
        node.children = level(depth + 1)
        if (tokens[i++] !== '}') throw new SelectionError('Unbalanced { }.')
        if (!node.children.length) throw new SelectionError(`"${token}" has an empty selection.`)
      }
      nodes.push(node)
    }
    return nodes
  }
  const nodes = level(1)
  if (i !== tokens.length) throw new SelectionError('Unbalanced { }.')
  if (!nodes.length) throw new SelectionError('Name at least one field.')
  return nodes
}

const unwrap = (type: GraphQLOutputType) => getNamedType(type)

function render(nodes: Node[], type: GraphQLObjectType, count: { n: number }): string {
  const fields = type.getFields()
  return nodes.map(node => {
    if (++count.n > MCP_MAX_FIELDS) throw new SelectionError(`Select at most ${MCP_MAX_FIELDS} fields.`)
    if (node.name.startsWith('__')) throw new SelectionError('Introspection fields are not allowed here.')
    const field = fields[node.name]
    if (!field) throw new SelectionError(`${type.name} has no field "${node.name}".`)
    const named = unwrap(field.type)
    if (isObjectType(named)) {
      if (!node.children) throw new SelectionError(`"${node.name}" needs a { … } selection.`)
      // Nested lists are read with the server's own bound, never the caller's.
      const many = isListType(isNonNullType(field.type) ? field.type.ofType : field.type)
      const args = many && field.args.some(a => a.name === 'take') ? `(take: ${MCP_MAX_TAKE})` : ''
      return `${node.name}${args} { ${render(node.children, named, count)} }`
    }
    if (node.children) throw new SelectionError(`"${node.name}" has no sub-fields.`)
    return node.name
  }).join(' ')
}

/** The query field (a Keystone list query) and a rebuilt, validated selection on its element type. */
export function buildSelection(schema: GraphQLSchema, operation: string, fields: string): { operation: string; selection: string; many: boolean } {
  if (typeof operation !== 'string' || !NAME.test(operation)) throw new SelectionError('operation must be a query name such as "patients".')
  const query = schema.getQueryType()?.getFields()[operation]
  if (!query || operation.startsWith('_')) throw new SelectionError(`There is no query named "${operation}".`)
  const named = unwrap(query.type)
  if (!isObjectType(named)) throw new SelectionError(`"${operation}" does not return records.`)
  const many = isListType(isNonNullType(query.type) ? query.type.ofType : query.type)
  if (!many || !query.args.some(a => a.name === 'take')) throw new SelectionError(`"${operation}" is not a list query. Use the domain tools to read one record.`)
  return { operation, selection: render(parse(tokenize(fields)), named, { n: 0 }), many }
}

/** A bounded `take`: a positive whole number no larger than MCP_MAX_TAKE. */
export const boundedTake = (value: unknown, fallback = 10) => {
  const n = Number(value ?? fallback)
  return Number.isInteger(n) && n > 0 ? Math.min(n, MCP_MAX_TAKE) : fallback
}
