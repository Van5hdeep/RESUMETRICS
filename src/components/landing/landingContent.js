// Words and pictures for the landing page. Every claim describes something the app really does; numbers come from the
// code (template registry, font catalogue, job boards, GitHub scan cap) so keep them in step when those change.

export const stats = [
  { value: 24, suffix: '', label: 'resume templates' },
  { value: 131, suffix: '', label: 'fonts' },
  { value: 8, suffix: '+', label: 'job boards searched' },
  { value: 25, suffix: '', label: 'repos read for proof' },
  { value: 0, suffix: '', label: 'invented facts' }
]

export const nimbusPowers = [
  ['Writes from your facts', 'Every edit is checked against your resume before it lands. If a new number, employer, date or skill appears that you never gave, the change is refused, so nothing on your page is invented.'],
  ['Knows what you selected', 'Click a bullet, a section or a single line and ask. NIMBUS works on exactly that part of the page and leaves the rest of your resume untouched.'],
  ['Shows its plan', 'Bigger requests, like adding a section or rewriting for a role, are split into steps. You watch each one land on the page and can stop whenever you like.'],
  ['Asks when it is unsure', 'If a request could mean two things, NIMBUS offers choices or asks one short question instead of guessing, so you get the version you meant.'],
  ['Changes you apply with one press', 'Ask what would make your resume stand out, or what could go. NIMBUS answers with a list of changes, each with an arrow: hover to preview it on the page, press to apply it, undo any one of them later.'],
  ['Also writes your letters', 'The same assistant drafts and tightens cover letters from your resume and the job post, using only what your resume says about you.']
]

// Real screens from the app (scripts/landing-shots/capture.mjs), in the order someone meets them.
const shot = name => `/landing/shots/${name}.webp`
export const screens = [
  { id: 'dashboard', name: 'Dashboard', path: 'dashboard', src: shot('dashboard'), alt: 'The dashboard with resume progress and saved projects' },
  { id: 'start', name: 'Start a resume', path: 'workspace', src: shot('start'), alt: 'Options to upload a resume, start from scratch or import from LinkedIn' },
  { id: 'editor', name: 'Editor', path: 'workspace/editor', src: shot('editor'), alt: 'The editor with NIMBUS, the resume page and the format panel' },
  { id: 'nimbus-editor', name: 'NIMBUS', path: 'workspace/editor', src: shot('nimbus'), alt: 'NIMBUS after rewriting the summary on request' },
  { id: 'tailor', name: 'Job tailoring', path: 'workspace/tailor', src: shot('tailor'), alt: 'Job tailoring with a match score, missing keywords and the resume beside the job post' },
  { id: 'letter', name: 'Cover letters', path: 'workspace/letter', src: shot('letter'), alt: 'A cover letter written by NIMBUS in the resume design' },
  { id: 'evidence', name: 'Evidence check', path: 'workspace/evidence', src: shot('evidence'), alt: 'The GitHub evidence report with each skill beside its share of code' },
  { id: 'jobs', name: 'Job tracker', path: 'jobs', src: shot('jobs-matches'), alt: 'The job tracker with the best matches, salaries and locations' },
  { id: 'applications', name: 'Applications', path: 'jobs', src: shot('jobs-board'), alt: 'The applications board from saved to offer' },
  { id: 'templates-page', name: 'Templates', path: 'templates', src: shot('templates'), alt: 'The template gallery' }
]

export const advantages = ['Never invents facts', 'Proof from your code', 'One-click job fixes', 'Jobs that fit you', '24 real templates', 'Private by default', 'Priced in rupees', 'Nothing gets lost']

// The HR portal (/hr), in plain words for the "For hiring teams" section.
export const hiringPoints = [
  ['Score every resume', 'Each resume gets a score out of 100 for skills, experience, education and keywords from your job post.'],
  ['Compare at a glance', 'A chart and a ranked list show your strongest candidates first.'],
  ['Shortlist and export', 'Shortlist or reject in a click, hide names for fair screening, and download the shortlist.']
]

export const nav = [['NIMBUS', '#nimbus'], ['Inside the app', '#inside'], ['For hiring', '#hiring']]
