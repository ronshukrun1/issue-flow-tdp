/**
 * Extracts unique, lowercased usernames from `@username` mentions
 * found in the given text.
 *
 * The regex `\B@(\w+)` matches an `@` that is **not** preceded by a
 * word character, followed by one or more word characters. This avoids
 * matching email addresses while capturing standalone mentions.
 *
 * @param content - The comment text to scan.
 * @returns A deduplicated array of lowercased usernames (without the `@`).
 */
export function extractMentions(content: string): string[] {
  const regex = /\B@(\w+)/gi;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    matches.push(match[1].toLowerCase());
  }

  return [...new Set(matches)];
}
