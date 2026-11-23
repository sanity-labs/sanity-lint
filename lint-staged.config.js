export default {
  // Type-aware rules resolve types through tsconfig; linting only the staged files loses that for
  // files outside a package's tsconfig (tests, tsdown configs), so lint the whole project.
  '*.{js,jsx,ts,tsx}': [() => 'oxlint --fix', 'prettier --write'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
}
