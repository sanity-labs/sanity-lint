import { RuleTester } from '@sanity-labs/lint-core/testing'
import { repeatedDereference } from '../repeated-dereference'

const tester = new RuleTester()

tester.run('repeated-dereference', repeatedDereference, {
  valid: [
    // Single dereference
    '*[_type == "post"]{ author->name }',

    // Different references dereferenced
    '*[_type == "post"]{ "authorName": author->name, "categoryName": category->name }',

    // Sub-projection (efficient)
    '*[_type == "post"]{ author->{ name, bio, email } }',

    // No projection
    '*[_type == "post"].author->name',

    // Each nested projection dereferences its own object's field once
    '*[_type == "page"][0]{ "image": mainImage{ asset->{ url } }, "body": body[]{ asset->{ url } } }',
    '*[_type == "page"]{ "hero": hero{ "url": asset->url }, "logo": logo{ "url": asset->url } }',

    // Once in a filter, once in the projection
    '*[_type == "post"]{ author->name, "related": *[_type == "post" && author->name == "x"] }',

    // Custom functions are inlined into nested projections at each call
    `fn image::asset($asset) = $asset->{url, metadata};
fn image::field($image) = $image{crop, hotspot, "asset": image::asset(asset)};
fn image::richText($blocks) = $blocks[]{..., _type == "image" => image::field(@)};
*[_type == "page"][0]{ title, "image": image::field(mainImage), "body": image::richText(body) }`,
  ],

  invalid: [
    {
      name: 'same reference dereferenced twice',
      code: '*[_type == "post"]{ "authorName": author->name, "authorBio": author->bio }',
      errors: [{ ruleId: 'repeated-dereference', severity: 'info' }],
    },
    {
      name: 'same reference dereferenced three times',
      code: '*[_type == "post"]{ "name": author->name, "bio": author->bio, "email": author->email }',
      errors: [{ ruleId: 'repeated-dereference' }],
    },
    {
      name: 'repeated inside a nested projection, reported once',
      code: '*[_type == "page"]{ "image": mainImage{ "url": asset->url, "lqip": asset->metadata.lqip } }',
      errors: [{ ruleId: 'repeated-dereference' }],
    },
    {
      name: 'nested projections on the same reference count in the outer one',
      code: '*[_type == "post"]{ "a": author->{ name }, "b": author->{ bio } }',
      errors: [{ ruleId: 'repeated-dereference' }],
    },
  ],
})
