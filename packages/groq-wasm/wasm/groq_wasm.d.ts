/* tslint:disable */
/* eslint-disable */

/**
 * Format a GROQ query.
 *
 * # Arguments
 * * `query` - The GROQ query string to format
 * * `width` - Maximum line width (default: 80)
 *
 * # Returns
 * The formatted query string
 */
export function format(query: string, width?: number | null): string;

export function init(): void;

/**
 * Lint a GROQ query and return findings as JSON.
 *
 * # Arguments
 * * `query` - The GROQ query string to lint
 *
 * # Returns
 * A JSON string containing an array of findings
 */
export function lint(query: string): string;
