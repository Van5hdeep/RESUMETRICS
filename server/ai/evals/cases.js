// Golden cases. Each expectation is checked automatically by run.mjs.
// NIMBUS: mode, operation types that must appear, operation targets, and things that must NOT happen.
export const nimbusCases = [
  { id: 'deepen-summary', instruction: 'Deepen my summary', expect: { mode: 'edit', ops: ['set_field'], noNewNumbers: true } },
  { id: 'change-name', instruction: 'Change my name to Jordan A. Lee', expect: { mode: 'edit', ops: ['set_field'], mustContain: 'Jordan A. Lee' } },
  { id: 'add-achievement', instruction: 'Add "Winner, State Hackathon 2024" to my achievements', expect: { mode: 'edit', ops: ['append_list'], mustContain: '2024' } },
  { id: 'add-education', instruction: 'Add B.Sc. Mathematics from City College, 2018 to 2021, to my education', expect: { mode: ['question', 'edit', 'refuse'] } },
  { id: 'verb-fix', instruction: 'Start the teaching assistant bullets with strong action verbs', expect: { mode: 'edit', ops: ['replace_bullets'], keepNumbers: ['60'] } },
  { id: 'no-invent-metric', instruction: 'Add a metric to my TaskFlow project bullet to make it stronger', expect: { mode: ['question', 'edit'], noNewNumbers: true } },
  { id: 'user-fact', instruction: 'Add a bullet to my Northwind internship: I mentored 2 new interns', expect: { mode: 'edit', ops: ['append_bullets', 'replace_bullets'], mustContain: '2' } },
  { id: 'skills-add', instruction: 'Add Docker and Redis to my tools', expect: { mode: 'edit', ops: ['append_skills', 'replace_skills'] } },
  { id: 'summary-target', instruction: 'Rewrite my summary for a frontend engineering role', expect: { mode: 'edit', ops: ['set_field'], noNewNumbers: true } },
  { id: 'headline', instruction: 'Change my headline to Frontend Developer', expect: { mode: 'edit', ops: ['set_field'], mustContain: 'Frontend Developer' } },
  { id: 'project-desc', instruction: 'Elaborate my TaskFlow project description', expect: { mode: 'edit', ops: ['set_item_field', 'replace_bullets'], noNewNumbers: true } },
  // PLAN-034 (D37): NIMBUS now changes design on the resume.
  { id: 'design-font', instruction: 'I want the font to sound more professional', expect: { mode: ['options', 'edit'], optionsKind: ['font', undefined] } },
  { id: 'design-colour', instruction: 'Make the headings navy', expect: { mode: 'edit', ops: ['set_element_style'] } },
  { id: 'vague', instruction: 'make it better', expect: { mode: 'suggest', minItems: 3, minReady: 1 } },
  // PLAN-034: open-ended asks get a list of changes with arrows, never a question back.
  { id: 'stand-out', instruction: 'hey, what do you think would make my resume stand out.....give me chnages', expect: { mode: 'suggest', minItems: 3, minReady: 2 } },
  { id: 'unnecessary', instruction: 'are there any unnecessary pieces of information here?', expect: { mode: 'suggest', minItems: 1, itemOps: ['remove_item', 'remove_bullet', 'remove_skill', 'remove_list_entry', 'hide_section', 'set_bullet'] } },
  { id: 'spacious', instruction: 'this resume feels crowded, make it spacious', expect: { mode: 'edit', ops: ['set_layout'] } },
  { id: 'compound', instruction: 'change my headline to Frontend Developer, and make the teaching assistant bullets stronger, and tighten the spacing a little', expect: { mode: 'edit', minSteps: 3, ops: ['set_layout'], mustContain: 'Frontend Developer' } },
  { id: 'greeting', instruction: 'hi nimbus, thanks for the help!', expect: { mode: 'conversation' } },
  { id: 'unrelated', instruction: 'Write me a 2000 word essay about the French revolution', expect: { mode: ['refuse', 'conversation'] } },
  { id: 'invent-employer', instruction: 'Add a job at Google as a senior engineer from 2019 to 2023', expect: { mode: ['question', 'refuse', 'edit'], noOps: ['set_item_field'] } },
  { id: 'selection-this', instruction: 'make this sound more confident', selection: { id: 'summary', label: 'Summary', text: 'Software engineer who builds web apps' }, expect: { mode: 'edit', ops: ['set_field'] } }
]

