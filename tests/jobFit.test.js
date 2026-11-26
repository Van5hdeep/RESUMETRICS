// Job fit (shared/jobFit.js): a job close to the resume gets no warning, a stretch says what experience is missing,
// and a job from a different field says plainly that tailoring won't make this resume fit.
import assert from 'node:assert/strict'
import { assessJobFit, fitVerdict } from '../shared/jobFit.js'
import { scoreKeywords, verdictFor } from '../shared/jdKeywords.js'

const now = new Date('2026-11-26')
const resume = {
  fullName: 'Asha Rao', headline: 'Full Stack Developer', summary: 'Full stack developer building React and Node.js apps with PostgreSQL.',
  skills: { languages: ['JavaScript', 'TypeScript', 'Python'], frameworks: ['React', 'Node.js', 'Express.js'], tools: ['Git', 'Docker'], databases: ['PostgreSQL', 'MongoDB'] },
  experience: [{ role: 'Software Engineer Intern', company: 'Northwind Labs', startDate: 'Jan 2025', endDate: 'Present', bullets: ['Built a React dashboard used by 12,000 weekly users', 'Wrote REST APIs in Node.js and Express'] }],
  projects: [{ name: 'TaskFlow', description: 'Kanban app in React and Node.js', bullets: ['Added real-time updates with WebSockets'], techStack: ['React', 'Node.js', 'MongoDB'] }],
  education: [{ degree: 'B.Tech Computer Science', institution: 'IIT', startDate: '2022', endDate: '2026' }]
}
const keywordsOf = (key, other = []) => [...key.map(term => ({ term, group: 'hard', key: true, jdCount: 2, selected: true })), ...other.map(term => ({ term, group: 'keyword', key: false, jdCount: 1, selected: true }))]
const assess = (jd, keywords, reachable = null) => assessJobFit({ resume, jd, match: scoreKeywords(resume, keywords), reachable, now })

// 1. A close match: no warning.
const frontend = { title: 'Frontend Developer', mustHave: ['React', 'JavaScript', 'TypeScript', 'REST APIs'], niceToHave: ['Docker'], keywords: ['dashboard'], yearsExperience: 1 }
const close = assess(frontend, keywordsOf(frontend.mustHave, ['Docker', 'dashboard']), 92)
assert.equal(close.level, 'fit')
assert.deepEqual(close.reasons, [])
assert.equal(fitVerdict(close, verdictFor(80)).label, 'Good match', 'a fit keeps the normal verdict')

// A close job whose fixes only reach 68 (fixes are a few suggestions, not everything possible) is still a fit.
assert.equal(assess(frontend, keywordsOf(frontend.mustHave, ['Docker', 'dashboard', 'customer-facing', 'code reviews', 'fintech']), 68).level, 'fit')

// 2. A stretch: same field, but asks for skills and years the resume doesn't show.
const senior = { title: 'Senior Backend Engineer', mustHave: ['Node.js', 'Kubernetes', 'Kafka', 'AWS', 'Go'], niceToHave: [], keywords: ['microservices'], yearsExperience: 5 }
const stretch = assess(senior, keywordsOf(senior.mustHave, ['microservices']), 55)
assert.equal(stretch.level, 'stretch')
assert.ok(stretch.reasons.some(reason => /1 of the 5 key skills/.test(reason)), stretch.reasons.join(' | '))
assert.ok(stretch.reasons.some(reason => /5\+ years/.test(reason)))
assert.doesNotMatch(fitVerdict(stretch, verdictFor(40)).text, /Aim for/)

// 3. A different field: a nursing job against a developer resume.
const nurse = { title: 'Staff Nurse', mustHave: ['patient care', 'BLS certification', 'medication administration', 'nursing license', 'ICU'], niceToHave: ['EMR'], keywords: ['ward rounds', 'vital signs'], yearsExperience: 2 }
const mismatch = assess(nurse, keywordsOf(nurse.mustHave, ['EMR', 'ward rounds', 'vital signs']), 6)
assert.equal(mismatch.level, 'mismatch')
assert.equal(mismatch.title, 'Your resume isn’t a good fit for this job')
assert.ok(mismatch.reasons.some(reason => /None of your roles or projects is close to the work of a Staff Nurse/.test(reason)))
assert.ok(mismatch.reasons.some(reason => /Even with every fix applied, the match only reaches about 6/.test(reason)))
assert.ok(mismatch.suggestedRoles.length > 0, 'suggests roles closer to the resume')
assert.match(mismatch.text, /can’t add experience you don’t have/)
const verdict = fitVerdict(mismatch, verdictFor(0))
assert.equal(verdict.label, 'Not a good fit')
assert.doesNotMatch(verdict.text, /Aim for/)

// The mismatch is recognised before fixes have loaded too (reachable unknown).
assert.equal(assess(nurse, keywordsOf(nurse.mustHave)).level, 'mismatch')

console.log('jobFit: all checks passed')
