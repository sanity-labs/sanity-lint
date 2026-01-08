/**
 * Sample GROQ queries with various lint issues.
 * Open this file in VS Code/Cursor to test editor integration.
 *
 * Once @sanity/eslint-plugin is implemented, you should see
 * squiggly lines under the problematic queries.
 */

import { groq } from 'next-sanity' // or wherever groq comes from

// =============================================================================
// SCHEMA-AWARE RULES (require schema to be loaded)
// These rules catch typos and invalid field/type references
// =============================================================================

// ❌ ERROR: Invalid type filter - "psot" doesn't exist, did you mean "post"?
export const invalidTypeFilter = groq`
  *[_type == "psot"]
`

// ⚠️ WARNING: Unknown field - "titel" doesn't exist on "post", did you mean "title"?
export const unknownFieldTypo = groq`
  *[_type == "post"]{ titel, body }
`

// ⚠️ WARNING: Unknown field - "bio" doesn't exist on "post" (but exists on "author")
export const wrongTypeField = groq`
  *[_type == "post"]{ title, bio }
`

// ✅ Valid: All fields exist in schema
export const validSchemaQuery = groq`
  *[_type == "post"]{ title, body, slug }
`

// =============================================================================
// PERFORMANCE RULES (no schema required)
// =============================================================================

// ❌ ERROR: Join in filter - prevents optimization
export const postsWithJoinInFilter = groq`
  *[_type == "post" && author->name == "John"]
`

// ⚠️ WARNING: Deep pagination - offset >= 1000
export const deepPaginatedPosts = groq`
  *[_type == "post"][5000...5100]
`

// ⚠️ WARNING: Large page - fetching > 100 at once
export const tooManyPosts = groq`
  *[_type == "post"][0...500]
`

// ⚠️ WARNING: Many joins - > 10 dereferences
export const queryWithManyJoins = groq`
  *[_type == "post"]{
    title,
    author->name,
    category->title,
    tags[]->name,
    related[]->title,
    comments[]->{
      author->name,
      replies[]->{
        author->name,
        parent->title,
        category->name
      }
    }
  }
`

// ⚠️ WARNING: Repeated dereference - same reference dereferenced multiple times
export const repeatedDeref = groq`
  *[_type == "post"]{
    "authorName": author->name,
    "authorBio": author->bio,
    "authorEmail": author->email
  }
`

// ⚠️ WARNING: Non-literal comparison
export const nonLiteralCompare = groq`
  *[_type == "event" && startDate > endDate]
`

// ⚠️ WARNING: Computed value in filter
export const computedFilter = groq`
  *[_type == "product" && price + tax > 100]
`

// ⚠️ WARNING: Order on expression
export const orderOnExpr = groq`
  *[_type == "person"] | order(firstName + " " + lastName)
`

// ℹ️ INFO: Match on _id
export const matchOnId = groq`
  *[_id match "drafts.*"]
`

// ℹ️ INFO: Join to get _id (use ._ref instead)
export const joinToGetId = groq`
  *[_type == "post"]{ "authorId": author->_id }
`

// ℹ️ INFO: Count in correlated subquery
export const countCorrelated = groq`
  *[_type == "category"]{
    title,
    "postCount": count(*[_type == "post" && category._ref == ^._id])
  }
`

// ⚠️ WARNING: Very large query (> 50KB)
// Note: This is a placeholder - actual 50KB+ query would be impractical in source
// The rule triggers at 50KB, which would be ~50,000 characters
export const veryLargeQueryPlaceholder = groq`
  *[_type == "post"]{
    // In practice, a query this large would have many fields and projections
    // This is just to document the rule exists
    title
  }
`

// Note: extremely-large-query (100KB+) and deep-pagination-param (parameter-based offset)
// are not practical to demonstrate in editor test files:
// - extremely-large-query: Would require 100KB of text in a template literal
// - deep-pagination-param: groq-js doesn't support parameters in slice expressions yet
