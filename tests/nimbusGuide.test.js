// PLAN-034: suggestion lists, new resume operations, removal limits, page layout, local checks, per-item undo,
// greeting and typing speed.
import assert from 'node:assert/strict'
import { validateNimbusTurn } from '../shared/nimbusPlan.js'
import { sourceTextOf } from '../shared/factGuard.js'
import { StaleOperationError, applyPresentationOperations, applyResumeOperations, textMatches } from '../shared/nimbusResumeOps.js'
import { layoutStyle, mergeLayout, normalizeLayout } from '../shared/resumeLayout.js'
import { formatResumeDate, lintResume, parseResumeDate, scoreResume } from '../shared/resumeLint.js'
import { applyNimbusOperations } from '../src/nimbus/applyNimbusOperations.js'
import { conversationText, initialItemStatus, isUndoRequest } from '../src/nimbus/nimbusItems.js'
import { firstNameFor, greetingFor } from '../src/nimbus/greeting.js'
import { typedLength } from '../src/nimbus/useTypewriter.js'
import { keepToRequest, promptBlocksFor, systemPromptFor } from '../server/nimbus/nimbusEngine.js'

const resumeData = {
  fullName: 'Asha Rao', headline: 'Engineer', email: 'a@b.co', phone: '', location: '', summary: 'Engineer who builds web apps.', links: [{ label: 'GitHub', url: 'https://github.com/asha' }],
  skills: { languages: ['JavaScript', 'Python'], frameworks: ['React'], tools: ['Git', 'git'], databases: [], softSkills: ['Hard-working'], other: [] },
  experience: [
    { role: 'Developer', company: 'Acme', startDate: 'Jan 2022', endDate: '03/2023', bullets: ['Develop the support dashboard for 30 agents', 'Responsible for API caching', 'Wrote unit tests for the billing service'] },
    { role: 'Intern', company: 'Beta', startDate: 'Jun 2021', endDate: 'Aug 2021', bullets: ['Built internal tools', 'Fixed bugs'] }
  ],
  projects: [{ name: 'Portfolio', description: 'Personal site', bullets: ['Designed a responsive site'] }],
  education: [{ degree: 'B.Tech', institution: 'IIT', details: [] }, { degree: 'Class XII', institution: 'City School', details: [] }],
  certifications: ['AWS Cloud Practitioner'], achievements: ['Won a hackathon'], languages: ['English'], customSections: []
}
const context = (instruction = 'improve', extra = {}) => ({
  resumeData, sourceText: sourceTextOf(resumeData, instruction), elementIds: new Set(), fontIds: new Set(['inter']), bodyFontIds: new Set(['inter']), currentFontId: 'inter', sections: {}, plan: 'pro', ...extra
})
const throwsMatching = (fn, pattern) => assert.throws(fn, error => pattern.test(error.message), `expected ${pattern}`)

