import assert from 'node:assert/strict'
import { validateNimbusTurn } from '../shared/nimbusPlan.js'
import { sourceTextOf } from '../shared/factGuard.js'

const resumeData = {
  fullName: 'Asha Rao', headline: '', email: 'a@b.co', phone: '', location: '', summary: 'Engineer.', links: [],
  skills: { languages: ['JavaScript'], frameworks: [], tools: [], databases: [], softSkills: [], other: [] },
  experience: [{ role: 'Intern', company: 'Acme', location: '', startDate: 'Jun 2024', endDate: 'Aug 2024', bullets: ['Cut load time by 40% with React'] }],
  projects: [], education: [], certifications: [], achievements: [], languages: [], customSections: []
}
const context = instruction => ({
  resumeData,
  sourceText: sourceTextOf(resumeData, instruction),
  elementIds: new Set(['resume.header.name', 'experience.e1.role']),
  fontIds: new Set(['inter', 'merriweather', 'playfair-display', 'lora']),
  bodyFontIds: new Set(['inter', 'merriweather', 'lora']),
  currentFontId: 'inter'
})
const throwsMatching = (fn, pattern) => assert.throws(fn, error => pattern.test(error.message))

// A valid multi-step edit.
const edit = validateNimbusTurn({ mode: 'edit', message: 'Done', steps: [
  { title: 'Bold job titles', operations: [{ type: 'set_element_style', target: 'group:job-titles', changes: { fontWeight: 700 } }] },
  { title: 'Bold 40%', operations: [{ type: 'apply_marks', path: 'experience.0.bullets.0', text: '40%', mark: 'b' }] },
  { title: 'Reword bullet', operations: [{ type: 'replace_bullets', section: 'experience', itemIndex: 0, values: ['Reduced load time 40% using React'] }] }
] }, context('improve'))
assert.equal(edit.steps.length, 3)

// Invented metric is rejected with an explanation the model can repair from.
throwsMatching(() => validateNimbusTurn({ mode: 'edit', steps: [{ title: 'x', operations: [{ type: 'replace_bullets', section: 'experience', itemIndex: 0, values: ['Cut load time by 70% for 1M users'] }] }] }, context('improve')), /70%/)
// ...but allowed when the user states it.
assert.ok(validateNimbusTurn({ mode: 'edit', steps: [{ title: 'x', operations: [{ type: 'append_bullets', section: 'experience', itemIndex: 0, values: ['Mentored 3 interns'] }] }] }, context('add that I mentored 3 interns')))
// Per-element size is not allowed; light text is rejected; unknown elements are rejected.
throwsMatching(() => validateNimbusTurn({ mode: 'edit', steps: [{ title: 'x', operations: [{ type: 'set_element_style', target: 'resume.header.name', changes: { fontSize: 30 } }] }] }, context('')), /use fontScale/)
throwsMatching(() => validateNimbusTurn({ mode: 'edit', steps: [{ title: 'x', operations: [{ type: 'set_resume_style', textColor: '#cccccc' }] }] }, context('')), /contrast/)
throwsMatching(() => validateNimbusTurn({ mode: 'edit', steps: [{ title: 'x', operations: [{ type: 'set_element_style', target: 'nope', changes: { color: '#111111' } }] }] }, context('')), /not on the resume/)
throwsMatching(() => validateNimbusTurn({ mode: 'edit', steps: [{ title: 'x', operations: [{ type: 'set_resume_style', baseSize: 8 }] }] }, context('')), /too small/)

// Options: catalogue fonts only, no current font, body fonts for the whole resume.
throwsMatching(() => validateNimbusTurn({ mode: 'options', message: 'Pick', options: { kind: 'font', target: 'resume', choices: [{ fontId: 'merriweather' }, { fontId: 'lora' }, { fontId: 'inter-x' }] } }, context('')), /not in the font catalogue/)
throwsMatching(() => validateNimbusTurn({ mode: 'options', message: 'Pick', options: { kind: 'font', target: 'resume', choices: [{ fontId: 'merriweather' }, { fontId: 'lora' }, { fontId: 'inter' }] } }, context('')), /already in use/)
throwsMatching(() => validateNimbusTurn({ mode: 'options', message: 'Pick', options: { kind: 'font', target: 'resume', choices: [{ fontId: 'merriweather' }, { fontId: 'lora' }, { fontId: 'playfair-display' }] } }, context('')), /display font/)
const colours = validateNimbusTurn({ mode: 'options', message: 'Pick', options: { kind: 'colour', target: 'headings', choices: [{ hex: '#1F3A5F', name: 'Navy' }, { hex: '#166534', name: 'Forest' }, { hex: '#7f1d1d', name: 'Burgundy' }] } }, context(''))
assert.equal(colours.options.choices[0].hex, '#1f3a5f')
throwsMatching(() => validateNimbusTurn({ mode: 'options', message: 'Pick', options: { kind: 'colour', target: 'text', choices: [{ hex: '#999999' }, { hex: '#111111' }, { hex: '#222222' }] } }, context('')), /too light/)
// Question keeps up to 4 quick replies.
assert.deepEqual(validateNimbusTurn({ mode: 'question', message: 'Which?', question: { text: 'Which job?', quickReplies: ['A', 'B', 'C', 'D', 'E'] } }, context('')).question.quickReplies, ['A', 'B', 'C', 'D'])
console.log('nimbusPlan: all checks passed')
