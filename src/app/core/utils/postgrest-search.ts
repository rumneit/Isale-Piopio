/**
 * PostgREST `.or()` uses commas and parentheses as filter grammar. User input
 * must not be interpolated into that grammar verbatim. Keep Unicode and normal
 * punctuation used in names, but neutralize grammar/wildcard metacharacters.
 */
export function safeIlikeTerm(value: string): string {
  return value.trim().replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').slice(0, 200);
}

