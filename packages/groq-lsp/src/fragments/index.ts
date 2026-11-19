import type { GroqQuery } from '../types.js'
import { resolveTemplates } from './resolve.js'
import type { FragmentHost } from './types.js'

export { resolveEmbeddedQueries, resolveTemplates } from './resolve.js'
export {
  pathCandidates,
  readPathMapping,
  resolveImport,
  type PathMapping,
} from './resolve-import.js'
export type { FragmentHost, ResolvedQuery } from './types.js'

/**
 * Inlines the `${}` fragments of the interpolated queries that `extractQueries()` found in a
 * file, from the same file or the files it imports, so diagnostics lint the query that runs.
 * Queries without interpolations, and those with a fragment that cannot be resolved, are
 * returned as they are.
 */
export async function resolveQueryFragments(
  content: string,
  file: string,
  queries: Array<GroqQuery>,
  host: FragmentHost
): Promise<Array<GroqQuery>> {
  const interpolated = queries.filter((query) => query.interpolated)
  if (interpolated.length === 0) {
    return queries
  }
  const resolved = await resolveTemplates(
    content,
    file,
    interpolated.map((query) => query.start - 1),
    host
  )
  const byQuery = new Map(interpolated.map((query, index) => [query, resolved[index]]))
  return queries.map((query) => {
    const template = byQuery.get(query)
    return template ? { ...query, resolved: template } : query
  })
}