// ---- suggest mode ----
const suggest = validateNimbusTurn({ mode: 'suggest', message: 'Three changes.', items: [
  { title: 'Lead with your dashboard', why: 'Strongest result.', kind: 'reorder', impact: 'high', operations: [{ type: 'move_item', section: 'experience', itemIndex: 1, toIndex: 0, expect: 'Intern' }] },
  { title: 'Deepen your summary', instruction: 'Deepen my summary.' },
  { title: 'Add a number', question: { text: 'How many users?', quickReplies: ['100', '1,000'] } },
  { title: 'Tailor to the job', pro: true, instruction: 'Tailor it.' }
] }, context())
assert.equal(suggest.mode, 'suggest')
assert.deepEqual(suggest.items.map(initialItemStatus), ['ready', 'deferred', 'info', 'deferred'])
// Free accounts see Pro items locked, with no action attached.
const free = validateNimbusTurn({ mode: 'suggest', message: 'x', items: [{ title: 'Tailor', pro: true, instruction: 'Tailor it.' }, { title: 'Deepen', instruction: 'Deepen.' }] }, context('x', { plan: 'free' }))
assert.equal(free.items[0].locked, true)
assert.equal(free.items[0].instruction, undefined)
// An item needs exactly one action.
throwsMatching(() => validateNimbusTurn({ mode: 'suggest', message: 'x', items: [{ title: 'Both', instruction: 'a', question: 'b' }] }, context()), /exactly one/)
// One bad ready item becomes deferred; most items bad → the model must repair.
const mixed = validateNimbusTurn({ mode: 'suggest', message: 'x', items: [
  { title: 'Good', operations: [{ type: 'remove_skill', category: 'tools', value: 'git' }] },
  { title: 'Bad expect', operations: [{ type: 'remove_bullet', section: 'experience', itemIndex: 0, bulletIndex: 1, expect: 'Something else entirely here' }] },
  { title: 'Good too', operations: [{ type: 'hide_section', section: 'languages' }] }
] }, context())
assert.equal(mixed.items[1].operations, undefined)
assert.match(mixed.items[1].instruction, /Bad expect/)
throwsMatching(() => validateNimbusTurn({ mode: 'suggest', message: 'x', items: [
  { title: 'A', operations: [{ type: 'remove_item', section: 'projects', itemIndex: 0, expect: 'Portfolio' }] },
  { title: 'B', operations: [{ type: 'set_bullet', section: 'experience', itemIndex: 9, bulletIndex: 0, expect: 'x', value: 'y' }] }
] }, context()), /only projects entry|no experience entry/)
// Suggestion lists and new operations stay out of content-only turns (letters, job fixes).
throwsMatching(() => validateNimbusTurn({ mode: 'suggest', message: 'x', items: [{ title: 'A', instruction: 'b' }] }, context('x', { contentOnly: true })), /not available/)
throwsMatching(() => validateNimbusTurn({ mode: 'edit', message: 'x', steps: [{ title: 'Hide', operations: [{ type: 'hide_section', section: 'skills' }] }] }, context('x', { contentOnly: true })), /not available/)

