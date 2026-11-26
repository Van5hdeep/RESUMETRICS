// NIMBUS greeting (PLAN-034): "Hey, <first name>, what do you want done?"
// The name comes from the signed-in account, then the resume, then nobody (no name at all rather than "User").

const firstWord = value => {
  const word = String(value ?? '').trim().split(/\s+/)[0] ?? ''
  // An email-style handle or a stray symbol is not a name.
  if (!word || /[@\d_]/.test(word) || word.length > 24) return ''
  return word[0].toUpperCase() + word.slice(1)
}

export function firstNameFor({ displayName, resumeName } = {}) {
  return firstWord(displayName) || firstWord(resumeName)
}

export function greetingFor(sources = {}, question = 'what do you want done?') {
  const name = firstNameFor(sources)
  return name ? `Hey, ${name}, ${question}` : `Hey, ${question}`
}
