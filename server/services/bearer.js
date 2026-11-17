// Reads "Authorization: Bearer <token>" for both sign-in schemes (Firebase and the HR portal).
// No regular expression: a pattern like /^Bearer\s+(.+)$/ backtracks badly on a crafted header full of spaces.
const MAX_AUTH_HEADER_LENGTH = 4096

/** "Bearer <token>" → "<token>"; anything else (another scheme, empty, oversized) → "". */
export function bearerToken(header) {
  const value = String(header ?? '')
  if (value.length > MAX_AUTH_HEADER_LENGTH || value.slice(0, 7).toLowerCase() !== 'bearer ') return ''
  return value.slice(7).trim()
}
