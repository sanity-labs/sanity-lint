<template>
  <div>
    <h1>{{ post?.title }}</h1>
    <p>{{ post?.excerpt }}</p>
  </div>
</template>

<script setup lang="ts">
import { groq } from 'next-sanity'

// Test: groq tagged template in Vue SFC
const postQuery = groq`
  *[_type == "post" && slug.current == $slug][0]{
    _id,
    title,
    "excerpt": pt::text(body)[0...200],
    "author": author->{
      name,
      image
    }
  }
`

// Test: /* groq */ comment prefix in Vue
const categoriesQuery = /* groq */ `
  *[_type == "category"] | order(title asc) {
    _id,
    title
  }
`

const props = defineProps<{
  slug: string
}>()

// Usage example
const { data: post } = await useSanityQuery(postQuery, { slug: props.slug })
</script>
