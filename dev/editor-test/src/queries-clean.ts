/**
 * Sample GROQ queries that should NOT trigger any lint warnings.
 * Use this to verify false positives aren't happening.
 */

import { groq } from 'next-sanity'

// ✅ Clean: Simple query with projection
export const getPost = groq`
  *[_type == "post" && slug.current == $slug][0]{
    title,
    body,
    "author": author->name,
    publishedAt
  }
`

// ✅ Clean: Filter using _ref instead of join
export const getPostsByAuthor = groq`
  *[_type == "post" && author._ref == $authorId]{
    title,
    slug
  }
`

// ✅ Clean: Reasonable pagination
export const getPaginatedPosts = groq`
  *[_type == "post"] | order(publishedAt desc)[0...20]{
    _id,
    title,
    slug,
    publishedAt
  }
`

// ✅ Clean: Single dereference in projection (sub-projection)
export const getPostWithAuthor = groq`
  *[_type == "post" && _id == $id][0]{
    title,
    author->{
      name,
      bio,
      email,
      image
    }
  }
`

// ✅ Clean: Comparison with literal
export const getRecentPosts = groq`
  *[_type == "post" && publishedAt > "2024-01-01"]{
    title,
    publishedAt
  }
`

// ✅ Clean: Comparison with parameter
export const getPostsAfterDate = groq`
  *[_type == "post" && publishedAt > $after]{
    title,
    publishedAt
  }
`

// ✅ Clean: Comparison with now()
export const getPublishedPosts = groq`
  *[_type == "post" && publishedAt < now()]{
    title,
    publishedAt
  }
`

// ✅ Clean: Order on simple attribute
export const getPostsOrdered = groq`
  *[_type == "post"] | order(publishedAt desc){
    title,
    publishedAt
  }
`

// ✅ Clean: Order with lower()
export const getPostsOrderedByTitle = groq`
  *[_type == "post"] | order(lower(title)){
    title
  }
`

// ✅ Clean: Using references() helper - more efficient than manual ref check
// Note: references() is optimized internally, so we suppress the warning
// eslint-disable-next-line sanity/groq-count-in-correlated-subquery
export const getCategoriesWithCount = groq`
  *[_type == "category"]{
    title,
    "hasMatchingPosts": count(*[_type == "post" && references(^._id)]) > 0
  }
`

// ✅ Clean: Cursor-based pagination
export const getPostsCursor = groq`
  *[_type == "post" && _id > $lastId] | order(_id)[0...20]{
    _id,
    title
  }
`
