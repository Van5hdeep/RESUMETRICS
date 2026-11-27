import assert from 'node:assert/strict'
import { ATS_PASS_SCORE, ATS_RULES, atsSummary, evaluateAts, followsStandardOrder, headingsInText, isDarkColour, isPhone, presentSections, sectionCompleteness, sectionForHeading } from '../shared/atsStandard.js'

const now = new Date(2026, 10, 1)
const good = {
  fullName: 'Asha Rao', email: 'asha@mail.com', phone: '+91 98765 43210', location: 'Pune', headline: 'Frontend Developer',
  summary: 'Frontend Developer with four years building React dashboards and a shared component library used by six product teams across the company.',
  skills: { languages: ['JavaScript', 'TypeScript', 'CSS'], frameworks: ['React', 'Next.js'], tools: ['Git', 'Figma'] },
  experience: [
    { role: 'Frontend Developer', company: 'Acme', startDate: 'Jan 2022', endDate: 'Present', bullets: ['Built a React component library used by 6 teams', 'Cut bundle size 30% with code splitting'] },
    { role: 'Frontend Intern', company: 'Beta', startDate: 'Jun 2021', endDate: 'Dec 2021', bullets: ['Developed 12 landing pages in React'] }
  ],
  education: [{ degree: 'B.Tech Computer Science', institution: 'COEP', endDate: '2021' }]
}
const safeLayout = { columns: false, images: false, contactInBody: true, font: 'Arial, sans-serif', bodySize: 11, textColor: '#111111' }
const workspace = { layout: safeLayout, order: ['summary', 'experience', 'education', 'skills'], pages: 1, now }
const rule = (result, id) => result.rules.find(item => item.id === id)
const failed = result => result.failures.map(item => item.id)

