// Suggestion items in the chat (PLAN-034): their starting status, and per-item undo by replay (D45).
// Pure apart from the callbacks, so Node tests cover it without a browser.

/** ready (arrow applies), deferred (arrow runs a focused turn), info (needs an answer), locked (Pro). */
export function initialItemStatus(item) {
  if (item.locked) return 'locked'
  if (item.operations?.length) return 'ready'
  if (item.instruction) return 'deferred'
  return 'info'
}

export const withStatus = items => (items ?? []).map(item => ({ ...item, status: item.status ?? initialItemStatus(item) }))

// A message that only asks to take back NIMBUS's last change: handled in the browser, no AI call.
// Anything longer ("undo the bold but keep the new summary") goes to NIMBUS as a normal request.
const UNDO = /^(please\s+)?(undo|revert|reverse|go back|take (it|that) back|put (it|that) back)(\s+(it|that|this|the last( one| change)?|my last change|your last change|what you (just )?did|the changes?|those changes))?(\s+please)?[\s.!]*$/i
export const isUndoRequest = text => UNDO.test(String(text ?? '').trim())

/** The text NIMBUS sees for an earlier turn in the conversation, so "do the second one" can be understood. */
export function conversationText(turn) {
  if (!turn.items?.length) return turn.text
  return `${turn.text ?? ''}\n${turn.items.map((item, index) => `${index + 1}. ${item.title}${item.status === 'applied' ? ' (applied)' : ''}`).join('\n')}`.trim()
}

// The same document always gives the same key, whatever order its object keys were written in, so a step that
// re-sets a value to what it already was counts as no change.
export const stableKey = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item)
