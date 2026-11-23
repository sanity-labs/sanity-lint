import { RuleTester } from '@sanity-labs/lint-core/testing'
import { computedValueInFilter } from '../computed-value-in-filter'

const tester = new RuleTester()

tester.run('computed-value-in-filter', computedValueInFilter, {
  valid: [
    // Simple comparisons
    '*[price > 100]',
    '*[_type == "product"]',

    // Parent reference exemption
    '*[total == ^.amount]',
    '*[price == ^.budget - 10]',

    // Arithmetic outside filter
    '*[_type == "product"]{ "total": price + tax }',

    // Literals only
    '*[value == 2 + 1]',

    // Functions the index evaluates itself
    '*[_type == "book" && lower(title) == "foo"]',
    '*[_type == "book" && string::startsWith(title, "The")]',
    '*[_type == "book" && pt::text(body) match "foo"]',
    '*[_type == "book" && count(tags) > 1]',
    '*[_type == "book" && title in ["a", "b"]]',
    '*[_type == "book" && _id in path("books.**")]',
    '*[_type == "book" && references("author-1")]',
    '*[_type == "book" && "x" in tags]',
    '*[_type == "book" && defined(subtitle)]',

    // In-memory functions outside a dataset filter
    '*[_type == "book"]{ "t": upper(title) }',
    '*[_type == "book"]{ "r": reviews[length(text) > 10] }',
  ],

  invalid: [
    ...[
      '*[_type == "book" && upper(title) == "X"]',
      '*[_type == "book" && length(title) > 10]',
      '*[_type == "book" && round(rating) == 4]',
      '*[_type == "book" && coalesce(subtitle, title) == "X"]',
      '*[_type == "book" && select(rating > 3 => "good", "bad") == "good"]',
      '*[_type == "book" && string::split(title, " ")[0] == "The"]',
      '*[_type == "book" && defined(reviews[0])]',
      '*[_type == "book"][upper(title) == "X"]',
      '*[_type == "book"][][length(title) > 10]',
    ].map((code) => ({
      name: `in-memory function: ${code}`,
      code,
      errors: [{ ruleId: 'computed-value-in-filter', severity: 'warning' as const }],
    })),
    {
      name: 'addition in filter',
      code: '*[price + tax > 100]',
      errors: [{ ruleId: 'computed-value-in-filter', severity: 'warning' }],
    },
    {
      name: 'subtraction in filter',
      code: '*[total - discount < 50]',
      errors: [{ ruleId: 'computed-value-in-filter' }],
    },
    {
      name: 'multiplication in filter',
      code: '*[quantity * price > 1000]',
      errors: [{ ruleId: 'computed-value-in-filter' }],
    },
    {
      name: 'division in filter',
      code: '*[total / count < 10]',
      errors: [{ ruleId: 'computed-value-in-filter' }],
    },
  ],
})
