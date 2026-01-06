import type { Plugin, SupportLanguage, Parser, Printer } from 'prettier'
import { doc } from 'prettier'
import { groqParser, type GroqAst } from './parser.js'
import {
  createWasmGroqPrinter,
  initWasmFormatter,
  isWasmFormatterAvailable,
} from './wasm-printer.js'

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

const printers: Record<string, Printer> = {
  'groq-ast': createWasmGroqPrinter(doc.builders),
}

const plugin: Plugin = {
  languages,
  parsers,
  printers,
}

export default plugin
export { languages, parsers, printers, initWasmFormatter, isWasmFormatterAvailable }

// Re-export TS printer for direct use
export { createGroqPrinter } from './printer.js'
