import { RuleTester } from '@sanity-labs/lint-core/testing'
import { duplicateProjectionKey } from '../duplicate-projection-key'

const tester = new RuleTester()

tester.run('duplicate-projection-key', duplicateProjectionKey, {
  valid: [
    // Distinct keys
    '*[_type == "post"]{ _id, title, "slug": slug.current }',

    // Different output keys from the same field
    '*[_type == "post"]{ "content": body, body }',

    // One explicit key plus spreads, in either order
    '{ ..., "body": foobar }',
    '{ "body": foobar, ... }',
    '*[_type == "post"]{ ..., body, ...author-> }',

    // Conditional spreads are not explicit keys
    '*[_type == "post"]{ body, _type == "page" => { body } }',

    // Nested objects are checked on their own
    '*[_type == "post"]{ body, "author": { body } }',
    '*[_type == "post"]{ body, author->{ body } }',
    '*[_type == "post"]{ body, "items": items[]{ body } }',

    // select() branches are different objects
    '*[_type == "post"]{ "content": select(defined(body) => { body }, { body }) }',

    // No projection
    '*[_type == "post"]',
  ],

  invalid: [
    {
      name: 'string key and bare attribute write the same key',
      code: `*[_type == "page" && slug.current == $slug][0] {
  _id,
  _type,
  "body": pt::text(body),
  overview,
  title,
  "slug": slug.current,
  body
}`,
      errors: [{ ruleId: 'duplicate-projection-key', severity: 'error' }],
    },
    {
      name: 'custom function result overwritten by bare attribute',
      code: `fn image::richText($blocks) = $blocks[]{...};
*[_type == "page" && slug.current == $slug][0] {
  _id,
  _type,
  "body": image::richText(body),
  overview,
  title,
  "slug": slug.current,
  body
}`,
      errors: [{ ruleId: 'duplicate-projection-key' }],
    },
    {
      name: 'two explicit keys next to a spread',
      code: '{ ..., "body": pt::text(body), body }',
      errors: [{ ruleId: 'duplicate-projection-key' }],
    },
    {
      name: 'same bare attribute twice',
      code: '*[_type == "post"]{ title, title }',
      errors: [{ ruleId: 'duplicate-projection-key' }],
    },
    {
      name: 'dereference projects its attribute name',
      code: '*[_type == "post"]{ author->, "author": author._ref }',
      errors: [{ ruleId: 'duplicate-projection-key' }],
    },
    {
      name: 'three projections of one key, reported once',
      code: '*[_type == "post"]{ "a": x, "a": y, a }',
      errors: [{ ruleId: 'duplicate-projection-key' }],
    },
    {
      name: 'each duplicated key reported',
      code: '*[_type == "post"]{ a, "a": x, b, "b": y }',
      errors: [{ ruleId: 'duplicate-projection-key' }, { ruleId: 'duplicate-projection-key' }],
    },
    {
      name: 'duplicate inside a nested projection',
      code: '*[_type == "post"]{ "author": author->{ name, "name": coalesce(name, "Anonymous") } }',
      errors: [{ ruleId: 'duplicate-projection-key' }],
    },
  ],
})
