import sanityPlugin from 'eslint-plugin-sanity'

export default [
  {
    files: ['**/*.{js,ts,tsx}'],
    plugins: {
      sanity: sanityPlugin,
    },
    rules: {
      // Enable all GROQ lint rules
      // These will light up once the plugin is implemented
      'sanity/groq-no-join-in-filter': 'error',
      'sanity/groq-no-deep-pagination': 'warn',
      'sanity/groq-no-large-pages': 'warn',
      'sanity/groq-no-many-joins': 'warn',
      'sanity/groq-no-join-to-get-id': 'warn',
      'sanity/groq-no-repeated-dereference': 'warn',
      'sanity/groq-no-computed-value-in-filter': 'warn',
      'sanity/groq-no-non-literal-comparison': 'warn',
      'sanity/groq-no-order-on-expr': 'warn',
      'sanity/groq-no-match-on-id': 'warn',
      'sanity/groq-no-count-in-correlated-subquery': 'warn',
    },
  },
]
