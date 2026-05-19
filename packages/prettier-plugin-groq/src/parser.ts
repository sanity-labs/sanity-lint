import type { Parser } from 'prettier'

export interface GroqAst {
  type: 'groq-root'
  text: string
}

export const groqParser: Parser<GroqAst> = {
  parse(text) {
    return { type: 'groq-root', text }
  },
  astFormat: 'groq-ast',
  locStart: () => 0,
  locEnd: (node) => node.text.length,
}
