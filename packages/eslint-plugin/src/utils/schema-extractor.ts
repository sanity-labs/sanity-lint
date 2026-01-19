import type { TSESTree } from '@typescript-eslint/types'
import type { SchemaType, SchemaField } from '@sanity-labs/schema-lint'
import type { SourceSpan } from '@sanity-labs/lint-core'

/**
 * Check if a node is a defineType() call
 */
export function isDefineTypeCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee

  // defineType({ ... })
  if (callee.type === 'Identifier' && callee.name === 'defineType') {
    return true
  }

  return false
}

/**
 * Check if a node is a defineField() call
 */
export function isDefineFieldCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee

  // defineField({ ... })
  if (callee.type === 'Identifier' && callee.name === 'defineField') {
    return true
  }

  return false
}

/**
 * Convert ESLint location to our SourceSpan format
 */
function toSourceSpan(loc: TSESTree.SourceLocation): SourceSpan {
  return {
    start: {
      line: loc.start.line,
      column: loc.start.column + 1, // 1-based
      offset: 0, // We don't have offset info easily
    },
    end: {
      line: loc.end.line,
      column: loc.end.column + 1, // 1-based
      offset: 0,
    },
  }
}

/**
 * Extract a string value from an AST node
 */
function extractStringValue(node: TSESTree.Node | undefined): string | undefined {
  if (!node) return undefined

  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }

  // Handle template literals without expressions
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? node.quasis[0]?.value.raw
  }

  return undefined
}

/**
 * Extract a boolean value from an AST node
 */
function extractBooleanValue(node: TSESTree.Node | undefined): boolean | undefined {
  if (!node) return undefined

  if (node.type === 'Literal' && typeof node.value === 'boolean') {
    return node.value
  }

  return undefined
}

/**
 * Check if a property exists in an object expression
 */
function hasProperty(node: TSESTree.ObjectExpression, name: string): boolean {
  return node.properties.some((prop) => {
    if (prop.type === 'Property' && prop.key.type === 'Identifier') {
      return prop.key.name === name
    }
    return false
  })
}

/**
 * Get a property value from an object expression
 */
function getProperty(node: TSESTree.ObjectExpression, name: string): TSESTree.Node | undefined {
  for (const prop of node.properties) {
    if (prop.type === 'Property' && prop.key.type === 'Identifier' && prop.key.name === name) {
      return prop.value
    }
  }
  return undefined
}

/**
 * Extract field options from an object expression
 */
function extractFieldOptions(
  optionsNode: TSESTree.Node | undefined
): SchemaField['options'] | undefined {
  if (!optionsNode || optionsNode.type !== 'ObjectExpression') {
    return undefined
  }

  const options: NonNullable<SchemaField['options']> = {}

  for (const prop of optionsNode.properties) {
    if (prop.type === 'Property' && prop.key.type === 'Identifier') {
      const name = prop.key.name

      if (name === 'source') {
        const source = extractStringValue(prop.value)
        if (source !== undefined) options.source = source
      } else if (name === 'hotspot') {
        const hotspot = extractBooleanValue(prop.value)
        if (hotspot !== undefined) options.hotspot = hotspot
      } else if (name === 'layout') {
        const layout = extractStringValue(prop.value)
        if (layout !== undefined) options.layout = layout
      } else if (name === 'list' && prop.value.type === 'ArrayExpression') {
        options.list = prop.value.elements.map((el) => {
          if (!el) return null
          if (el.type === 'Literal') return el.value
          if (el.type === 'ObjectExpression') {
            const value = extractStringValue(getProperty(el, 'value'))
            return { value }
          }
          return null
        })
      }
    }
  }

  return Object.keys(options).length > 0 ? options : undefined
}

/**
 * Extract a field from an object expression (either raw or wrapped in defineField)
 */
