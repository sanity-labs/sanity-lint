/**
 * Sample GROQ queries with various lint issues.
 * Open this file in VS Code/Cursor to test editor integration.
 *
 * Once eslint-plugin-sanity is implemented, you should see
 * squiggly lines under the problematic queries.
 */

import { groq } from 'next-sanity' // or wherever groq comes from

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

// ⚠️ WARNING: Repeated dereference - resolve once instead
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
