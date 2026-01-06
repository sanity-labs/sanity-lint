/**
 * Sample Next.js component with GROQ queries.
 * Tests that the plugin works in .tsx files with JSX.
 */

import { groq } from 'next-sanity'

// These queries have issues - should show warnings in editor
const QUERIES = {
  // ❌ Join in filter
  badFilter: groq`*[_type == "post" && author->slug.current == $slug]`,

  // ⚠️ Deep pagination
  deepPage: groq`*[_type == "post"][2000...2020]`,

  // ✅ Clean query
  clean: groq`*[_type == "post" && author._ref == $authorId][0...10]`,
}

// Inline query in function - should also be linted
async function getAuthorPosts(authorSlug: string) {
  // ❌ This has a join in filter
  const query = groq`
    *[_type == "post" && author->slug.current == $slug]{
      title,
      slug
    }
  `
  // Would fetch with: sanityClient.fetch(query, { slug: authorSlug })
  return query
}

// Template literal without groq tag - should NOT be linted
const notGroq = `*[_type == "post" && author->name == "test"]`

// React component that uses queries
export function PostList() {
  return (
    <div>
      <h1>Posts</h1>
      {/* Query reference in JSX comment for testing */}
    </div>
  )
}

export { QUERIES, getAuthorPosts }