function extractField(
  node: TSESTree.Node,
  usesDefineField: { value: boolean }
): SchemaField | undefined {
  let fieldObj: TSESTree.ObjectExpression | undefined

  // Check if it's wrapped in defineField()
  if (node.type === 'CallExpression' && isDefineFieldCall(node)) {
    const arg = node.arguments[0]
    if (arg?.type === 'ObjectExpression') {
      fieldObj = arg
    }
  } else if (node.type === 'ObjectExpression') {
    fieldObj = node
    usesDefineField.value = false // At least one field doesn't use defineField
  }

  if (!fieldObj) return undefined

  const name = extractStringValue(getProperty(fieldObj, 'name'))
  const type = extractStringValue(getProperty(fieldObj, 'type'))

  if (!name || !type) return undefined

  const title = extractStringValue(getProperty(fieldObj, 'title'))
  const description = extractStringValue(getProperty(fieldObj, 'description'))
  const options = extractFieldOptions(getProperty(fieldObj, 'options'))

  const field: SchemaField = {
    name,
    type,
    hasValidation: hasProperty(fieldObj, 'validation'),
    hidden: hasProperty(fieldObj, 'hidden'),
    readOnly: hasProperty(fieldObj, 'readOnly'),
    span: toSourceSpan(fieldObj.loc),
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(options !== undefined && { options }),
  }

  // Check for deprecated
  if (hasProperty(fieldObj, 'deprecated')) {
    const deprecatedNode = getProperty(fieldObj, 'deprecated')
    const deprecatedValue = extractStringValue(deprecatedNode)
    field.deprecated = deprecatedValue ?? true
  }

  return field
}

/**
 * Extract fields from an array expression
 */
function extractFields(node: TSESTree.Node | undefined): {
  fields: SchemaField[]
  usesDefineField: boolean
} {
  const result = { fields: [] as SchemaField[], usesDefineField: true }

  if (!node || node.type !== 'ArrayExpression') {
    return result
  }

  const usesDefineFieldTracker = { value: true }

  for (const element of node.elements) {
    if (element) {
      const field = extractField(element, usesDefineFieldTracker)
      if (field) {
        result.fields.push(field)
      }
    }
  }

  result.usesDefineField = usesDefineFieldTracker.value

  return result
}

/**
 * Extract schema type from a defineType() call
 */
export function extractSchemaFromDefineType(node: TSESTree.CallExpression): SchemaType | undefined {
  const arg = node.arguments[0]

  if (!arg || arg.type !== 'ObjectExpression') {
    return undefined
  }

  const name = extractStringValue(getProperty(arg, 'name'))
  const type = extractStringValue(getProperty(arg, 'type'))

  if (!name || !type) {
    return undefined
  }

  const title = extractStringValue(getProperty(arg, 'title'))
  const description = extractStringValue(getProperty(arg, 'description'))
  const fieldsResult = extractFields(getProperty(arg, 'fields'))
  const hasFields = fieldsResult.fields.length > 0

  const schema: SchemaType = {
    name,
    type,
    hasIcon: hasProperty(arg, 'icon'),
    hasPreview: hasProperty(arg, 'preview'),
    usesDefineType: true,
    span: toSourceSpan(arg.loc),
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(hasFields && { fields: fieldsResult.fields }),
    ...(hasFields && { usesDefineField: fieldsResult.usesDefineField }),
  }

  return schema
}

/**
 * Extract schema type from a plain object literal (not wrapped in defineType)
 */
export function extractSchemaFromObject(node: TSESTree.ObjectExpression): SchemaType | undefined {
  const name = extractStringValue(getProperty(node, 'name'))
  const type = extractStringValue(getProperty(node, 'type'))

  if (!name || !type) {
    return undefined
  }

  // Only process if it looks like a Sanity schema (has name and type)
  const title = extractStringValue(getProperty(node, 'title'))
  const description = extractStringValue(getProperty(node, 'description'))
  const fieldsResult = extractFields(getProperty(node, 'fields'))
  const hasFields = fieldsResult.fields.length > 0

  const schema: SchemaType = {
    name,
    type,
    hasIcon: hasProperty(node, 'icon'),
    hasPreview: hasProperty(node, 'preview'),
    usesDefineType: false,
    span: toSourceSpan(node.loc),
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(hasFields && { fields: fieldsResult.fields }),
    ...(hasFields && { usesDefineField: fieldsResult.usesDefineField }),
  }

  return schema
}
