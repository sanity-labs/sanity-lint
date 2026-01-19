import type { Rule } from '@sanity-labs/lint-core'
import { computedValueInFilter } from './computed-value-in-filter'
import { countInCorrelatedSubquery } from './count-in-correlated-subquery'
import { deepPagination } from './deep-pagination'
import { deepPaginationParam } from './deep-pagination-param'
import { extremelyLargeQuery } from './extremely-large-query'
import { invalidTypeFilter } from './invalid-type-filter'
import { joinInFilter } from './join-in-filter'
import { joinToGetId } from './join-to-get-id'
import { largePages } from './large-pages'
import { manyJoins } from './many-joins'
import { matchOnId } from './match-on-id'
import { nonLiteralComparison } from './non-literal-comparison'
import { orderOnExpr } from './order-on-expr'
import { repeatedDereference } from './repeated-dereference'
import { unknownField } from './unknown-field'
import { veryLargeQuery } from './very-large-query'

/**
 * All available lint rules
 */
export const rules: Rule[] = [
  // Performance - query size
  veryLargeQuery,
  extremelyLargeQuery,

  // Performance - joins
  joinInFilter,
  joinToGetId,
  manyJoins,
  repeatedDereference,

  // Performance - pagination
  deepPagination,
  deepPaginationParam,
  largePages,

  // Performance - filtering
  computedValueInFilter,
  nonLiteralComparison,

  // Performance - ordering
  orderOnExpr,

  // Performance - aggregation
  countInCorrelatedSubquery,

  // Correctness
  matchOnId,

  // Schema-aware correctness (requires schema to run)
  invalidTypeFilter,
  unknownField,
]

/**
 * Rules indexed by ID for quick lookup
 */
export const rulesById: Record<string, Rule> = Object.fromEntries(
  rules.map((rule) => [rule.id, rule])
)

// Re-export individual rules for direct imports
export {
  computedValueInFilter,
  countInCorrelatedSubquery,
  deepPagination,
  deepPaginationParam,
  extremelyLargeQuery,
  invalidTypeFilter,
  joinInFilter,
  joinToGetId,
  largePages,
  manyJoins,
  matchOnId,
  nonLiteralComparison,
  orderOnExpr,
  repeatedDereference,
  unknownField,
  veryLargeQuery,
}
