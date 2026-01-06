import { useState, useMemo } from 'react'
import { lint } from '@sanity/groq-lint'
import type { Finding } from '@sanity/lint-core'

const EXAMPLES: Record<string, string> = {
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
  const [query, setQuery] = useState(EXAMPLES['Join in filter'])

  const results = useMemo(() => {
    try {
      return lint(query)
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
  }, [query])

  const errorCount = results.findings.filter((f) => f.severity === 'error').length
  const warningCount = results.findings.filter((f) => f.severity === 'warning').length
  const infoCount = results.findings.filter((f) => f.severity === 'info').length

  return (
    <div className="app">
      <header>
        <h1>GROQ Lint Playground</h1>
        <p>Test GROQ queries against lint rules in real-time</p>
      </header>

      <div className="main">
        <div className="editor-panel">
          <div className="panel-header">Query</div>
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
                <button
                  key={name}
                  className="example-btn"
                  onClick={() => setQuery(EXAMPLES[name])}
                >
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
              results.findings.map((finding, i) => (
                <ResultItem key={i} finding={finding} />
              ))
            )}
          </div>
          <div className="stats">
            <span className="error-count">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
            <span className="warning-count">{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>
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
