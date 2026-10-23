/**
 * Minimal, conservative type resolution of GROQ expressions against an
 * extracted Sanity schema (`sanity schema extract`).
 *
 * Every function returns `undefined` when a type cannot be determined with
 * certainty, so callers can skip checks instead of reporting false positives.
 */

import type { ExprNode, SchemaType, TypeNode } from 'groq-js'

/**
 * Scope in which an expression is evaluated, mirroring groq-js scoping:
 * filters and projections create nested scopes (reachable through `^`),
 * while map/flat-map create hidden ones.
 */
export interface TypeScope {
  /** Type of `@` in this scope, or undefined when unknown */
  type: TypeNode | undefined
  parent: TypeScope | undefined
  hidden: boolean
}

export const ROOT_SCOPE: TypeScope = { type: undefined, parent: undefined, hidden: false }

const NULL_TYPE: TypeNode = { type: 'null' }

export function nestedScope(scope: TypeScope, type: TypeNode | undefined): TypeScope {
  return { type, parent: scope.hidden ? scope.parent : scope, hidden: false }
}

export function hiddenScope(scope: TypeScope, type: TypeNode | undefined): TypeScope {
  return { ...nestedScope(scope, type), hidden: true }
}

export type ScopedVisitor = (node: ExprNode, scope: TypeScope) => void

/**
 * Walk the AST, tracking the type of `@` for every node.
 */
export function walkScoped(
  node: ExprNode,
  resolver: SchemaTypeResolver,
  visitor: ScopedVisitor,
  scope: TypeScope = ROOT_SCOPE
): void {
  visitor(node, scope)
  const visit = (child: ExprNode, childScope: TypeScope = scope) =>
    walkScoped(child, resolver, visitor, childScope)
  const elementOf = (base: ExprNode) => {
    const type = resolver.resolve(base, scope)
    return type && resolver.elementType(type)
  }

  switch (node.type) {
    case 'Filter':
      visit(node.base)
      visit(node.expr, nestedScope(scope, elementOf(node.base)))
      break
    case 'Projection':
      visit(node.base)
      visit(node.expr, nestedScope(scope, resolver.resolve(node.base, scope)))
      break
    case 'Map':
    case 'FlatMap':
      visit(node.base)
      visit(node.expr, hiddenScope(scope, elementOf(node.base)))
      break
    case 'PipeFuncCall': {
      visit(node.base)
      const argScope = nestedScope(scope, elementOf(node.base))
      for (const arg of node.args) visit(arg, argScope)
      break
    }
    case 'And':
    case 'Or':
    case 'OpCall':
      visit(node.left)
      visit(node.right)
      break
    case 'Not':
    case 'Neg':
    case 'Pos':
    case 'Asc':
    case 'Desc':
    case 'Group':
    case 'Deref':
    case 'AccessElement':
    case 'Slice':
    case 'ArrayCoerce':
      visit(node.base)
      break
    case 'AccessAttribute':
      if (node.base) visit(node.base)
      break
    case 'Array':
      for (const element of node.elements) visit(element.value)
      break
    case 'Object':
      for (const attr of node.attributes) {
        if (attr.type === 'ObjectConditionalSplat') visit(attr.condition)
        visit(attr.value)
      }
      break
    case 'FuncCall':
      for (const arg of node.args) visit(arg)
      break
    case 'Select':
      for (const alt of node.alternatives) {
        visit(alt.condition)
        visit(alt.value)
      }
      if (node.fallback) visit(node.fallback)
      break
    case 'InRange':
      visit(node.base)
      visit(node.left)
      visit(node.right)
      break
    case 'Tuple':
      for (const member of node.members) visit(member)
      break
    default:
      // Leaf nodes and node types without type-relevant children
      break
  }
}

export class SchemaTypeResolver {
  private readonly declarations: Map<string, SchemaType[number]>
  readonly documentTypes: string[]

  constructor(schema: SchemaType) {
    this.declarations = new Map(schema.map((item) => [item.name, item]))
    this.documentTypes = schema.filter((item) => item.type === 'document').map((item) => item.name)
  }

  /** Type of the elements of `*` */
  everythingElement(): TypeNode {
    return {
      type: 'union',
      of: this.documentTypes.map((name) => ({ type: 'inline', name })),
    }
  }

