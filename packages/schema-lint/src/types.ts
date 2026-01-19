import type { Severity, Category, Finding, SourceSpan } from '@sanity-labs/lint-core'

/**
 * Represents a field in a Sanity schema
 */
export interface SchemaField {
  /** Field name */
  name: string
  /** Field type (string, number, reference, array, etc.) */
  type: string
  /** Human-readable title */
  title?: string
  /** Field description */
  description?: string
  /** Whether the field has validation rules */
  hasValidation?: boolean
  /** Whether the field is deprecated */
  deprecated?: boolean | string
  /** Whether the field is hidden */
  hidden?: boolean
  /** Whether the field is readOnly */
  readOnly?: boolean
  /** Field options (e.g., source for slug, list for string) */
  options?: {
    source?: string
    list?: unknown[]
    hotspot?: boolean
    layout?: string
    [key: string]: unknown
  }
  /** For array fields, the types allowed in the array */
  of?: SchemaField[]
  /** For reference fields, the types that can be referenced */
  to?: { type: string }[]
  /** Location in source for error reporting */
  span?: SourceSpan
}

/**
 * Represents a Sanity schema type definition
 */
export interface SchemaType {
  /** Type name (e.g., 'post', 'author') */
  name: string
  /** Schema type (document, object, array, etc.) */
  type: string
  /** Human-readable title */
  title?: string
  /** Type description */
  description?: string
  /** Whether the type has an icon defined */
  hasIcon?: boolean
  /** Whether the type has a preview configuration */
  hasPreview?: boolean
  /** Fields defined on this type */
  fields?: SchemaField[]
  /** Groups for organizing fields in the Studio */
  groups?: { name: string; title?: string }[]
  /** Location in source for error reporting */
  span?: SourceSpan
  /** Whether defineType() was used */
  usesDefineType?: boolean
  /** Whether defineField() was used for all fields */
  usesDefineField?: boolean
}

/**
 * Context provided to schema rules during checking
 */
export interface SchemaRuleContext {
  /** The file path being linted */
  filePath: string
  /** Report a finding */
  report: (finding: Omit<Finding, 'ruleId'>) => void
}

/**
 * A schema lint rule definition
 */
export interface SchemaRule {
  /** Unique identifier (kebab-case) */
  id: string
  /** Human-readable name */
  name: string
  /** Description of what the rule checks */
  description: string
  /** Default severity */
  severity: Severity
  /** Rule category */
  category: Category
  /** Rule IDs that this rule supersedes */
  supersedes?: string[]

  /**
   * Check the schema for violations
   * @param schema - The parsed schema type
   * @param context - Context with file info and report function
   */
  check: (schema: SchemaType, context: SchemaRuleContext) => void
}

/**
 * Configuration for a schema rule
 */
export interface SchemaRuleConfig {
  /** Whether the rule is enabled */
  enabled?: boolean
  /** Override severity */
  severity?: Severity
  /** Rule-specific options */
  options?: Record<string, unknown>
}

/**
 * Schema linter configuration
 */
export interface SchemaLinterConfig {
  /** Rule configurations keyed by rule ID */
  rules?: Record<string, SchemaRuleConfig | boolean>
}
