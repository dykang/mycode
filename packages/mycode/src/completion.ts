// Adapted from Th0rgal/open-ralph-wiggum/completion.ts (MIT).
// See third-party/ralph-LICENSE and sources.json.
/**
 * Completion detection helpers used by the Ralph loop.
 */

const ANSI_PATTERN = /\[[0-9;]*m/g

export function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, "")
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Returns the last non-empty line of output, after ANSI stripping.
 */
export function getLastNonEmptyLine(output: string): string | null {
  const lines = stripAnsi(output)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.length > 0 ? lines[lines.length - 1] : null
}

/**
 * Checks whether the exact promise tag appears as the final non-empty line.
 */
export function checkTerminalPromise(output: string, promise: string): boolean {
  const lastLine = getLastNonEmptyLine(output)
  if (!lastLine) return false

  const escapedPromise = escapeRegex(promise)
  const pattern = new RegExp(`^<promise>\\s*${escapedPromise}\\s*</promise>$`, "i")
  return pattern.test(lastLine)
}
