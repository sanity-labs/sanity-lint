#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs'
import { glob } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { lint, initLinter } from './linter'
import { formatFindings, summarizeFindings } from '@sanity-labs/lint-core'
import type { SchemaType } from 'groq-js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

interface CliOptions {
  format: 'pretty' | 'json'
  query?: string
  schema?: string
  files: string[]
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    format: 'pretty',
    files: [],
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg) continue

    if (arg === '--json' || arg === '-j') {
      options.format = 'json'
    } else if (arg === '--query' || arg === '-q') {
      const nextArg = args[++i]
      if (nextArg) {
        options.query = nextArg
      }
    } else if (arg === '--schema' || arg === '-s') {
      const nextArg = args[++i]
      if (nextArg) {
        options.schema = nextArg
      }
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else if (arg === '--version' || arg === '-v') {
      console.log(version)
      process.exit(0)
    } else if (!arg.startsWith('-')) {
      options.files.push(arg)
    }
  }

  return options
}

function printHelp(): void {
  console.log(`
groq-lint - Lint GROQ queries for performance and correctness issues

USAGE:
  groq-lint [OPTIONS] [FILES...]
  groq-lint -q '<query>'
  cat query.groq | groq-lint

OPTIONS:
  -q, --query <QUERY>     Lint a query string directly
  -s, --schema <PATH>     Path to schema.json for schema-aware rules
  -j, --json              Output findings as JSON
  -h, --help              Show this help message
  -v, --version           Show version

SCHEMA-AWARE RULES:
  When a schema is provided (--schema), additional rules are enabled:
  - invalid-type-filter: Catches typos in _type == "value"
  - unknown-field: Catches unknown fields in projections

  Generate schema.json with: npx sanity schema extract --path schema.json

EXAMPLES:
  groq-lint query.groq
  groq-lint -q '*[author->name == "Bob"]'
  groq-lint --schema schema.json 'src/**/*.ts'
  groq-lint --json queries/*.groq
`)
}

function loadSchema(path: string): SchemaType | undefined {
  try {
    if (!existsSync(path)) {
      console.error(`Schema file not found: ${path}`)
      process.exit(1)
    }
    const content = readFileSync(path, 'utf-8')
    return JSON.parse(content) as SchemaType
  } catch (e) {
    console.error(`Error loading schema: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  }
}

/**
 * Extract GROQ queries from a TypeScript/JavaScript file
 * Looks for groq`...` tagged template literals
 */
function extractQueriesFromSource(content: string): string[] {
  const queries: string[] = []

  // Match groq`...` template literals (simple regex, handles most cases)
  const groqTagRegex = /groq\s*`([^`]*)`/g
  let match
  while ((match = groqTagRegex.exec(content)) !== null) {
    if (match[1]) {
      queries.push(match[1])
    }
  }

  return queries
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

/**
 * Expand glob patterns into file paths
 */
async function expandGlobs(patterns: string[]): Promise<string[]> {
  const files: string[] = []

  for (const pattern of patterns) {
    // Check if it's a glob pattern
    if (pattern.includes('*')) {
      try {
        for await (const file of glob(pattern)) {
          files.push(file)
        }
      } catch {
        // If glob fails, try as literal path
        if (existsSync(pattern)) {
          files.push(pattern)
        }
      }
    } else if (existsSync(pattern)) {
      files.push(pattern)
    }
  }

  return files
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))

  // Initialize WASM for better performance (optional, falls back to TS)
  const wasmAvailable = await initLinter()
  if (wasmAvailable) {
    // WASM loaded successfully - using high-performance Rust implementation
  }

  // Load schema if provided
  const schema = options.schema ? loadSchema(options.schema) : undefined
  if (options.schema && schema) {
    console.log(`Using schema: ${options.schema}\n`)
  }

  const queries: { source: string; query: string }[] = []

  // Get queries from various sources
  if (options.query) {
    queries.push({ source: 'cli', query: options.query })
  }

  if (options.files.length > 0) {
    const expandedFiles = await expandGlobs(options.files)

    for (const file of expandedFiles) {
      try {
        const content = readFileSync(file, 'utf-8')

        // Check if it's a TS/JS file - extract GROQ from template literals
        if (
          file.endsWith('.ts') ||
          file.endsWith('.tsx') ||
          file.endsWith('.js') ||
          file.endsWith('.jsx')
        ) {
          const extracted = extractQueriesFromSource(content)
          for (let i = 0; i < extracted.length; i++) {
            const q = extracted[i]
            if (q) {
              queries.push({ source: `${file}:query${i + 1}`, query: q })
            }
          }
        } else {
          // Treat as raw GROQ file
          queries.push({ source: file, query: content })
        }
      } catch (e) {
        console.error(`Error reading file ${file}: ${e instanceof Error ? e.message : e}`)
        process.exit(1)
      }
    }
  }

  // Check for stdin if no other input
  if (queries.length === 0 && !process.stdin.isTTY) {
    const stdin = await readStdin()
    if (stdin.trim()) {
      queries.push({ source: 'stdin', query: stdin })
    }
  }

  if (queries.length === 0) {
    printHelp()
    process.exit(1)
  }

  // Lint all queries
  const allFindings: {
    source: string
    query: string
    findings: ReturnType<typeof lint>['findings']
  }[] = []
  let hasErrors = false

  for (const { source, query } of queries) {
    const result = lint(query, schema ? { schema } : undefined)

    if (result.parseError) {
      console.error(`Parse error in ${source}: ${result.parseError}`)
      hasErrors = true
      continue
    }

    if (result.findings.length > 0) {
      allFindings.push({ source, query, findings: result.findings })
      if (result.findings.some((f) => f.severity === 'error')) {
        hasErrors = true
      }
    }
  }

  // Output results
  if (options.format === 'json') {
    const output = allFindings.map(({ source, findings }) => ({
      source,
      findings,
    }))
    console.log(JSON.stringify(output, null, 2))
  } else {
    for (const { source, query, findings } of allFindings) {
      if (queries.length > 1) {
        console.log(`\n=== ${source} ===\n`)
      }
      console.log(formatFindings(query, findings))
    }

    // Print summary
    const totalFindings = allFindings.flatMap((f) => f.findings)
    if (totalFindings.length > 0) {
      const summary = summarizeFindings(totalFindings)
      console.log(
        `\nFound ${summary.total} issue(s): ${summary.errors} error(s), ${summary.warnings} warning(s), ${summary.infos} info(s)`
      )
    } else if (queries.length > 0) {
      console.log(`Checked ${queries.length} query(ies) - no issues found`)
    }
  }

  process.exit(hasErrors ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
