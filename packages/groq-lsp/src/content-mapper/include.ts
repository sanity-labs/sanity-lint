/**
 * The `include` folders and globs of groq-content-mapper's `schemas` entries, matched as the
 * mapper matches them: the longest folder that contains a file wins, a glob counting as its
 * folder before the first wildcard.
 */

import { posix, win32 } from 'node:path'
import picomatch from 'picomatch'

export interface Include {
  /** The length of the folder that claims `file`, absolute, or -1 when it is not included. */
  depthOf: (file: string) => number
}

/**
 * Compiles an `include` entry relative to `root`. A plain folder includes every file under it.
 * A glob includes a file when it matches the file or one of its folders. A folder whose name
 * only looks like a glob, such as `app/[locale]`, is still included as a folder.
 */
export function compileInclude(
  include: string,
  root: string,
  platform: NodeJS.Platform = process.platform
): Include {
  const path = platform === 'win32' ? win32 : posix
  const locate = (entry: string) => normalizePath(path.resolve(root, entry), platform)
  const folder = locate(include)
  const depthUnder = (base: string, file: string) =>
    file.startsWith(base.endsWith(path.sep) ? base : `${base}${path.sep}`) ? base.length : -1

  const scanned = picomatch.scan(platform === 'win32' ? include.replaceAll('\\', '/') : include)
  // A bare drive, as `C:` from `C:/**`, would resolve to that drive's working directory.
  const base = /^[a-z]:$/i.test(scanned.base) ? `${scanned.base}/` : scanned.base || '.'
  if (!scanned.isGlob || scanned.negated) {
    return { depthOf: (file) => depthUnder(folder, normalizePath(file, platform)) }
  }
  const globBase = locate(base)
  const matches = picomatch(scanned.glob, { nocase: foldsCase(platform) })
  return {
    depthOf(file) {
      const normalized = normalizePath(file, platform)
      const asFolder = depthUnder(folder, normalized)
      if (asFolder !== -1) {
        return asFolder
      }
      if (depthUnder(globBase, normalized) === -1) {
        return -1
      }
      const segments = path.relative(globBase, normalized).split(path.sep)
      for (let count = 1; count <= segments.length; count++) {
        if (matches(segments.slice(0, count).join('/'))) {
          return globBase.length
        }
      }
      return -1
    },
  }
}

function normalizePath(file: string, platform: NodeJS.Platform): string {
  const resolved = (platform === 'win32' ? win32 : posix).resolve(file)
  return foldsCase(platform) ? resolved.toLowerCase() : resolved
}

function foldsCase(platform: NodeJS.Platform): boolean {
  return platform === 'win32' || platform === 'darwin'
}
