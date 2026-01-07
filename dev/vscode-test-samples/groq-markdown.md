# GROQ Syntax Highlighting in Markdown

This file tests GROQ syntax highlighting in markdown fenced code blocks.

## Basic Query

```groq
*[_type == "post"]{
  _id,
  title,
  slug
}
```

## Query with Functions

```groq
*[_type == "post"]{
  title,
  "wordCount": length(string::split(body, " ")),
  "excerpt": pt::text(body)[0...100]
}
```

## Query with Dereference

```groq
*[_type == "post"]{
  title,
  "author": author->{
    name,
    bio
  }
}
```

## Query with Parameters

```groq
*[_type == $type && category == $category] | order(publishedAt desc) [0...10]
```

## System Fields

```groq
*[_type == "post"]{
  _id,
  _type,
  _rev,
  _createdAt,
  _updatedAt
}
```

## Complex Query

```groq
*[_type == "post" && defined(author) && publishedAt < now()] | order(publishedAt desc) {
  _id,
  title,
  slug,
  publishedAt,
  "author": author->{
    _id,
    name,
    "image": image.asset->url
  },
  "categories": categories[]->{
    _id,
    title
  },
  "relatedPosts": *[_type == "post" && category._ref == ^.category._ref && _id != ^._id][0...3]{
    _id,
    title,
    slug
  }
}
```
