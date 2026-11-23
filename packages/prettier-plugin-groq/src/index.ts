import type { Parser, Plugin, Printer, SupportLanguage } from 'prettier'

import { groqParser } from './parser.js'
import type { GroqAst } from './parser.js'
import { groqPrinter } from './wasm-printer.js'

const languages: Array<SupportLanguage> = [
  {
    name: 'GROQ',
    parsers: ['groq'],
    extensions: ['.groq'],
    vscodeLanguageIds: ['groq'],
  },
]

const parsers = {
  groq: groqParser,
} satisfies Record<string, Parser<GroqAst>>

const printers = {
  'groq-ast': groqPrinter,
} satisfies Record<string, Printer<GroqAst>>

const plugin: Plugin = {
  languages,
  parsers,
  printers,
}

export default plugin
export { languages, parsers, printers }
