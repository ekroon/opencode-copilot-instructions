import { getEncoding } from 'js-tiktoken'
import type { Tiktoken } from 'js-tiktoken'

let encoder: Tiktoken | undefined

function getEncoder(): Tiktoken {
  if (!encoder) {
    encoder = getEncoding('cl100k_base')
  }
  return encoder
}

/**
 * Count the number of tokens in a text string using cl100k_base encoding.
 * Uses lazy initialization — the encoder is created on first use.
 */
export function countTokens(text: string): number {
  if (text.length === 0) {
    return 0
  }
  return getEncoder().encode(text).length
}

/**
 * Format a token count for display.
 * Below 2000: show the raw number (e.g. "500", "1999").
 * At 2000 and above: show shortened thousands (e.g. "2.00k", "12.50k").
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 2000) {
    return `${tokens}`
  }
  const thousands = (tokens / 1000).toFixed(2).replace(/\.?0+$/, '')
  return `${thousands}k`
}

/**
 * Format token usage as a percentage of context size.
 * Returns "N/A" if contextSize is 0, "<0.1%" for very small percentages.
 */
export function formatTokenPercentage(tokens: number, contextSize: number): string {
  if (contextSize === 0) {
    return 'N/A'
  }
  const percentage = (tokens / contextSize) * 100
  if (percentage > 0 && percentage < 0.1) {
    return '<0.1%'
  }
  return `${percentage.toFixed(1)}%`
}
