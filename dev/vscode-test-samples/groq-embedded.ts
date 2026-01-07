// Test file for embedded GROQ in TypeScript
// Tests: groq`...` tagged templates, defineQuery(), /* groq */ comments

import { groq } from 'next-sanity'
import { defineQuery } from 'groq'

// Test 1: groq tagged template literal
const postsQuery = groq`
  *[_type == "post"]{
    _id,
    _type,
    title,
    slug,
    "author": author->name
  }
`

// Test 2: defineQuery() function
const authorQuery = defineQuery(`
  *[_type == "author" && name == $name][0]{
    _id,
    name,
    bio,
    "postCount": count(*[_type == "post" && references(^._id)])
  }
`)

// Test 3: /* groq */ comment prefix
const categoryQuery = /* groq */ `
  *[_type == "category"] | order(title asc) {
    _id,
    title,
    description
  }
`

// Test 4: // groq line comment prefix
// groq
const simpleQuery = `*[_type == "post"][0...10]`

// Test 5: Query with lint issues (should show diagnostics)
const problematicQuery = groq`
  *[author->name == "Bob"]{
    title,
    body
  }
`

// Test 6: Query with template substitution
const type = 'post'
const dynamicQuery = groq`
  *[_type == "${type}"]{
    _id,
    title
  }
`

// Test 7: Query with parameters
const paramQuery = groq`
  *[_type == $type && slug.current == $slug][0]{
    _id,
    title,
    body,
    "related": *[_type == "post" && category._ref == ^.category._ref][0...3]{
      _id,
      title
    }
  }
`

// Test 8: Function namespaces
const functionsQuery = groq`
  *[_type == "post"]{
    "text": pt::text(body),
    "words": string::split(title, " "),
    "sum": math::sum(scores),
    "unique": array::unique(tags),
    "now": dateTime::now()
  }
`

// Test 9: Deep pagination (should warn)
const paginatedQuery = groq`
  *[_type == "post"][100...110]
`

// Test 10: System fields highlighting
const systemFieldsQuery = groq`
  *[_type == "post"]{
    _id,
    _type,
    _rev,
    _createdAt,
    _updatedAt,
    _key,
    "ref": author._ref,
    "weak": author._weak
  }
`

export {
  postsQuery,
  authorQuery,
  categoryQuery,
  simpleQuery,
  problematicQuery,
  dynamicQuery,
  paramQuery,
  functionsQuery,
  paginatedQuery,
  systemFieldsQuery,
}
