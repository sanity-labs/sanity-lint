import { useState, useMemo, useCallback } from 'react'
import { lint } from '@sanity-labs/groq-lint'
import type { Finding } from '@sanity-labs/lint-core'
import type { SchemaType } from 'groq-js'
import * as prettier from 'prettier/standalone'
import * as groqPlugin from '@sanity-labs/prettier-plugin-groq'

/**
 * Sample schema for testing schema-aware rules
 */
const SAMPLE_SCHEMA: SchemaType = [
  {
    type: 'document',
    name: 'post',
    attributes: {
      _id: { type: 'objectAttribute', value: { type: 'string' } },
      _type: { type: 'objectAttribute', value: { type: 'string', value: 'post' } },
      title: { type: 'objectAttribute', value: { type: 'string' } },
      slug: { type: 'objectAttribute', value: { type: 'string' } },
      body: { type: 'objectAttribute', value: { type: 'string' } },
      publishedAt: { type: 'objectAttribute', value: { type: 'string' } },
      author: { type: 'objectAttribute', value: { type: 'string' } },
    },
  },
  {
    type: 'document',
    name: 'author',
    attributes: {
      _id: { type: 'objectAttribute', value: { type: 'string' } },
      _type: { type: 'objectAttribute', value: { type: 'string', value: 'author' } },
      name: { type: 'objectAttribute', value: { type: 'string' } },
      bio: { type: 'objectAttribute', value: { type: 'string' } },
      email: { type: 'objectAttribute', value: { type: 'string' } },
    },
  },
  {
    type: 'document',
    name: 'category',
    attributes: {
      _id: { type: 'objectAttribute', value: { type: 'string' } },
      _type: { type: 'objectAttribute', value: { type: 'string', value: 'category' } },
      title: { type: 'objectAttribute', value: { type: 'string' } },
      description: { type: 'objectAttribute', value: { type: 'string' } },
    },
  },
]

const EXAMPLES: Record<string, string> = {
  // Formatting example
  'Needs formatting': `*[_type=="post"&&published==true]{title,body,"author":author->{name,bio},categories[]->{title,slug},_createdAt,_updatedAt}|order(_createdAt desc)[0...10]`,
  // Schema-aware rules
  'Invalid type (typo)': `*[_type == "psot"]{ title }`,
  'Unknown field (typo)': `*[_type == "post"]{ titel, body }`,
  'Wrong type field': `*[_type == "post"]{ bio }`,
  // Performance rules
  'Join in filter': `*[_type == "post" && author->name == "John"]`,
  'Deep pagination': `*[_type == "post"][5000...5100]`,
  'Large page': `*[_type == "post"][0...500]`,
  'Many joins': `*[_type == "post"]{
  title,
  author->name,
  category->title,
  tags[]->name,
  related[]->title,
  comments[]->{
    author->name,
    replies[]->{
      author->name,
      parent->title
    }
  }
}`,
  'Repeated deref': `*[_type == "post"]{
  "authorName": author->name,
  "authorBio": author->bio,
  "authorEmail": author->email
}`,
  'Non-literal compare': `*[_type == "post" && startDate > endDate]`,
  'Computed filter': `*[_type == "product" && price + tax > 100]`,
  'Order on expr': `*[_type == "post"] | order(firstName + lastName)`,
  'Match on _id': `*[_id match "drafts.*"]`,
  'Ref to _id': `*[_type == "post"]{ "authorId": author->_id }`,
  'Count subquery': `*[_type == "category"]{
  title,
  "posts": count(*[_type == "post" && category._ref == ^._id])
}`,
  'Clean query': `*[_type == "post" && _id == $id][0]{
  title,
  "author": author->name,
  body
}`,
}

export function App() {
  const [query, setQuery] = useState(EXAMPLES['Needs formatting'])
  const [useSchema, setUseSchema] = useState(true)
  const [isFormatting, setIsFormatting] = useState(false)

  const results = useMemo(() => {
    try {
      return lint(query, useSchema ? { schema: SAMPLE_SCHEMA } : undefined)
    } catch (e) {
      return {
        findings: [
          {
            ruleId: 'parse-error',
            message: e instanceof Error ? e.message : 'Failed to parse query',
            severity: 'error' as const,
          },
        ],
        errors: 1,
        warnings: 0,
        info: 0,
      }
    }
  }, [query, useSchema])

  const handleFormat = useCallback(async () => {
    setIsFormatting(true)
    try {
      const formatted = await prettier.format(query, {
        parser: 'groq',
        plugins: [groqPlugin],
        printWidth: 80,
      })
      setQuery(formatted.trim())
    } catch (e) {
      console.error('Format error:', e)
    } finally {
      setIsFormatting(false)
    }
  }, [query])

  const errorCount = results.findings.filter((f) => f.severity === 'error').length
  const warningCount = results.findings.filter((f) => f.severity === 'warning').length
  const infoCount = results.findings.filter((f) => f.severity === 'info').length

  return (
    <div className="app">
      <header>
        <h1>GROQ Lint Playground</h1>
        <p>Test GROQ queries against lint rules in real-time</p>
        <label className="schema-toggle">
          <input
            type="checkbox"
            checked={useSchema}
            onChange={(e) => setUseSchema(e.target.checked)}
          />
          <span>Enable schema-aware rules</span>
          {useSchema && <span className="schema-badge">Schema loaded</span>}
        </label>
      </header>

      <div className="main">
        <div className="editor-panel">
          <div className="panel-header">
            <span>Query</span>
            <button
              className="format-btn"
              onClick={handleFormat}
              disabled={isFormatting}
              title="Format query (Prettier)"
            >
              {isFormatting ? 'Formatting...' : 'Format'}
            </button>
          </div>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a GROQ query..."
            spellCheck={false}
          />
          <div className="examples">
            <h3>Try an example</h3>
            <div className="example-buttons">
              {Object.keys(EXAMPLES).map((name) => (
                <button key={name} className="example-btn" onClick={() => setQuery(EXAMPLES[name])}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="results-panel">
          <div className="panel-header">Results</div>
          <div className="results">
            {results.findings.length === 0 ? (
              <div className="no-issues">No issues found</div>
            ) : (
              results.findings.map((finding, i) => <ResultItem key={i} finding={finding} />)
            )}
          </div>
          <div className="stats">
            <span className="error-count">
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
            <span className="warning-count">
              {warningCount} warning{warningCount !== 1 ? 's' : ''}
            </span>
            <span className="info-count">{infoCount} info</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ResultItem({ finding }: { finding: Finding }) {
  return (
    <div className={`result-item ${finding.severity}`}>
      <div className="result-rule">{finding.ruleId}</div>
      <div className="result-message">{finding.message}</div>
      {finding.help && <div className="result-help">{finding.help}</div>}
    </div>
  )
}
