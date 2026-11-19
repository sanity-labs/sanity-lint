---
'@sanity-labs/groq-lsp': patch
---

String and number literals now hover as the generated types print them. A single-quoted string hovers double-quoted with its escapes read, so `'It\'s'` shows `"It's"`, and a single-quoted key is named the same way. A number hovers as its value, so `10` shows `10` and `2.50` shows `2.5`, where it used to show as a field named after its first digits.
