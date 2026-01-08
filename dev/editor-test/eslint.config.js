import sanityPlugin from '@sanity/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
  // Use the recommended config
  sanityPlugin.configs.recommended,

  // TypeScript parsing
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
    },
  },
]
