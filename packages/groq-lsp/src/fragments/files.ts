import { readFile, realpath } from 'node:fs/promises'
import type { GroqQuery } from '../types.js'
import { resolveQueryFragments } from './index.js'
import type { FragmentHost } from './types.js'

/**
 * Resolves the fragments of a language server's documents, and remembers which files each one
 * read, so editing a fragment can re-validate the documents that use it.
 */
export class FragmentFiles {
  private readonly reads = new Map<string, Set<string>>()

  /**
   * @param openText - The text of an open document by file path, so unsaved edits to a fragment
   *   are used. Files that are not open are read from disk.
   */
  constructor(private readonly openText: (file: string) => string | undefined) {}

  async resolve(file: string, content: string, queries: Array<GroqQuery>) {
    if (!queries.some((query) => query.interpolated)) {
      this.reads.delete(file)
      return queries
    }
    const read = new Set<string>()
    const host: FragmentHost = {
      readFile: async (path) => {
        read.add(path)
        const open = this.openText(path)
        if (open !== undefined) {
          return open
        }
        try {
          return await readFile(path, 'utf8')
        } catch {
          return undefined
        }
      },
      realpath: (path) => realpath(path),
    }
    const resolved = await resolveQueryFragments(content, file, queries, host)
    this.reads.set(file, read)
    return resolved
  }

  /** The files whose queries read `file` the last time they were resolved. */
  dependents(file: string): Array<string> {
    return [...this.reads].flatMap(([dependent, read]) => (read.has(file) ? [dependent] : []))
  }

  forget(file: string) {
    this.reads.delete(file)
  }
}