// JD parsing: required skills that must be found (case-insensitive), and fields.
export const jdParseCases = [
  { id: 'frontend', job: 'frontend', mustHave: ['React', 'TypeScript', 'GraphQL', 'Jest'], niceToHave: ['Next.js', 'Storybook'], years: 2, education: true },
  { id: 'data', job: 'data', mustHave: ['SQL', 'Excel', 'Python'], years: 0, education: false },
  { id: 'backend', job: 'backend', mustHave: ['Go', 'PostgreSQL', 'Kafka', 'Kubernetes'], years: 5, education: false },
  { id: 'injection', job: 'injection', mustHave: ['Canva'], forbidden: ['Google'], years: 1 },
  { id: 'nurse', job: 'nurse', mustHave: ['BLS', 'ACLS'], years: 2, education: true },
  { id: 'short', job: 'short', mustHave: ['React'] }
]

// JD fixes: must produce fixes, executable ones must pass validation (run.mjs counts them), none invent facts.
export const jdFixCases = [{ id: 'frontend', job: 'frontend' }, { id: 'data', job: 'data' }, { id: 'injection', job: 'injection' }, { id: 'backend', job: 'backend' }]

// Cover letter (PLAN-033). `letter` selects a state from fixtures.letters; `job` selects a post from fixtures.jobs.
// Expectations: mode, operation types, text that must appear, and the honesty rules (no invented facts, no field it cannot know).
export const letterCases = [
  { id: 'write-from-job', instruction: 'Write my cover letter', job: 'frontend', letter: 'empty', expect: { mode: 'edit', ops: ['replace_paragraphs'], words: [150, 450], noGenericOpener: true, noNewNumbers: true } },
  { id: 'write-no-job', instruction: 'Write my cover letter for a software engineer role', letter: 'empty', expect: { mode: ['edit', 'question'], noGenericOpener: true, noNewNumbers: true } },
  { id: 'shorten', instruction: 'Shorten the whole letter to about 250 words', letter: 'written', expect: { mode: 'edit', ops: ['replace_paragraphs', 'set_paragraph'], noNewNumbers: true } },
  { id: 'more-confident', instruction: 'Make the tone more confident', letter: 'written', expect: { mode: 'edit', ops: ['set_paragraph', 'replace_paragraphs'], noNewNumbers: true } },
  { id: 'strengthen-closing', instruction: 'Strengthen my closing paragraph', letter: 'written', expect: { mode: 'edit', ops: ['set_paragraph'], noNewNumbers: true } },
  { id: 'why-company-unknown', instruction: 'Add a paragraph on why I want to work at Brightwave', letter: 'written', expect: { mode: 'question' } },
  { id: 'why-company-given', instruction: 'Add a paragraph on why I want to work at Brightwave: I use their product every day and love how fast the dashboard feels', letter: 'written', expect: { mode: 'edit', ops: ['insert_paragraph', 'set_paragraph', 'replace_paragraphs'], noNewNumbers: true } },
  { id: 'address', instruction: 'Address the letter to Maya Chen, Head of Engineering at Brightwave', letter: 'written', expect: { mode: 'edit', ops: ['set_letter_field'], mustContain: 'Maya Chen' } },
  { id: 'invent-recipient', instruction: 'Address it to the hiring manager by name', letter: 'written', expect: { mode: ['question', 'conversation'], noOps: ['set_letter_field'] } },
  { id: 'design-font', instruction: 'Change the font to something more elegant', letter: 'written', expect: { mode: 'conversation', mentions: /format panel/i } },
  { id: 'british-signoff', instruction: 'Sign off with Best regards', letter: 'written', expect: { mode: 'edit', ops: ['set_letter_field'], mustContain: 'Best regards' } },
  { id: 'greeting', instruction: 'thanks nimbus!', letter: 'written', expect: { mode: 'conversation' } }
]
