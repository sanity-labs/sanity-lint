import { SchemaRuleTester, createSchema } from '../../testing'
import { missingSlugSource } from '../missing-slug-source'

const tester = new SchemaRuleTester()

tester.run('missing-slug-source', missingSlugSource, {
  valid: [
    // Slug with string source option
    createSchema({
      name: 'post',
      type: 'document',
      fields: [
        { name: 'title', type: 'string' },
        { name: 'slug', type: 'slug', options: { source: 'title' } },
      ],
    }),

    // Slug with function source (e.g. nested object fields using parent)
    createSchema({
      name: 'navItem',
      type: 'object',
      fields: [
        { name: 'displayName', type: 'string' },
        {
          name: 'key',
          type: 'slug',
          options: {
            source: (_document, { parent }) => String(parent.displayName ?? ''),
          },
        },
      ],
    }),

    // Non-slug fields
    createSchema({
      name: 'post',
      type: 'document',
      fields: [
        { name: 'title', type: 'string' },
        { name: 'name', type: 'string' },
      ],
    }),

    // No fields
    createSchema({ name: 'post', type: 'document', fields: [] }),
  ],

  invalid: [
    {
      name: 'slug without options',
      schema: createSchema({
        name: 'post',
        type: 'document',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'slug', type: 'slug' },
        ],
      }),
      errors: [{ ruleId: 'missing-slug-source', severity: 'warning' }],
    },
    {
      name: 'slug with empty options',
      schema: createSchema({
        name: 'post',
        type: 'document',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'slug', type: 'slug', options: {} },
        ],
      }),
      errors: [{ ruleId: 'missing-slug-source', severity: 'warning' }],
    },
    {
      name: 'multiple slugs without source',
      schema: createSchema({
        name: 'page',
        type: 'document',
        fields: [
          { name: 'slug', type: 'slug' },
          { name: 'alternateSlug', type: 'slug' },
        ],
      }),
      errors: [{ ruleId: 'missing-slug-source' }, { ruleId: 'missing-slug-source' }],
    },
  ],
})
