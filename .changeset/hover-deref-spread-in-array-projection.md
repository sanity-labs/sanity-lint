---
'@sanity-labs/groq-lsp': patch
---

Schema-aware hover now resolves fields inside a `...@-> { … }` spread, and any other `->` projection, against the dereferenced document type: in `showcaseProjects[] { _key, ...@-> { _id, _type, title } }`, `_type` hovers as `project` and `title` as the project's `title`, instead of falling back to the type of the whole query. A field followed by a projection, such as `showcaseProjects[] { … }` or `author-> { … }`, hovers as what the projection makes of it (`Array<{ _key: string; _id: string; _type: "project"; … }> | null`), which is what the query returns under that key. Objects whose `rest` is a named type, as `sanity schema extract` writes array items that are references, now show and resolve the attributes of that type (`_ref`, `_type: "reference"`, `_weak?`) instead of only their own.

Thanks to Cody Olsen for reporting the wrong hovers and the query that reproduced them.