// ---- new operations: validation ----
throwsMatching(() => validateNimbusTurn({ mode: 'edit', message: 'x', steps: [{ title: 'Remove', operations: [{ type: 'remove_bullet', section: 'projects', itemIndex: 0, bulletIndex: 0, expect: 'Designed a responsive site' }] }] }, context()), /only bullet/)
throwsMatching(() => validateNimbusTurn({ mode: 'edit', message: 'x', steps: [{ title: 'Rewrite', operations: [{ type: 'set_bullet', section: 'experience', itemIndex: 0, bulletIndex: 0, expect: 'Develop the support dashboard', value: 'Built a dashboard used by 900 agents' }] }] }, context()), /900/)
throwsMatching(() => validateNimbusTurn({ mode: 'edit', message: 'x', steps: [{ title: 'Layout', operations: [{ type: 'set_layout', sectionGap: 3 }] }] }, context()), /between/)
// Removal limits: no more than 40% of bullets in one turn.
throwsMatching(() => validateNimbusTurn({ mode: 'edit', message: 'x', steps: [{ title: 'Cut', operations: [
  { type: 'remove_bullet', section: 'experience', itemIndex: 0, bulletIndex: 0, expect: 'Develop the support dashboard for 30 agents' },
  { type: 'remove_bullet', section: 'experience', itemIndex: 0, bulletIndex: 1, expect: 'Responsible for API caching' },
  { type: 'remove_bullet', section: 'experience', itemIndex: 1, bulletIndex: 0, expect: 'Built internal tools' }
] }] }, context()), /too many bullets/)
const edit = validateNimbusTurn({ mode: 'edit', message: 'Done.', steps: [
  { title: 'Make it spacious', operations: [{ type: 'set_layout', density: 'spacious' }] },
  { title: 'Rename experience', operations: [{ type: 'rename_section', section: 'experience', title: 'Work history' }] }
], items: [{ title: 'Class XII adds little next to a degree', kind: 'remove', operations: [{ type: 'remove_item', section: 'education', itemIndex: 1, expect: 'Class XII' }] }] }, context())
assert.equal(edit.steps.length, 2)
assert.equal(edit.items, undefined, 'suggesting to remove a school entry is filtered out')
// The user's review (2026-11-26): only the WhatsApp duplicate is a legitimate removal; school entries,
// extracurriculars, whole sections and a real skill (Gemini API) are never suggested for removal.
const withLinks = { ...resumeData, phone: '+91 98765 43210', links: [{ label: 'WhatsApp', url: 'https://wa.me/919876543210' }], skills: { ...resumeData.skills, tools: ['Git', 'Gemini LLM API'] } }
const review = validateNimbusTurn({ mode: 'suggest', message: 'A few things.', items: [
  { title: 'WhatsApp link repeats your phone number', kind: 'remove', operations: [{ type: 'remove_link', linkIndex: 0, expect: 'https://wa.me/919876543210' }] },
  { title: 'High-school entries add little', kind: 'remove', operations: [{ type: 'remove_item', section: 'education', itemIndex: 1, expect: 'Class XII' }] },
  { title: 'Extracurriculars repeat other sections', kind: 'remove', instruction: 'Delete the extra-curricular activities section.' },
  { title: 'Achievements section is long', kind: 'remove', operations: [{ type: 'hide_section', section: 'achievements' }] },
  { title: 'Gemini LLM API is project-specific', kind: 'remove', operations: [{ type: 'remove_skill', category: 'tools', value: 'Gemini LLM API' }] }
] }, { ...context(), resumeData: withLinks, sourceText: sourceTextOf(withLinks, 'x') })
assert.deepEqual(review.items.map(item => item.title), ['WhatsApp link repeats your phone number'])
throwsMatching(() => validateNimbusTurn({ mode: 'suggest', message: 'x', items: [{ title: 'School', operations: [{ type: 'remove_item', section: 'education', itemIndex: 1, expect: 'Class XII' }] }] }, context()), /education entries of any level/)

// ---- new operations: applying ----
assert.ok(textMatches('Responsible for API caching.', 'responsible for api caching'))
assert.ok(!textMatches('Fixed bugs', 'Built internal tools'))
// Removals find their target by text even after an earlier removal shifted the indexes.
const afterRemovals = applyResumeOperations(resumeData, [
  { type: 'remove_item', section: 'experience', itemIndex: 0, expect: 'Developer' },
  { type: 'remove_bullet', section: 'experience', itemIndex: 1, bulletIndex: 1, expect: 'Fixed bugs' }
])
assert.deepEqual(afterRemovals.experience.map(item => item.role), ['Intern'])
assert.deepEqual(afterRemovals.experience[0].bullets, ['Built internal tools'])
assert.equal(resumeData.experience.length, 2, 'the input is not mutated')
assert.throws(() => applyResumeOperations(resumeData, [{ type: 'set_bullet', section: 'experience', itemIndex: 0, bulletIndex: 0, expect: 'Text that is not on the resume', value: 'x' }]), StaleOperationError)
const moved = applyResumeOperations(resumeData, [{ type: 'move_item', section: 'experience', itemIndex: 1, toIndex: 0, expect: 'Intern at Beta' }])
assert.deepEqual(moved.experience.map(item => item.role), ['Intern', 'Developer'])
const presentation = applyPresentationOperations({ accentColor: '#123456' }, [
  { type: 'hide_section', section: 'languages' }, { type: 'rename_section', section: 'experience', title: 'Work history' }, { type: 'set_layout', density: 'compact' }
])
assert.deepEqual(presentation.sections, { hidden: { languages: true }, titles: { experience: 'Work history' } })
assert.equal(presentation.layout.density, 'compact')
assert.equal(presentation.accentColor, '#123456')
assert.equal(applyPresentationOperations(presentation, [{ type: 'show_section', section: 'languages' }, { type: 'set_layout', density: 'standard' }]).layout, undefined)
// The client applier routes each kind to the right place and reports the presentation change.
const applied = applyNimbusOperations({ resumeData, presentation: {} }, [{ type: 'remove_skill', category: 'tools', value: 'git' }, { type: 'hide_section', section: 'skills' }])
assert.deepEqual(applied.resumeData.skills.tools, ['Git'])
assert.equal(applied.presentationChanged, true)
assert.equal(applied.changed, true)