// The rulebook lists every rule once, with a level and a group.
assert.deepEqual(ATS_RULES.map(item => item.id), ['F1', 'F2', 'F3', 'F3b', 'F4', 'L1', 'L2', 'L3', 'L4', 'S1', 'S2', 'S3', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'])
assert.ok(ATS_RULES.every(item => ['required', 'recommended'].includes(item.level) && item.groupLabel))

// A clean resume in a safe layout passes every rule it can check and qualifies; file rules are left unchecked.
const clean = evaluateAts(good, workspace)
assert.equal(clean.qualified, true)
assert.equal(clean.score, 100)
assert.deepEqual(clean.rules.filter(item => item.status === 'unchecked').map(item => item.id), ['F1', 'F2', 'F4'])
assert.equal(clean.completeness, 100)
assert.equal(clean.standard, 'Refile ATS Standard v1')

// Nothing known about the layout: those rules are unchecked, not failed.
const contentOnly = evaluateAts(good, { now })
assert.deepEqual(contentOnly.rules.filter(item => item.status === 'unchecked').map(item => item.id), ['F1', 'F2', 'F3', 'F3b', 'F4', 'L1', 'L2', 'L3', 'L4', 'S2'])
assert.equal(contentOnly.qualified, true)

// File rules.
assert.equal(rule(evaluateAts(good, { file: { type: 'pdf', textLayer: false }, now }), 'F1').status, 'fail')
assert.equal(rule(evaluateAts(good, { file: { type: 'png' }, now }), 'F1').status, 'fail')
assert.match(rule(evaluateAts(good, { file: { type: 'pdf', textLayer: true, unreadablePages: [2] }, now }), 'F1').detail, /page 2/)
assert.equal(rule(evaluateAts(good, { file: { type: 'docx' }, now }), 'F1').status, 'pass')
assert.equal(rule(evaluateAts(good, { file: { type: 'pdf', encrypted: true }, now }), 'F2').status, 'fail')
assert.equal(rule(evaluateAts(good, { pages: 3, now }), 'F3').status, 'fail')
assert.equal(rule(evaluateAts(good, { pages: 2, years: 3, now }), 'F3b').status, 'fail')   // under 5 years on two pages
assert.equal(rule(evaluateAts(good, { pages: 2, years: 6, now }), 'F3b').status, 'pass')
assert.equal(rule(evaluateAts(good, { file: { type: 'pdf', name: 'Asha-Rao-Resume.pdf' }, now }), 'F4').status, 'pass')
assert.equal(rule(evaluateAts(good, { file: { type: 'pdf', name: 'scan001.pdf' }, now }), 'F4').status, 'fail')

// Layout rules.
assert.deepEqual(failed(evaluateAts(good, { ...workspace, layout: { ...safeLayout, columns: true, images: true, contactInBody: false } })), ['L1', 'L2', 'L3'])
assert.equal(rule(evaluateAts(good, { text: 'Asha Rao\nExperience\nEducation\nSkills', now }), 'L3').status, 'fail')       // email not in the body
assert.equal(rule(evaluateAts(good, { text: 'Asha Rao asha@mail.com\nExperience', now }), 'L3').status, 'pass')
const fonts = rule(evaluateAts(good, { ...workspace, layout: { ...safeLayout, font: 'Pacifico', bodySize: 8, textColor: '#cccccc' } }), 'L4')
assert.equal(fonts.status, 'fail')
assert.match(fonts.detail, /Pacifico is not a standard font; body text is 8 pt; body text is too light/)
assert.equal(isDarkColour('#1f2937'), true)
assert.equal(isDarkColour('#9ca3af'), false)

// Section rules: headings, order (with the fresher exception) and the core sections.
assert.equal(sectionForHeading('WORK EXPERIENCE:'), 'experience')
assert.equal(sectionForHeading('Skills & Tools'), 'skills')
assert.equal(sectionForHeading('My Journey'), null)
assert.equal(rule(evaluateAts(good, { ...workspace, headings: { experience: 'Where I have been' } }), 'S1').status, 'fail')
assert.equal(rule(evaluateAts({ ...good, customSections: [{ title: 'Fun facts', content: 'x' }] }, workspace), 'S1').status, 'fail')
assert.equal(rule(evaluateAts({ ...good, customSections: [{ title: 'Additional Information', content: 'x' }] }, workspace), 'S1').status, 'pass')
assert.match(rule(evaluateAts(good, { text: 'Asha\nExperience\nStuff I know', now }), 'S1').detail, /Education, Skills/)
assert.deepEqual(headingsInText('Asha Rao\nPROFESSIONAL SUMMARY\ntext\nWork Experience\nx\nEducation\ny').map(item => item.id), ['summary', 'experience', 'education'])
assert.equal(followsStandardOrder(['summary', 'experience', 'projects', 'education', 'skills']), true)
assert.equal(followsStandardOrder(['summary', 'skills', 'experience']), false)
assert.equal(followsStandardOrder(['summary', 'education', 'projects', 'skills']), false)
assert.equal(followsStandardOrder(['summary', 'education', 'projects', 'skills'], { fresher: true }), true)
assert.equal(followsStandardOrder(['summary', 'projects', 'skills', 'education'], { fresher: true }), false)
assert.equal(rule(evaluateAts(good, { ...workspace, order: ['skills', 'summary', 'experience', 'education'] }), 'S2').status, 'fail')
const fresher = { ...good, experience: [], projects: [{ name: 'Shop', bullets: ['Built a store with 40 products'] }] }
assert.equal(rule(evaluateAts(fresher, { ...workspace, order: ['summary', 'education', 'projects', 'skills'] }), 'S2').status, 'pass')
assert.deepEqual(presentSections(fresher), ['summary', 'projects', 'education', 'skills'])
assert.match(rule(evaluateAts({ ...good, education: [], skills: {} }, workspace), 'S3').detail, /Education, Skills/)

// Content rules.
assert.equal(isPhone('+91 98765 43210'), true)
assert.equal(isPhone('12345'), false)
assert.match(rule(evaluateAts({ ...good, email: 'asha@', phone: '', location: '' }, workspace), 'C1').detail, /a valid email, a valid phone number, city/)
const jobs = (experience) => rule(evaluateAts({ ...good, experience }, workspace), 'C2')
assert.match(jobs([{ role: 'Dev', company: '', startDate: '2020', endDate: 'Present', bullets: [] }]).detail, /Dev: no company, start month and year/)
assert.match(jobs([{ role: 'Dev', company: 'A', startDate: 'Jan 2020', endDate: '03/2021', bullets: [] }, { role: 'Dev', company: 'B', startDate: 'Jan 2019', endDate: 'Dec 2019', bullets: [] }]).detail, /more than one format/)
assert.match(jobs([{ role: 'Old', company: 'A', startDate: 'Jan 2018', endDate: 'Dec 2018', bullets: [] }, { role: 'New', company: 'B', startDate: 'Jan 2023', endDate: 'Present', bullets: [] }]).detail, /not newest first/)
assert.match(jobs([{ role: 'Dev', company: 'A', startDate: 'Jan 2023', endDate: 'now', bullets: [] }]).detail, /write the end date as Present/)
assert.equal(rule(evaluateAts({ ...good, education: [{ degree: 'B.Tech', institution: 'COEP', endDate: 'Expected 2027' }] }, workspace), 'C3').status, 'pass')
assert.equal(rule(evaluateAts({ ...good, education: [{ degree: '', institution: 'COEP', endDate: '2021' }] }, workspace), 'C3').status, 'fail')
assert.match(rule(evaluateAts({ ...good, skills: { other: ['React 9/10', 'CSS', 'Git'] } }, workspace), 'C4').detail, /3 skills listed; ratings on React 9\/10/)
assert.match(rule(evaluateAts({ ...good, summary: `${good.summary} 🚀` }, workspace), 'C5').detail, /Symbols in 1 line/)
assert.equal(rule(evaluateAts({ ...good, experience: [{ ...good.experience[0], bullets: ['• Built 3 apps'] }] }, workspace), 'C5').status, 'pass')   // the plain bullet is fine
assert.equal(rule(evaluateAts({ ...good, experience: [{ ...good.experience[0], bullets: ['Responsible for many things', 'Worked on the website'] }] }, workspace), 'C6').status, 'fail')
assert.equal(rule(evaluateAts({ ...good, summary: 'Hello.' }, workspace), 'C7').status, 'fail')

// Qualification: one required failure is enough to fail, even with a high score; recommended ones only lower it.
const oneRequired = evaluateAts({ ...good, location: '' }, workspace)
assert.equal(oneRequired.qualified, false)
assert.ok(oneRequired.score >= ATS_PASS_SCORE)
assert.deepEqual(failed(oneRequired), ['C1'])
const onlyRecommended = evaluateAts({ ...good, summary: 'Hello there.' }, workspace)
assert.equal(onlyRecommended.qualified, true)
assert.ok(onlyRecommended.score < 100)

// A poor upload fails many rules, and the summary carries what the HR portal stores.
const poor = evaluateAts({ fullName: 'Ben', email: 'ben@', skills: { other: ['Excel ★★★★'] }, experience: [{ role: 'Accountant', startDate: '2020', endDate: 'now', bullets: ['✓ did accounts'] }] },
  { file: { type: 'pdf', textLayer: true, name: 'scan1.pdf', pages: 3 }, layout: { columns: true, images: true }, text: 'Ben\nMy Journey', now })
assert.equal(poor.qualified, false)
assert.ok(poor.score < ATS_PASS_SCORE)
const summary = atsSummary(poor)
assert.equal(summary.qualified, false)
assert.ok(summary.failed.length >= 8 && summary.failed.every(item => item.id && item.label && item.detail))

// Section completeness: everything present scores 100; gaps lower it.
assert.equal(sectionCompleteness(good), 100)
assert.ok(sectionCompleteness({ fullName: 'Ben', skills: { other: ['Excel'] } }) < 40)

console.log('atsStandard: ok')
