/**
 * Format a groq-js type for a hover: objects are printed with their attributes, recursively, as
 * `name?: type;` lines, so a hover shows what a value holds rather than the word `object`.
 *
 * Types print as `@sanity/codegen` generates them, with named types expanded from the schema:
 * literals as literals, an empty union as `never`, an array of named types with the `_key` its
 * `ArrayOf<…>` adds, and a type the schema does not name, or an object whose other attributes
 * groq-js cannot tell, as `unknown`. Output is bounded: objects nested deeper than
 * {@link MAX_DEPTH}, objects past the {@link MAX_ATTRIBUTES_PER_OBJECT} cut-off, and everything
 * past a total of {@link MAX_TOTAL_ATTRIBUTES} printed attributes are cut short, and a recursive
 * type is printed by name where it repeats. {@link FormattedType.notes} says which of those
 * happened so the hover can tell the reader.
 */

import type { ArrayTypeNode, ObjectAttribute, ObjectTypeNode, SchemaType, TypeNode } from 'groq-js'

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

/**
 * A union of `true` and `false` is `boolean`, as codegen prints it. The merged type takes the place
 * of the first boolean, and a lone `true` or `false` stays a literal.
 */
function mergeBooleans(members: Array<TypeNode>): Array<TypeNode> {
  const booleans = members.filter((member) => member.type === 'boolean')
  const complete =
    booleans.some((member) => member.value === undefined) ||
    (booleans.some((member) => member.value === true) &&
      booleans.some((member) => member.value === false))
  if (!complete || booleans.length < 2) {
    return members
  }
  let merged = false
  return members.flatMap((member): Array<TypeNode> => {
    if (member.type !== 'boolean') {
      return [member]
    }
    if (merged) {
      return []
    }
    merged = true
    return [{ type: 'boolean' }]
  })
}

/**
 * `keyed` adds the `_key: string` that codegen's `ArrayOf<…>` gives each item of an array of
 * named types.
 */
function formatUnion(
  types: Array<TypeNode>,
  state: State,
  depth: number,
  seen: Array<string>,
  bareLiterals: boolean,
  keyed = false
): string {
  const members = mergeBooleans(types.flatMap(unionMembers))
  if (members.length === 0) {
    return 'never'
  }
  const nullable = members.some((member) => member.type === 'null')
  const parts = [
    ...new Set(
      members.flatMap((member) =>
        member.type === 'null'
          ? []
          : [formatMember(member, state, depth, seen, bareLiterals, keyed)]
      )
    ),
  ]
  if (nullable) {
    parts.push('null')
  }
  return parts.join(' | ')
}

function formatMember(
  type: TypeNode,
  state: State,
  depth: number,
  seen: Array<string>,
  bareLiterals: boolean,
  keyed: boolean
): string {
  switch (type.type) {
    case 'null':
    case 'unknown':
      return type.type
    case 'boolean':
    case 'number':
      return type.value === undefined ? type.type : String(type.value)
    case 'string':
      if (type.value === undefined) {
        return 'string'
      }
      return bareLiterals ? type.value : JSON.stringify(type.value)
    case 'array':
      return formatArray(type, state, depth, seen)
    case 'union':
      return formatUnion([type], state, depth, seen, bareLiterals, keyed)
    case 'inline': {
      const declared = state.schema.find((entry) => entry.name === type.name)
      if (!declared) {
        return 'unknown'
      }
      if (seen.includes(type.name)) {
        state.recursive = true
        return keyed
          ? `${type.name} & ${formatObject({ type: 'object', attributes: {} }, state, depth, seen, true)}`
          : type.name
      }
      const inner: TypeNode =
        declared.type === 'document'
          ? { type: 'object', attributes: declared.attributes }
          : declared.value
      return formatUnion([inner], state, depth, [...seen, type.name], bareLiterals, keyed)
    }
    case 'object':
      return formatObject(type, state, depth, seen, keyed)
    default:
      return assertNever(type)
  }
}

/**
 * An array as codegen types it: an array of named types is an `ArrayOf<…>`, whose items have a
 * `_key`, and an array of named types and other types is split into one array of each.
 */
function formatArray(
  type: ArrayTypeNode,
  state: State,
  depth: number,
  seen: Array<string>
): string {
  const of = type.of
  if (of.type !== 'union') {
    return `Array<${formatUnion([of], state, depth, seen, false, of.type === 'inline')}>`
  }
  const named = of.of.filter((member) => member.type === 'inline')
  if (named.length === 0 || named.length === of.of.length) {
    return `Array<${formatUnion([of], state, depth, seen, false, named.length > 0)}>`
  }
  const others = of.of.filter((member) => member.type !== 'inline')
  return [others, named]
    .map((members) =>
      formatArray({ type: 'array', of: { type: 'union', of: members } }, state, depth, seen)
    )
    .join(' | ')
}

export interface ObjectShape {
  /** The object's own attributes, then those its `rest` adds, in order. */
  attributes: Array<[string, ObjectAttribute]>
  /** Whether the object may hold attributes the schema does not name. */
  open: boolean
}

/**
 * The attributes an object holds, with those of its `rest` folded in. `sanity schema extract`
 * writes an array item that is a reference as `{ _key }` whose `rest` is a named reference type,
 * so the attributes of the named type are part of the item. An own attribute wins over the same
 * name in `rest`, as it does when groq-js reads an attribute.
 */
export function objectShape(
  type: ObjectTypeNode,
  schema: SchemaType,
  seen: Array<string> = []
): ObjectShape {
  const attributes = Object.entries(type.attributes)
  const names = new Set(Object.keys(type.attributes))
  let open = false
  let rest = type.rest
  const visited = [...seen]
  while (rest) {
    if (rest.type === 'unknown') {
      open = true
      break
    }
    let object: ObjectTypeNode | undefined
    if (rest.type === 'inline') {
      const { name } = rest
      if (visited.includes(name)) {
        break
      }
      visited.push(name)
      const declared = schema.find((entry) => entry.name === name)
      if (!declared) {
        open = true
        break
      }
      if (declared.type === 'document') {
        object = { type: 'object', attributes: declared.attributes }
      } else if (declared.value.type === 'object') {
        object = declared.value
      }
    } else {
      object = rest
    }
    if (!object) {
      break
    }
    for (const entry of Object.entries(object.attributes)) {
      if (!names.has(entry[0])) {
        names.add(entry[0])
        attributes.push(entry)
      }
    }
    rest = object.rest
  }
  return { attributes, open }
}

/** An identifier name, which a TypeScript property can have without quotes. */
const IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*$/u

function formatObject(
  type: ObjectTypeNode,
  state: State,
  depth: number,
  seen: Array<string>,
  keyed: boolean
): string {
  const { attributes, open } = objectShape(type, state.schema, seen)
  if (open) {
    return 'unknown'
  }
  if (keyed) {
    const key = attributes.find(([name]) => name === '_key')
    if (key) {
      key[1] = { ...key[1], optional: false }
    } else {
      attributes.unshift(['_key', { type: 'objectAttribute', value: { type: 'string' } }])
    }
  }
  if (attributes.length === 0) {
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
    const key = IDENTIFIER.test(name) ? name : JSON.stringify(name)
    lines.push(`${key}${attribute.optional ? '?' : ''}: ${value};`)
  }
  if (attributes.length > MAX_ATTRIBUTES_PER_OBJECT) {
    state.tooWide = true
    lines.push(`… ${attributes.length - MAX_ATTRIBUTES_PER_OBJECT} more`)
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