// ---- layout ----
assert.deepEqual(normalizeLayout({ density: 'standard' }), {})
assert.deepEqual(normalizeLayout({ sectionGap: 9 }), { density: 'custom', sectionGap: 1.6, itemGap: 1, pageMargin: 1 })
assert.equal(mergeLayout({ density: 'spacious' }, { pageMargin: 1 }).density, 'custom')
assert.deepEqual(layoutStyle({}), {})
assert.equal(layoutStyle({ density: 'spacious' })['--rt-section-gap'], 1.35)

// ---- local checks ----
assert.deepEqual(parseResumeDate('Sept 2023'), { style: 'Mon YYYY', month: 9, year: 2023 })
assert.equal(formatResumeDate({ month: 3, year: 2023 }, 'Mon YYYY'), 'Mar 2023')
const findings = lintResume(resumeData)
const byId = Object.fromEntries(findings.map(finding => [finding.id, finding]))
assert.ok(byId['dates-format'].operations.some(op => op.field === 'endDate' && op.value === 'Mar 2023'))
assert.deepEqual(byId['tense-0'].operations.map(op => op.value), ['Developed the support dashboard for 30 agents'])
assert.ok(byId['weak-openers'].instruction.includes('Responsible for API caching'))
assert.deepEqual(byId['duplicate-skills'].operations, [{ type: 'remove_skill', category: 'tools', value: 'git' }])
assert.equal(findings[0].impact, 'high', 'most important first')
// Every deterministic fix applies cleanly to the resume it was found on.
for (const finding of findings.filter(item => item.operations && item.id !== 'one-page')) applyNimbusOperations({ resumeData }, finding.operations)
const fixed = findings.filter(item => item.operations).reduce((resume, finding) => applyNimbusOperations({ resume, resumeData: resume }, finding.operations).resumeData, resumeData)
assert.ok(scoreResume(fixed).score > scoreResume(resumeData).score, 'fixes raise the score')

// ---- typed undo (no undo buttons in the chat) ----
for (const phrase of ['undo', 'Undo that', 'revert', 'undo the last change', 'please undo', 'take that back!', 'go back', 'undo what you just did']) assert.ok(isUndoRequest(phrase), phrase)
for (const phrase of ['undo the bold but keep the summary', 'revert my summary to the old one and add Python', 'make it bold', '']) assert.ok(!isUndoRequest(phrase), phrase)

// ---- partial steps: one bad part of a multi-part request doesn't sink the others ----
const partial = validateNimbusTurn({ mode: 'edit', message: 'Done.', steps: [
  { title: 'Bigger name', operations: [{ type: 'set_element_style', target: 'group:name', changes: { fontSize: 30 } }] },
  { title: 'Rename summary', operations: [{ type: 'rename_section', section: 'summary', title: 'About Me' }] },
  'deepen the summary',
  { type: 'set_layout', density: 'spacious' }
] }, context())
assert.deepEqual(partial.steps.map(step => step.title), ['Rename summary', 'Change'])
assert.deepEqual(partial.skipped.map(step => step.title), ['Bigger name'])
assert.match(partial.skipped[0].reason, /fontScale/)
throwsMatching(() => validateNimbusTurn({ mode: 'edit', message: 'x', steps: [{ title: 'Bad', operations: [{ type: 'set_element_style', target: 'group:name', changes: { fontSize: 30 } }] }] }, context()), /fontScale/)
// "Make my name bigger": one element's size, relative to the template.
const bigger = validateNimbusTurn({ mode: 'edit', message: 'Done.', steps: [{ title: 'Bigger name', operations: [{ type: 'set_element_style', target: 'group:name', changes: { fontScale: 1.25 } }] }] }, context('make my name bigger', { elementIds: new Set(['resume.header.name']) }))
assert.equal(bigger.steps[0].operations[0].changes.fontScale, 1.25)
throwsMatching(() => validateNimbusTurn({ mode: 'edit', message: 'x', steps: [{ title: 'Huge', operations: [{ type: 'set_element_style', target: 'group:name', changes: { fontScale: 3 } }] }] }, context()), /0\.7 and 1\.6/)
// An "options" reply carrying steps (kind "layout") is treated as the edit it is.
assert.equal(validateNimbusTurn({ mode: 'options', message: 'More room.', options: { kind: 'layout' }, steps: [{ title: 'Space', operations: [{ type: 'set_layout', density: 'spacious' }] }] }, context()).mode, 'edit')
assert.equal(conversationText({ text: 'Two ideas.', items: [{ title: 'One', status: 'applied' }, { title: 'Two' }] }), 'Two ideas.\n1. One (applied)\n2. Two')

