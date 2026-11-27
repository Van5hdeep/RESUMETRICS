import assert from 'node:assert/strict'
import { bandOf, compareCandidates, tieBreakReason, candidateAts, candidatesCsv, candidateSummary, groupOf, HR_THRESHOLD, knockoutsFor, rankCandidates, scoreCandidate, screen, thresholdFor, validateScreening, validateWeights, weightsFor } from '../shared/hrScoring.js'
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
assert.deepEqual(weightsFor(opening), { keywords: 44, experience: 28, skills: 22, completeness: 6 })
assert.deepEqual(weightsFor({ ...opening, education: "Bachelor's in Computer Science" }), { keywords: 40, experience: 25, skills: 20, education: 10, completeness: 5 })

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
// Openings saved before Completeness existed have no weight for it, so it counts for 0 there.
assert.deepEqual(weightsFor({ ...opening, weights: { skills: 1, experience: 1, education: 5, keywords: 1 } }), { keywords: 34, experience: 33, skills: 33, completeness: 0 })
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
// Phone numbers stay readable (no stray apostrophe) and still can't start a formula; anything else that could is guarded.
const phoneRow = candidatesCsv([{ ...rows[0], phone: '+91 90000 12345', headline: '+cmd|calc', fileName: '-2+3' }], weightsFor(opening)).split('\r\n')[1]
assert.match(phoneRow, /,\(\+91\) 90000 12345,/)
assert.match(phoneRow, /,'\+cmd\|calc,/)
assert.match(phoneRow, /,'-2\+3$/)
assert.doesNotMatch(phoneRow, /,[=+\-@][^,]*/, 'no cell starts with a formula character')

// Bands
assert.equal(bandOf(75).id, 'strong')
assert.equal(bandOf(74).id, 'good')
assert.equal(bandOf(40).id, 'fair')
assert.equal(bandOf(0).id, 'weak')

// Section completeness is a scored category of its own.
assert.equal(typeof good.categories.completeness.score, 'number')
// Asha has a summary and Ben doesn't; neither lists an email, phone or city, nor an end year for education.
assert.equal(good.categories.completeness.score, 65)
assert.equal(poor.categories.completeness.score, 45)

// Threshold: 65 unless the opening sets 40–90; anything else falls back.
assert.equal(HR_THRESHOLD, 65)
assert.equal(thresholdFor({}), 65)
assert.equal(thresholdFor({ threshold: 72 }), 72)
assert.equal(thresholdFor({ threshold: 10 }), 65)
assert.deepEqual(validateScreening({ threshold: 70.4, knockouts: { minYears: true, mustHave: 'yes' } }), { threshold: 70, knockouts: { minYears: true, mustHave: false } })
assert.throws(() => validateScreening({ threshold: 95 }), /between 40 and 90/)
assert.throws(() => validateScreening({ knockouts: null }), /on\/off switches/)
assert.deepEqual(knockoutsFor({}), { minYears: false, mustHave: false })

// Screening: passing needs the threshold and no knockout; knockouts apply only when switched on.
assert.equal(good.screening.passed, true)
assert.equal(good.screening.qualifies, true)
assert.equal(poor.screening.passed, false)
assert.deepEqual(poor.screening.knockouts, [])
const knocked = screen(poor, { ...opening, knockouts: { minYears: true, mustHave: true } })
assert.deepEqual(knocked.knockouts.map(item => item.id), ['minYears', 'mustHave'])
assert.match(knocked.knockouts[1].detail, /^Missing React, JavaScript, CSS$/)
const highButMissing = screen({ ...good, mustHave: { ...good.mustHave, items: [...good.mustHave.items, { term: 'Vue', found: false }] } }, { ...opening, knockouts: { mustHave: true } })
assert.equal(highButMissing.passed, true)
assert.equal(highButMissing.qualifies, false)

// Groups: failing ATS readability comes first (not evaluated); then threshold and knockouts decide.
assert.equal(groupOf({ qualified: false }, good.screening), 'ats')
assert.equal(groupOf({ qualified: true }, good.screening), 'ranked')
assert.equal(groupOf({ qualified: true }, poor.screening), 'below')

// The ATS result: the stored one when the file was checked at upload, else worked out from the resume alone.
assert.deepEqual(candidateAts({ ats: { score: 88, qualified: true, failed: [] } }), { score: 88, qualified: true, failed: [], fileChecked: true })
const fromResume = candidateAts({ resumeData: strong })
assert.equal(fromResume.fileChecked, false)
assert.equal(typeof fromResume.score, 'number')
const summaryRow = candidateSummary({ id: 'a', resumeData: strong, fileName: 'asha.pdf', ats: { score: 91, qualified: true, failed: [] } }, opening, { now })
assert.equal(summaryRow.group, 'ranked')
assert.equal(summaryRow.ats.score, 91)
assert.equal(summaryRow.threshold, 65)
assert.equal(candidateSummary({ id: 'b', resumeData: strong, fileName: 'asha.pdf', ats: { score: 40, qualified: false, failed: [] } }, opening, { now }).group, 'ats')

// Totals keep one decimal; the exact score is kept for tie-breaks.
assert.equal(good.score, Math.round(good.exact * 10) / 10)

// No two resumes share a place. Same total: the cascade compares finer and finer detail and says why.
const row = (id, over) => ({ id, name: id, score: 70, exact: 70, mustHaveMet: 3, niceMet: 1, years: 3, depth: 10, quantified: 2, serial: 1, ats: { score: 90 }, categories: { keywords: 70, experience: 70, skills: 70, completeness: 80 }, ...over })
const tied = rankCandidates([row('a', {}), row('b', { mustHaveMet: 4 })])
assert.deepEqual(tied.map(item => [item.id, item.rank]), [['b', 1], ['a', 2]])
assert.equal(tied[0].aheadOn, 'more must-have skills')
assert.equal(tied[1].behindOn, 'more must-have skills')
// Weights decide which category is compared first: the heaviest.
const byWeight = (weights) => tieBreakReason(row('x', { categories: { keywords: 71, experience: 69, skills: 70, completeness: 80 } }), row('y', { categories: { keywords: 69, experience: 71, skills: 70, completeness: 80 } }), weights)
assert.equal(byWeight({ keywords: 40, experience: 25 }), 'a higher Keywords score')
assert.equal(byWeight({ keywords: 10, experience: 60 }), 'a higher Experience score')
// Down the cascade: years, ATS score, mentions of the job's terms, quantified results, then upload order.
assert.equal(tieBreakReason(row('a', { years: 5 }), row('b', {})), 'more years of experience')
assert.equal(tieBreakReason(row('a', { ats: { score: 95 } }), row('b', {})), 'a higher ATS score')
assert.equal(tieBreakReason(row('a', { depth: 11 }), row('b', {})), 'more mentions of the job’s terms')
assert.equal(tieBreakReason(row('a', { quantified: 3 }), row('b', {})), 'more results shown with numbers')
const identical = rankCandidates([row('late', { serial: 2 }), row('early', { serial: 1 })])
assert.deepEqual(identical.map(item => item.id), ['early', 'late'])
assert.equal(identical[0].aheadOn, 'being uploaded first')
// A higher total always wins, whatever the detail; different totals carry no tie note.
const apart = rankCandidates([row('a', { score: 70.1, mustHaveMet: 0 }), row('b', { score: 70.2 })])
assert.deepEqual(apart.map(item => item.id), ['b', 'a'])
assert.equal(apart[0].aheadOn, null)
// Across a mixed batch every pair is ordered (never 0) and every place is taken once.
const batch = Array.from({ length: 30 }, (_, index) => row(`r${index}`, { score: 60 + (index % 4), mustHaveMet: index % 3, years: index % 5, serial: index + 1 }))
for (const first of batch) for (const second of batch) if (first !== second) assert.notEqual(compareCandidates(first, second), 0)
assert.deepEqual(rankCandidates(batch).map(item => item.rank), Array.from({ length: 30 }, (_, index) => index + 1))

// Plans
assert.equal(isHrPro({ tier: 'pro', status: 'active' }), true)
assert.equal(isHrPro({ tier: 'pro', status: 'active', currentPeriodEnd: '2020-01-01T00:00:00Z' }), false)
assert.equal(openingsLeft({ tier: 'free' }, 1), 1)
assert.equal(openingsLeft({ tier: 'free' }, 5), 0)
assert.equal(openingsLeft({ tier: 'pro', status: 'active' }, 9), Infinity)

console.log('hrScoring: ok')
