/**
 * Format a groq-js type for a hover: objects are printed with their attributes, recursively, as
 * `name?: type;` lines, so a hover shows what a value holds rather than the word `object`.
 *
 * Named types are expanded from the schema. Output is bounded: objects nested deeper than
 * {@link MAX_DEPTH}, objects past the {@link MAX_ATTRIBUTES_PER_OBJECT} cut-off, and everything
 * past a total of {@link MAX_TOTAL_ATTRIBUTES} printed attributes are cut short, and a recursive
 * type is printed by name where it repeats. {@link FormattedType.notes} says which of those
 * happened so the hover can tell the reader.
 */

import type { ObjectTypeNode, SchemaType, TypeNode } from 'groq-js'

/** How many objects may be nested in one another before the next one is printed as `{ … }`. */
export const MAX_DEPTH = 6
/** How many attributes of a single object are printed. */
export const MAX_ATTRIBUTES_PER_OBJECT = 40
/** How many attributes are printed in all, across every object of one type. */
export const MAX_TOTAL_ATTRIBUTES = 300

const INDENT = '  '

export interface FormattedType {
  text: string
  /** Sentences that explain what was cut short, when anything was. */
  notes: Array<string>
}

export interface FormatOptions {
  /** Print string literals without quotes at the top level, as `_type` names are. */
  bareLiterals?: boolean
}

interface State {
  schema: SchemaType
  printed: number
  tooDeep: boolean
  tooWide: boolean
  tooLarge: boolean
  recursive: boolean
}

/** Format `types` as the union they make up, `null` last. */
export function formatTypes(
  types: Array<TypeNode>,
  schema: SchemaType,
  options: FormatOptions = {}
): FormattedType {
  const state: State = {
    schema,
    printed: 0,
    tooDeep: false,
    tooWide: false,
    tooLarge: false,
    recursive: false,
  }
  const text = formatUnion(types, state, 0, [], options.bareLiterals ?? false)

  const notes: Array<string> = []
  if (state.tooDeep) {
    notes.push(`Objects nested more than ${MAX_DEPTH} levels deep are shown as \`{ … }\`.`)
  }
  if (state.tooWide) {
    notes.push(`Only the first ${MAX_ATTRIBUTES_PER_OBJECT} attributes of an object are shown.`)
  }
  if (state.tooLarge) {
    notes.push(
      `The type is large: after ${MAX_TOTAL_ATTRIBUTES} attributes, objects are shown as \`{ … }\`.`
    )
  }
  if (state.recursive) {
    notes.push('A type that contains itself is shown by name where it repeats.')
  }
  return { text, notes }
}

export function formatType(
  type: TypeNode,
  schema: SchemaType,
  options: FormatOptions = {}
): FormattedType {
  return formatTypes([type], schema, options)
}

function assertNever(value: never): never {
  throw new Error(`Unhandled type: ${JSON.stringify(value)}`)
}

function unionMembers(type: TypeNode): Array<TypeNode> {
  return type.type === 'union' ? type.of.flatMap(unionMembers) : [type]
}

function formatUnion(
  types: Array<TypeNode>,
  state: State,
  depth: number,
  seen: Array<string>,
  bareLiterals: boolean
): string {
  const members = types.flatMap(unionMembers)
  const nullable = members.some((member) => member.type === 'null')
  const parts = [
    ...new Set(
      members.flatMap((member) =>
        member.type === 'null' ? [] : [formatMember(member, state, depth, seen, bareLiterals)]
      )
    ),
  ]
  if (nullable || parts.length === 0) {
    parts.push('null')
  }
  return parts.join(' | ')
}

function formatMember(
  type: TypeNode,
  state: State,
  depth: number,
  seen: Array<string>,
  bareLiterals: boolean
): string {
  switch (type.type) {
    case 'null':
    case 'boolean':
    case 'number':
    case 'unknown':
      return type.type
    case 'string':
      if (type.value === undefined) {
        return 'string'
      }
      return bareLiterals ? type.value : JSON.stringify(type.value)
    case 'array':
      return `Array<${formatUnion([type.of], state, depth, seen, false)}>`
    case 'union':
      return formatUnion([type], state, depth, seen, bareLiterals)
    case 'inline': {
      const declared = state.schema.find((entry) => entry.name === type.name)
      if (!declared) {
        return type.name
      }
      if (seen.includes(type.name)) {
        state.recursive = true
        return type.name
      }
      const inner: TypeNode =
        declared.type === 'document'
          ? { type: 'object', attributes: declared.attributes }
          : declared.value
      return formatUnion([inner], state, depth, [...seen, type.name], bareLiterals)
    }
    case 'object':
      return formatObject(type, state, depth, seen)
    default:
      return assertNever(type)
  }
}

function formatObject(
  type: ObjectTypeNode,
  state: State,
  depth: number,
  seen: Array<string>
): string {
  const attributes = Object.entries(type.attributes)
  if (attributes.length === 0 && !type.rest) {
    return '{}'
  }
  if (depth >= MAX_DEPTH) {
    state.tooDeep = true
    return '{ … }'
  }
  if (state.printed >= MAX_TOTAL_ATTRIBUTES) {
    state.tooLarge = true
    return '{ … }'
  }

  const lines: Array<string> = []
  for (const [name, attribute] of attributes.slice(0, MAX_ATTRIBUTES_PER_OBJECT)) {
    if (state.printed >= MAX_TOTAL_ATTRIBUTES) {
      state.tooLarge = true
      lines.push('…')
      break
    }
    state.printed++
    const value = formatUnion([attribute.value], state, depth + 1, seen, false)
    lines.push(`${name}${attribute.optional ? '?' : ''}: ${value};`)
  }
  if (attributes.length > MAX_ATTRIBUTES_PER_OBJECT) {
    state.tooWide = true
    lines.push(`… ${attributes.length - MAX_ATTRIBUTES_PER_OBJECT} more`)
  }
  if (type.rest?.type === 'unknown') {
    lines.push('[key: string]: unknown;')
  }

  if (lines.length === 0) {
    return '{}'
  }
  const inner = INDENT.repeat(depth + 1)
  const body = lines
    .map((line) =>
      line
        .split('\n')
        .map((part, index) => (index === 0 ? inner + part : part))
        .join('\n')
    )
    .join('\n')
  return `{\n${body}\n${INDENT.repeat(depth)}}`
}