// ---- greeting, typing, prompt blocks ----
assert.equal(greetingFor({ displayName: 'vanshdeep singh' }), 'Hey, Vanshdeep, what do you want done?')
assert.equal(greetingFor({ displayName: 'user_123@mail', resumeName: 'Asha Rao' }), 'Hey, Asha, what do you want done?')
assert.equal(greetingFor({}), 'Hey, what do you want done?')
assert.equal(firstNameFor({ displayName: '  ' }), '')
assert.equal(typedLength(500, 0), 0)
assert.ok(typedLength(500, 1000) >= 480, 'about 480 characters a second')
assert.equal(typedLength(10, 5000), 10)
assert.deepEqual(promptBlocksFor('what would make my resume stand out, give me changes'), { suggest: true, design: false })
assert.deepEqual(promptBlocksFor('this resume feels crowded, make it spacious'), { suggest: false, design: true })
assert.deepEqual(promptBlocksFor('deepen my summary'), { suggest: false, design: false })
assert.ok(systemPromptFor('make it spacious').includes('set_layout'))
assert.ok(!systemPromptFor('deepen my summary').includes('REVIEW GUIDE'))
assert.ok(systemPromptFor('x', { feature: 'tone', tone: 'Concise' }).includes('"Concise" tone'))

// Scope guard: "make it spacious" must not also change the font or text colour.
const spacious = keepToRequest({ mode: 'edit', steps: [{ title: 'Room', operations: [{ type: 'set_layout', density: 'spacious' }, { type: 'set_resume_style', fontId: 'inter', textColor: '#1f2937', baseSize: 13.5, lineHeight: 1.5 }] }, { title: 'Bold name', operations: [{ type: 'set_element_style', target: 'group:name', changes: { color: '#000000' } }] }] }, 'this resume feels crowded, make it spacious')
assert.deepEqual(spacious.steps.map(step => step.operations), [[{ type: 'set_layout', density: 'spacious' }, { type: 'set_resume_style', baseSize: 13.5, lineHeight: 1.5 }]])
assert.equal(keepToRequest({ mode: 'edit', steps: [{ title: 'Navy', operations: [{ type: 'set_element_style', target: 'group:headings', changes: { color: '#1e3a5f' } }] }] }, 'make the headings navy').steps[0].operations[0].changes.color, '#1e3a5f')
// Renaming the summary heading must never wipe the summary text.
const longSummary = { ...resumeData, summary: 'Full stack developer who ships product features end to end, from data model to polished UI, across React and Node.' }
throwsMatching(() => validateNimbusTurn({ mode: 'edit', message: 'x', steps: [{ title: 'Rename', operations: [{ type: 'set_field', target: 'summary', value: 'About Me' }] }] }, { ...context(), resumeData: longSummary, sourceText: sourceTextOf(longSummary, 'About Me') }), /rename_section/)

console.log('nimbusGuide: all checks passed')