  /** Resolve the type of an expression evaluated in `scope` */
  resolve(node: ExprNode, scope: TypeScope): TypeNode | undefined {
    switch (node.type) {
      case 'Everything':
        return { type: 'array', of: this.everythingElement() }
      case 'This':
        return scope.type
      case 'Parent':
        return this.parentScope(scope, node.n)?.type
      case 'Group':
        return this.resolve(node.base, scope)
      case 'ArrayCoerce':
      case 'Slice':
      case 'Filter': {
        const base = this.resolve(node.base, scope)
        return base && this.elementType(base) ? base : undefined
      }
      case 'AccessElement': {
        const base = this.resolve(node.base, scope)
        return base && this.elementType(base)
      }
      case 'AccessAttribute': {
        const base = node.base ? this.resolve(node.base, scope) : scope.type
        return base && this.attributeType(base, node.name)
      }
      case 'Deref': {
        const base = this.resolve(node.base, scope)
        return base && this.dereferencedType(base)
      }
      case 'Map':
      case 'FlatMap': {
        const base = this.resolve(node.base, scope)
        const element = base && this.elementType(base)
        if (!element) return undefined
        const inner = this.resolve(node.expr, hiddenScope(scope, element))
        if (!inner) return undefined
        if (node.type === 'Map') return { type: 'array', of: inner }
        const flattened = this.elementType(inner)
        return flattened && { type: 'array', of: flattened }
      }
      default:
        return undefined
    }
  }

  /** Walk up `n` levels of `^` */
  parentScope(scope: TypeScope, n: number): TypeScope | undefined {
    let current: TypeScope | undefined = scope
    for (let i = 0; i < n && current; i++) {
      current = current.parent
    }
    return current
  }

  /** Type of the elements of an array type */
  elementType(type: TypeNode): TypeNode | undefined {
    const resolved = this.deref(type)
    if (!resolved) return undefined
    if (resolved.type === 'array') return resolved.of
    if (resolved.type === 'union') {
      const members = resolved.of.filter((member) => member.type !== 'null')
      const elements = members.map((member) => this.elementType(member))
      if (elements.length === 0 || elements.some((element) => !element)) return undefined
      return { type: 'union', of: elements as TypeNode[] }
    }
    return undefined
  }

  /**
   * Possible `_type` values of a value of the given type.
   * Returns undefined when they cannot be fully determined.
   */
  possibleTypeNames(type: TypeNode, seen = new Set<string>()): string[] | undefined {
    switch (type.type) {
      case 'inline': {
        if (seen.has(type.name)) return undefined
        const declaration = this.declarations.get(type.name)
        if (!declaration) return undefined
        if (declaration.type === 'document') return [declaration.name]
        return this.possibleTypeNames(declaration.value, new Set([...seen, type.name]))
      }
      case 'object': {
        const typeAttribute = type.attributes['_type']?.value
        if (typeAttribute?.type === 'string' && typeAttribute.value !== undefined) {
          return [typeAttribute.value]
        }
        return type.rest ? this.possibleTypeNames(type.rest, seen) : undefined
      }
      case 'union': {
        const names = new Set<string>()
        for (const member of type.of) {
          if (member.type === 'null') continue
          const memberNames = this.possibleTypeNames(member, seen)
          if (!memberNames) return undefined
          memberNames.forEach((name) => names.add(name))
        }
        return names.size > 0 ? [...names] : undefined
      }
      default:
        return undefined
    }
  }

  private attributeType(type: TypeNode, name: string): TypeNode | undefined {
    const resolved = this.deref(type)
    if (!resolved) return undefined
    switch (resolved.type) {
      case 'object': {
        const attribute = resolved.attributes[name]
        if (attribute) return attribute.value
        if (resolved.rest) return this.attributeType(resolved.rest, name)
        return NULL_TYPE
      }
      case 'union': {
        const members: TypeNode[] = []
        for (const member of resolved.of) {
          if (member.type === 'null') continue
          const memberType = this.attributeType(member, name)
          if (!memberType) return undefined
          members.push(memberType)
        }
        return members.length > 0 ? { type: 'union', of: members } : undefined
      }
      default:
        return undefined
    }
  }

  private dereferencedType(type: TypeNode): TypeNode | undefined {
    const resolved = this.deref(type)
    if (!resolved) return undefined
    if (resolved.type === 'object') {
      if (resolved.dereferencesTo) return { type: 'inline', name: resolved.dereferencesTo }
      return resolved.rest ? this.dereferencedType(resolved.rest) : undefined
    }
    if (resolved.type === 'union') {
      const members: TypeNode[] = []
      for (const member of resolved.of) {
        if (member.type === 'null') continue
        const memberType = this.dereferencedType(member)
        if (!memberType) return undefined
        members.push(memberType)
      }
      return members.length > 0 ? { type: 'union', of: members } : undefined
    }
    return undefined
  }

  /** Follow inline type references to a concrete type node */
  private deref(type: TypeNode, seen = new Set<string>()): TypeNode | undefined {
    if (type.type !== 'inline') return type
    if (seen.has(type.name)) return undefined
    const declaration = this.declarations.get(type.name)
    if (!declaration) return undefined
    if (declaration.type === 'document') {
      return { type: 'object', attributes: declaration.attributes }
    }
    return this.deref(declaration.value, new Set([...seen, type.name]))
  }
}
