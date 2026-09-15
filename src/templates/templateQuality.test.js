import assert from 'node:assert/strict'
import test from 'node:test'
import { assessTemplateContent, estimateResumePages } from './templateQuality.js'

const stressResume = {
  fullName: 'Alexander Christopher Richardson-Worthington',
  email: 'alexander.christopher.richardson.worthington@very-long-example-domain.co.uk',
  phone: '+1 555 555 5555',
  location: 'San Francisco, California, United States',
  links: [{ url: 'https://www.linkedin.com/in/alexander-christopher-richardson-worthington' }, { url: 'https://github.com/alexander-christopher-richardson-worthington' }],
  summary: 'A long, evidence-led summary that represents a realistic senior candidate and exercises the density estimator.',
  experience: Array.from({ length: 5 }, (_, index) => ({
    role: `Senior Product Engineer ${index + 1}`,
    company: 'A Company With A Long Name',
    bullets: ['Built a durable cross-functional system with measurable customer impact and extensive documentation.', 'Partnered with multiple teams to deliver a reliable launch under a demanding timeline.']
  })),
  projects: Array.from({ length: 4 }, (_, index) => ({ name: `A long project name ${index + 1}`, bullets: ['A detailed project result with enough copy to make the layout work for its content.'] })),
  education: [{ degree: 'Bachelor of Science in Computer Science', institution: 'University of Technology', details: ['Honours and relevant coursework'] }],
  skills: { languages: ['JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'Go', 'Rust'], tools: ['React', 'Node.js', 'PostgreSQL', 'Kubernetes', 'Terraform', 'AWS', 'GraphQL'] },
  customSections: [{ title: 'Open Source', content: 'Maintainer of a public developer tool.' }]
}

const templateIds = ['azurill', 'bronzor', 'chikorita', 'ditgar', 'ditto', 'gengar', 'glalie', 'kakuna', 'lapras', 'leafish', 'meowth', 'onyx', 'pikachu', 'rhyhorn', 'scizor', 'classic-professional', 'harvard-traditional', 'modern-minimal', 'tech-focused', 'compact-ats', 'executive-brief', 'skills-first', 'career-transition', 'academic-standard', 'product-startup']

test('long, dense resumes are estimated as multi-page', () => {
  assert.ok(estimateResumePages(stressResume) > 1)
})

test('every registered template gets the common content safety assessment', () => {
  templateIds.forEach(id => {
    const report = assessTemplateContent({ template: { id, atsFriendly: id === 'compact-ats' }, resumeData: stressResume, presentation: {} })
    assert.ok(report.issues.some(issue => issue.code === 'long-name'), `${id} should assess long headers`)
    assert.ok(report.issues.some(issue => issue.code === 'long-contact'), `${id} should assess long contacts`)
    assert.ok(report.issues.some(issue => issue.code === 'multi-page'), `${id} should assess multi-page flow`)
    assert.ok(report.issues.some(issue => issue.code === 'custom-sections'), `${id} should retain custom sections`)
    assert.equal(report.stressScenarios.length, 5)
  })
})

test('sidebar auto-fixes are limited to presentation values', () => {
  const report = assessTemplateContent({ template: { id: 'azurill' }, resumeData: stressResume, presentation: {} })
  assert.ok(report.suggestedPresentation.sidebarWidth >= 36)
  assert.ok(report.suggestedPresentation.contactScale < 1)
  assert.deepEqual(Object.keys(report.suggestedPresentation).sort(), ['contactScale', 'nameScale', 'sidebarWidth'].sort())
})
