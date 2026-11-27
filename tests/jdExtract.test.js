import assert from 'node:assert/strict'
import { extractJd } from '../shared/jdExtract.js'

const guard = `Security Officer - Sentinel Protection Services
Denver, Colorado

What you will do:
• Patrol the site and monitor CCTV cameras
• Respond to security incidents and complete incident reporting
• Manage access control for staff and visitors

Requirements:
• Must have 2+ years of incident reporting and access control experience
• Valid guard licence required
• Strong communication and attention to detail
Nice to have: first aid certificate`

const jd = extractJd(guard)
assert.equal(jd.title, 'Security Officer')
assert.equal(jd.company, 'Sentinel Protection Services')
const all = [...jd.mustHave, ...jd.niceToHave, ...jd.keywords].map(term => term.toLowerCase())
assert.ok(all.includes('incident reporting'), `incident reporting found: ${all}`)
assert.ok(all.includes('access control'), `access control found: ${all}`)
assert.ok(jd.mustHave.map(term => term.toLowerCase()).includes('incident reporting'), 'requirement phrase is a key requirement')
assert.ok(jd.softSkills.includes('communication') && jd.softSkills.includes('attention to detail'))
assert.deepEqual(jd.niceToHave, ['first aid certificate'])
assert.ok(!jd.keywords.includes('monitor') && !jd.keywords.includes('site'), 'lone verbs and filler nouns are not keywords')

const dev = extractJd(`Full Stack Engineer at Acme Cloud
Must have: React, Node.js, Docker and PostgreSQL.
Nice to have: GraphQL.
You will build microservices and own observability for our microservices.`)
assert.equal(dev.title, 'Full Stack Engineer')
assert.equal(dev.company, 'Acme Cloud')
assert.ok(dev.mustHave.includes('React') && dev.mustHave.includes('Docker'))
assert.ok(dev.niceToHave.includes('GraphQL'))
assert.ok(dev.keywords.concat(dev.mustHave).map(term => term.toLowerCase()).includes('microservices'))
assert.ok(!dev.mustHave.some(term => term.split(' ').length > 2 && term.includes('react')), 'list items are not glued into one phrase')

// Non-tech posts: office skills, languages, section-aware must/nice, no job titles as skills, years and education.
const pa = extractJd(`Personal Assistant
We are hiring a Personal Assistant to support our Managing Director.
What you will do
- Handle calendar management: schedule meetings, send invites and avoid clashes
- Make travel arrangements: flights, hotels, visas and itineraries
- Manage phone calls, emails and correspondence on the Director's behalf
- Take minutes of meeting and follow up on action points
Requirements
- 2+ years of experience as a Personal Assistant, Executive Assistant or Secretary
- Strong communication skills in English, written and spoken
- Proficient in MS Office: Excel, Word and PowerPoint
Nice to have
- Google Workspace (Gmail, Google Calendar, Google Docs)
- Hindi or another regional language
- Data entry and basic bookkeeping, Tally
Education
- Bachelor's degree in any discipline`)
for (const skill of ['MS Office', 'Excel', 'PowerPoint', 'Communication', 'English', 'Calendar management', 'Travel arrangements']) assert.ok(pa.mustHave.includes(skill), `${skill} is a must-have: ${pa.mustHave}`)
for (const skill of ['Google Workspace', 'Hindi', 'Data entry', 'Tally', 'Bookkeeping']) assert.ok(pa.niceToHave.includes(skill), `${skill} is a nice-to-have: ${pa.niceToHave}`)
assert.ok(pa.mustHave.length <= 8, `at most 8 must-haves: ${pa.mustHave}`)
assert.ok(![...pa.mustHave, ...pa.niceToHave].some(term => /assistant|secretary/i.test(term)), 'job titles are not skills')
assert.ok(!pa.niceToHave.some(term => /^(basic|another)\b/i.test(term)), `no vague phrases: ${pa.niceToHave}`)
assert.equal(pa.yearsExperience, 2)
assert.equal(pa.education, "Bachelor's degree in any discipline")
const accountant = extractJd('Accountant\nRequirements:\n- B.Com or M.Com with 3+ years of accounting experience\n- Proficient in Tally and Excel\nNice to have:\n- SAP experience')
assert.equal(accountant.education, 'B.Com or M.Com')
assert.equal(accountant.yearsExperience, 3)
assert.ok(accountant.mustHave.includes('Tally') && accountant.niceToHave.includes('SAP'))
// Numbered lists lose their number, but "2+ years" keeps its own.
assert.equal(extractJd('Driver\nRequirements:\n1. 5 years of driving experience\n2) Valid driving licence').yearsExperience, 5)

const started = performance.now()
for (let index = 0; index < 50; index += 1) extractJd(guard.repeat(4))
assert.ok(performance.now() - started < 1500, 'extraction is instant')
console.log('jdExtract: all checks passed')
