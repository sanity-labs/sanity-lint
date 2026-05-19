import type { Parser, Plugin, Printer, SupportLanguage } from 'prettier'

import { groqParser, type GroqAst } from './parser.js'
import { groqPrinter } from './wasm-printer.js'

const languages: SupportLanguage[] = [
  {
    name: 'GROQ',
    parsers: ['groq'],
    extensions: ['.groq'],
    vscodeLanguageIds: ['groq'],
  },
]

const parsers: Record<string, Parser<GroqAst>> = {
  groq: groqParser,
}

const printers: Record<string, Printer<unknown>> = {
  'groq-ast': groqPrinter,
}

const plugin: Plugin = {
  languages,
  parsers,
  printers,
}

export default plugin
export { languages, parsers, printers }
