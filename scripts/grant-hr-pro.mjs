// Gives HR portal accounts lifetime Hiring Pro without a payment (developers, demos). Run from the repo root:
//   node scripts/grant-hr-pro.mjs abc@gmail.com someone@example.com
//   node scripts/grant-hr-pro.mjs --revoke someone@example.com
// HR accounts live at hrAccounts/{hrIdFor(email)}. An account that has never signed in is created with the plan,
// and the first sign-in keeps it (server/db/hrStore.js ensureAccount only fills in a missing document).
import { FieldValue } from 'firebase-admin/firestore'
import { getConnectionStore } from '../server/services/firebaseAdmin.js'
import { hrIdFor } from '../server/hr/hrAuth.js'

const args = process.argv.slice(2)
const revoke = args.includes('--revoke')
const emails = args.filter(arg => !arg.startsWith('--')).map(email => email.trim().toLowerCase())
if (!emails.length) {
  console.error('Usage: node scripts/grant-hr-pro.mjs [--revoke] email [email...]')
  process.exit(1)
}

const db = getConnectionStore()
let failed = 0
for (const email of emails) {
  const plan = revoke
    ? { tier: 'free' }
    : { tier: 'pro', status: 'active', term: 'lifetime', source: 'developer', grantedAt: new Date().toISOString() }
  const ref = db.collection('hrAccounts').doc(hrIdFor(email))
  try {
    const snapshot = await ref.get()
    await ref.set(snapshot.exists ? { plan } : { email, plan, openingsCreated: 0, createdAt: FieldValue.serverTimestamp() }, { merge: true })
    console.log(`${revoke ? 'Revoked Hiring Pro for' : 'Granted lifetime Hiring Pro to'} ${email} (${ref.id})${snapshot.exists ? '' : ', account created'}`)
  } catch (error) {
    failed += 1
    console.error(`${email}: ${error.message}`)
  }
}
process.exit(failed ? 1 : 0)
