import assert from 'node:assert/strict'
import { scoreResumeAgainstJd, textHasTerm, yearsOfExperience } from '../shared/jdScoring.js'

const resume = {
  headline: 'Frontend Developer', email: 'a@b.co', phone: '+1 555 0100',
  summary: 'Frontend developer building accessible React apps with TypeScript.',
  skills: { languages: ['JS', 'TypeScript'], frameworks: ['React'], tools: ['Git', 'Jest'], databases: ['Postgres'], softSkills: [], other: [] },
  experience: [
    { role: 'Frontend Developer', company: 'Acme', startDate: 'Jan 2021', endDate: 'Dec 2022', bullets: ['Built a [b]design system[/b] in React used by 6 teams', 'Reduced bundle size by 30%'] },
    { role: 'Intern', company: 'Beta', startDate: 'Jun 2022', endDate: 'Present', bullets: ['Maintained component tests with Jest'] }
  ],
  projects: [], education: [{ degree: 'B.Tech Computer Science', institution: 'Uni', details: [] }], certifications: [], achievements: []
}
const now = new Date(2026, 0, 1)

// Synonyms and marks.
assert.equal(textHasTerm('Skilled in JS and Postgres', 'JavaScript'), true)
assert.equal(textHasTerm('Skilled in JS and Postgres', 'PostgreSQL'), true)
assert.equal(textHasTerm('Built with Java', 'JavaScript'), false)
assert.equal(textHasTerm('C++ and C#', 'C#'), true)
// Overlapping ranges counted once: Jan 2021 → Jan 2026 = 5 years.
assert.equal(yearsOfExperience(resume, now), 5)

const jd = { title: 'Senior Frontend Engineer', mustHave: ['React', 'TypeScript', 'GraphQL'], niceToHave: ['Jest', 'Storybook'], yearsExperience: 4, education: "Bachelor's in Computer Science", keywords: ['design system', 'accessibility'], responsibilities: ['Build and maintain a design system in React'] }
const result = scoreResumeAgainstJd(resume, jd, { pages: 1, now })
assert.equal(result.categories.skills.score, 63) // (2 must × 2 + 1 nice) / (3 × 2 + 2) = 5/8
assert.deepEqual(result.categories.skills.missing.map(item => item.term), ['GraphQL', 'Storybook'])
assert.equal(result.categories.education.score, 100)
assert.equal(result.categories.experience.roles[0].level, 'strong') // Frontend Developer using React for a frontend role
assert.equal(result.categories.experience.roles[1].internship, true)
assert.ok(result.keywords.matched.includes('design system'))
assert.ok(result.score > 0 && result.score <= 100)
// Weights re-normalise when education isn't stated.
const noEducation = scoreResumeAgainstJd(resume, { ...jd, education: null }, { now })
assert.equal(noEducation.categories.education, undefined)
assert.equal(noEducation.categories.skills.weight + noEducation.categories.experience.weight, 100)
assert.equal(result.score, Math.round(result.categories.skills.score * .6 + result.categories.experience.score * .4))
// Degree levels read whole words only: a diploma is not an M.A., and "to be completed" is not a B.E.
const educationScore = (degree, education = "Bachelor's degree in any discipline") => scoreResumeAgainstJd({ education: [{ degree }] }, { title: 'Personal Assistant', mustHave: [], niceToHave: [], education }).categories.education.score
assert.equal(educationScore('Diploma in Office Administration'), 50)
assert.equal(educationScore('Higher Secondary Certificate (HSC)'), 0)
assert.equal(educationScore('12th, to be completed'), 0)
for (const degree of ['BBA', 'B.Com', 'B.A. Psychology', 'B.E. Mechanical', 'BCA', 'Bachelor of Arts', 'MBA']) assert.equal(educationScore(degree), 100, degree)
assert.equal(educationScore('B.Com', 'Master’s degree'), 50)
assert.equal(educationScore('MBA', 'Master’s degree'), 100)
// Languages and custom sections are read: English listed only under Languages still meets an English must-have.
const languagesOnly = scoreResumeAgainstJd({ languages: ['English', 'Hindi'], customSections: [{ title: 'Volunteering', content: 'Event coordination for an NGO' }] }, { title: 'Personal Assistant', mustHave: ['English', 'Event coordination'], niceToHave: ['Hindi'] })
assert.deepEqual(languagesOnly.categories.skills.matched, ['English', 'Event coordination', 'Hindi'])
console.log('jdScoring: all checks passed')
