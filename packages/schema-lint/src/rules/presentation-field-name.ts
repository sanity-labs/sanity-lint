import type { SchemaRule } from '../types'

/**
 * Presentation-focused name patterns to flag
 */
const PRESENTATION_PATTERNS = [
  // Color-based names
  /^(red|blue|green|yellow|white|black|gray|grey|dark|light)/i,
  // Size-based names
  /^(big|small|large|tiny|huge|medium)/i,
  /(Big|Small|Large|Tiny|Huge|Medium)$/,
  // Layout-based names
  /^(left|right|center|top|bottom)/i,
  /(Left|Right|Center|Top|Bottom)$/,
  // Column/row names
  /(two|three|four|five|six)(Column|Row)/i,
  /^(column|row)\d+$/i,
  // Explicit presentation terms
  /(Button|Text|Image|Box|Container|Wrapper|Section|Block|Card|Banner|Hero)$/,
  /^(hero|banner|sidebar|header|footer)/i,
]

/**
 * Semantic alternatives for common presentation names
 */
const SUGGESTIONS = new Map<string, string>([
  ['bigText', 'headline, title, heading'],
  ['smallText', 'caption, subtitle, description'],
  ['redButton', 'primaryAction, callToAction'],
  ['heroSection', 'featuredContent, highlight'],
  ['leftColumn', 'primaryContent, mainContent'],
  ['rightColumn', 'secondaryContent, sidebar'],
  ['threeColumnRow', 'featuresGrid, comparisonSection'],
  ['headerImage', 'featuredImage, coverImage'],
  ['bannerText', 'announcement, promotion'],
])

/**
 * Rule: presentation-field-name
 *
 * Field names should be semantic, not presentation-focused.
 */
export const presentationFieldName: SchemaRule = {
  id: 'presentation-field-name',
  name: 'Presentation-focused field name',
  description: 'Avoid presentation-focused field names; use semantic names instead',
  severity: 'warning',
  category: 'style',

  check(schema, context) {
    if (!schema.fields) {
      return
    }

    for (const field of schema.fields) {
      const name = field.name

      for (const pattern of PRESENTATION_PATTERNS) {
        if (pattern.test(name)) {
          const suggestion =
            SUGGESTIONS.get(name) ?? 'a semantic name describing the content purpose'

          context.report({
            message: `Field "${name}" uses presentation-focused naming`,
            severity: 'warning',
            ...(field.span && { span: field.span }),
            help: `Consider using ${suggestion}. Field names should describe content purpose, not visual presentation.`,
          })
          break // Only report once per field
        }
      }
    }
  },
}
