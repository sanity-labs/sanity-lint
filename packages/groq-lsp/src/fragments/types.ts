export interface FragmentHost {
  /** The text of a file, or undefined when it does not exist or is not a file. */
  readFile(path: string): Promise<string | undefined>
  /**
   * The real path of a file or directory. Packages in node_modules are often symlinks to workspace
   * folders; with this, fragments imported from them are read from the files that are edited.
   */
  realpath?(path: string): Promise<string>
}

export interface ResolvedQuery {
  /** The query with every `${}` that could be resolved replaced by its text. */
  content: string
  /** Offset in the source where the `groq` tag or `defineQuery` call starts. */
  offset: number
}
