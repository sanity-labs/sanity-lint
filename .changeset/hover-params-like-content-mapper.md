---
'@sanity-labs/groq-lsp': patch
---

A query parameter now hovers as the type the content mapper generates for it in `QueryParams`. The hover reads the query's syntax tree the way the content mapper does, instead of reading the text around each `$param`. A parameter inside a query whose root is an object, such as `$type` in `{"slugs": *[_type == $type]{…}}{…}.slugs`, now gets its type instead of `unknown`. The bounds of `x in $min..$max`, an arithmetic operand such as `$bump` in `views + $bump > 10`, a parameter compared with a literal (`$flag == true` is a `boolean`), and a parameter compared inside a filter of a function argument are typed as well. A subscript such as `[$i]` hovers as `unknown`, as in the generated types, since it may be an index, an attribute name or a filter.
