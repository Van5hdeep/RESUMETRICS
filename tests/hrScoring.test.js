import assert from 'node:assert/strict'
import { bandOf, candidatesCsv, candidateSummary, rankCandidates, scoreCandidate, validateWeights, weightsFor } from '../shared/hrScoring.js'
import { isHrPro, openingsLeft } from '../shared/hrPlans.js'

const now = new Date(2026, 10, 1)
const opening = {
  title: 'Frontend Developer',
  mustHave: ['React', 'JavaScript', 'CSS'],
  niceToHave: ['TypeScript', 'Figma'],
  minYears: 2,
  education: '',
  keywords: ['component library'],
  responsibilities: ['Build reusable React components for the dashboard']
}
const strong = {
  fullName: 'Asha Rao',
  headline: 'Frontend Developer',
  summary: 'Frontend developer building React dashboards and a component library in TypeScript.',
  skills: { technical: ['React', 'JavaScript', 'CSS', 'TypeScript'] },
  experience: [{ role: 'Frontend Developer', company: 'Acme', startDate: 'Jan 2022', endDate: 'Present', bullets: ['Built reusable React components for the analytics dashboard', 'Cut bundle size 30% with CSS modules'] }],
  education: [{ degree: 'B.Tech Computer Science', institution: 'IIT' }]
}
const weak = {
  fullName: 'Ben Ito',
  headline: 'Accountant',
  skills: { technical: ['Excel', 'Tally'] },
  experience: [{ role: 'Accountant', company: 'Ledger Co', startDate: 'Jan 2025', endDate: 'Present', bullets: ['Prepared monthly statements'] }],
  education: [{ degree: 'B.Com', institution: 'DU' }]
}

// Weights: education drops out when no requirement is stated, and the rest still add to 100.
assert.deepEqual(weightsFor(opening), { skills: 56, experience: 33, keywords: 11 })
assert.deepEqual(weightsFor({ ...opening, education: "Bachelor's in Computer Science" }), { skills: 50, experience: 30, education: 10, keywords: 10 })

// A matching resume scores high, with every must-have found; an unrelated one scores low and lists what is missing.
const good = scoreCandidate(strong, opening, { now })
assert.ok(good.score >= 75, `strong resume scored ${good.score}`)
assert.equal(good.band.id, 'strong')
assert.equal(good.mustHave.met, 3)
assert.ok(good.years >= 4)
const poor = scoreCandidate(weak, opening, { now })
assert.ok(poor.score < 40, `weak resume scored ${poor.score}`)
assert.equal(poor.band.id, 'weak')
assert.deepEqual(poor.mustHave.items.filter(item => !item.found).map(item => item.term), ['React', 'JavaScript', 'CSS'])

// Education is scored only when the opening asks for it.
assert.equal(good.categories.education, undefined)
const withEducation = scoreCandidate(strong, { ...opening, education: "Bachelor's in Computer Science" }, { now })
assert.equal(withEducation.categories.education.score, 100)

// Ranking: best first; summaries carry what the table shows.
const rows = rankCandidates([candidateSummary({ id: 'b', resumeData: weak, fileName: 'ben.pdf' }, opening, { now }), candidateSummary({ id: 'a', resumeData: strong, fileName: 'asha.pdf' }, opening, { now })])
assert.deepEqual(rows.map(row => row.id), ['a', 'b'])
assert.equal(rows[0].name, 'Asha Rao')
assert.equal(rows[1].missingMustHave.length, 3)
assert.equal(candidateSummary({ id: 'c', resumeData: {}, fileName: 'blank.pdf' }, opening, { now }).name, 'blank.pdf')

// Custom weights: always add to 100, education still drops out when not required, all-zero falls back to defaults.
assert.deepEqual(weightsFor({ ...opening, weights: { skills: 1, experience: 1, education: 5, keywords: 1 } }), { skills: 34, experience: 33, keywords: 33 })
assert.deepEqual(weightsFor({ ...opening, weights: { skills: 0, experience: 0, education: 0, keywords: 0 } }), weightsFor(opening))
assert.throws(() => validateWeights({ skills: -1 }), /between 0 and 100/)
assert.throws(() => validateWeights({ skills: 0, experience: 0, education: 0, keywords: 0 }), /above 0/)
assert.equal(validateWeights(null), null)
const skillsOnly = scoreCandidate(strong, { ...opening, weights: { skills: 100, experience: 0, education: 0, keywords: 0 } }, { now })
assert.equal(skillsOnly.score, skillsOnly.categories.skills.score)

// The why line and evidence come only from the breakdown and the resume itself.
assert.equal(good.why, 'Meets all 3 must-haves; 4.8 years against 2+ asked; closely matching role: Frontend Developer at Acme.')
assert.match(poor.why, /^Meets 0 of 3 must-haves \(missing React, JavaScript and 1 more\)/)
const react = good.mustHave.items.find(item => item.term === 'React')
assert.deepEqual(react.evidence, { where: 'Summary', text: 'Frontend developer building React dashboards and a component library in TypeScript.' })
assert.equal(good.mustHave.items.find(item => item.term === 'CSS').evidence.where, 'Skills')
assert.equal(poor.mustHave.items[0].evidence, null)

// CSV export quotes commas and quotes, and defuses spreadsheet formulas.
const csv = candidatesCsv([{ ...rows[0], name: '=HYPERLINK("x")', email: 'a@b.c', phone: '', reason: 'a, b', status: 'shortlisted' }], weightsFor(opening)).split('\r\n')
assert.equal(csv.length, 2)
assert.match(csv[1], /^1,"'=HYPERLINK\(""x""\)",a@b\.c,/)
assert.match(csv[1], /"a, b",asha\.pdf$/)

// Bands
assert.equal(bandOf(75).id, 'strong')
assert.equal(bandOf(74).id, 'good')
assert.equal(bandOf(40).id, 'fair')
assert.equal(bandOf(0).id, 'weak')

// Plans
assert.equal(isHrPro({ tier: 'pro', status: 'active' }), true)
assert.equal(isHrPro({ tier: 'pro', status: 'active', currentPeriodEnd: '2020-01-01T00:00:00Z' }), false)
assert.equal(openingsLeft({ tier: 'free' }, 1), 1)
assert.equal(openingsLeft({ tier: 'free' }, 5), 0)
assert.equal(openingsLeft({ tier: 'pro', status: 'active' }, 9), Infinity)

console.log('hrScoring: ok')
