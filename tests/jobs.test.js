import assert from 'node:assert/strict'
import express from 'express'
import { buildSearchProfile, experienceFit, formatPay, jobIdentity, platformOf, relatedRoles, roleFromResume, scoreJob, titleFit } from '../shared/jobMatch.js'
import { COMPANY_FEEDS, GREENHOUSE_DETAILS, discoverCompanies, placeFits, readFeed, roleFit, searchCompanyFeeds } from '../server/jobs/companyFeeds.js'
import { boardListingUrl, estimateSalary, linkedOnPage, normalizeJSearchJob, normalizeListingJob, normalizeTavilyResult, postingFromSlug, postingFromTitle, readBoardListing, searchJSearch, searchTavily } from '../server/jobs/sources.js'
import { WEB_BOARDS, boardKeyOf, buildRows, cacheKeyOf, createJobSearch, extraQueries, mergeBoardRow, salaryFor, uniqueJobs } from '../server/jobs/jobSearch.js'
import { scrapeJson } from '../server/integrations/contextDev.js'
import { createJobStore, jobKeyOf, validateSavedJob } from '../server/db/jobStore.js'
import { createResumeStore } from '../server/db/resumeStore.js'
import { createRequirePro } from '../server/middleware/requirePro.js'
import { createJobsRouter } from '../server/routes/jobs.routes.js'
import { createFakeFirestore } from './helpers/fakeFirestore.js'

const resume = {
  fullName: 'Ada Lovelace', email: 'ada@example.com', location: 'Bengaluru, Karnataka', headline: 'Frontend Developer | React, TypeScript',
  skills: { core: ['React', 'TypeScript', 'Node.js', 'CSS'] },
  experience: [{ role: 'Frontend Engineer', company: 'Acme', startDate: 'Jan 2023', endDate: 'Jan 2025', bullets: ['Built a React app'] }]
}

// Search profile: role from the headline, city from the location, skills from the resume, never contact details.
const profile = buildSearchProfile(resume, {}, new Date('2026-10-14'))
assert.equal(profile.role, 'Frontend Developer')
assert.equal(profile.location, 'Bengaluru')
assert.equal(profile.datePosted, 'month')
assert.equal(profile.remote, false)
assert.ok(profile.skills.includes('React') && profile.skills.includes('TypeScript'))
assert.equal(profile.level, 'Junior')
assert.ok(!JSON.stringify(profile).includes('ada@example.com'))
assert.equal(buildSearchProfile(resume, { role: '  Data Analyst ', location: 'Pune', remote: true, datePosted: 'week' }).role, 'Data Analyst')
assert.equal(buildSearchProfile(resume, { datePosted: 'yesterday' }).datePosted, 'month')
assert.equal(roleFromResume({ experience: [{ role: 'QA Engineer' }] }), 'QA Engineer')
assert.equal(roleFromResume({}), 'Software Developer')
assert.equal(buildSearchProfile({ location: 'Remote' }).location, 'India')

// Platforms
assert.equal(platformOf('LinkedIn', 'https://www.linkedin.com/jobs/view/1'), 'linkedin')
assert.equal(platformOf('', 'https://www.naukri.com/job-listings-x-123456'), 'naukri')
assert.equal(platformOf('Foundit', 'https://foundit.in/x'), 'foundit')
assert.equal(platformOf('Acme Careers', 'https://careers.acme.com/1', { direct: true }), 'company')
assert.equal(platformOf('Jobrapido.com', 'https://in.jobrapido.com/1'), 'other')

// Scoring
assert.equal(titleFit('Frontend Developer', 'Senior Frontend Developer (React)'), 1)
assert.equal(titleFit('Frontend Developer', 'Backend Engineer'), 0)
assert.equal(experienceFit(2, 'Requires 2-4 years of experience'), 1)
assert.equal(experienceFit(0, 'Minimum 6+ years'), 0)
assert.equal(experienceFit(3, 'No experience mentioned'), .7)
const strong = scoreJob(profile, { title: 'Frontend Developer', description: 'Build UIs with React, TypeScript and CSS. 1-3 years.' })
const weak = scoreJob(profile, { title: 'Java Backend Engineer', description: 'Spring, Java, Kafka, Kubernetes. 6+ years.' })
assert.ok(strong.score >= 80, `strong match scored ${strong.score}`)
assert.ok(weak.score < 30, `weak match scored ${weak.score}`)
assert.ok(strong.matched.includes('React'))
assert.ok(weak.missing.includes('Java') && weak.missing.includes('Kubernetes'))

// JSearch postings: one apply link per board, the main link included, unsafe links dropped.
const raw = {
  job_id: 'abc==', job_title: 'Frontend Developer', employer_name: 'Acme', employer_logo: 'https://logo/acme.png', job_publisher: 'LinkedIn',
  job_apply_link: 'https://www.linkedin.com/jobs/view/1', job_apply_is_direct: false, job_city: 'Bengaluru', job_state: 'Karnataka',
  job_is_remote: false, job_employment_type: 'Full–time', job_posted_at_datetime_utc: '2026-10-12T00:00:00.000Z',
  job_description: 'React and TypeScript.', job_highlights: { Qualifications: ['2+ years of React'] },
  apply_options: [
    { publisher: 'LinkedIn', apply_link: 'https://www.linkedin.com/jobs/view/1', is_direct: false },
    { publisher: 'Naukri.com', apply_link: 'https://www.naukri.com/job-listings-frontend-acme-1234567', is_direct: false },
    { publisher: 'Acme', apply_link: 'https://careers.acme.com/1', is_direct: true },
    { publisher: 'Evil', apply_link: 'javascript:alert(1)' }
  ]
}
const job = normalizeJSearchJob(raw)
assert.deepEqual(job.applyOptions.map(option => option.platform), ['linkedin', 'naukri', 'company'])
assert.equal(job.location, 'Bengaluru, Karnataka')
assert.equal(job.type, 'Full-time')
assert.equal(job.qualifications, '2+ years of React')

// Posted pay in rupees is formatted; no pay means none.
assert.equal(job.pay, null)
const paid = normalizeJSearchJob({ ...raw, job_country: 'IN', job_min_salary: 600000, job_max_salary: 900000, job_salary_period: 'YEAR' })
assert.deepEqual(paid.pay, { min: 600000, max: 900000, period: 'YEAR' })
assert.equal(formatPay(paid.pay), '₹6–9 LPA')
assert.equal(formatPay({ min: 3775000, period: 'YEAR' }), '₹37.8 LPA')
assert.equal(formatPay({ min: 40000, max: 60000, period: 'MONTH' }), '₹40k–60k a month')
assert.equal(formatPay({}), '')

// Tavily: only single postings with a company; search pages ("4,422 openings") and profiles are dropped.
assert.deepEqual(postingFromSlug('https://www.naukri.com/job-listings-react-developer-athenahealth-bengaluru-2-to-4-years-180226034721', 'Bengaluru'), { title: 'React Developer', company: 'Athenahealth', location: 'Bengaluru', experience: '2–4 years' })
assert.deepEqual(postingFromTitle('Junior Full Stack Developer (Immediate Joiner) - Pune - IBN Technologies - 0 to 2 years of experience', 'naukri'), { title: 'Junior Full Stack Developer (Immediate Joiner)', location: 'Pune', company: 'IBN Technologies' })
assert.deepEqual(postingFromTitle('Full Stack Developer Job In Delhi At Charmai Technologies', 'internshala'), { title: 'Full Stack Developer', location: 'Delhi', company: 'Charmai Technologies' })
assert.equal(normalizeTavilyResult({ url: 'https://www.naukri.com/react-developer-jobs-in-bengaluru', title: 'React Developer Jobs In Bengaluru - 4422 React Developer Job Vacancies In Bengaluru - Naukri.com', content: 'x' }, 'naukri'), null)
const naukriPosting = normalizeTavilyResult({ url: 'https://www.naukri.com/job-listings-react-developer-athenahealth-bengaluru-2-to-4-years-180226034721', title: 'React Developer Jobs In Bengaluru - 4341 React Developer Job Vacancies In Bengaluru - Naukri.com', content: 'React, Redux' }, 'naukri', 'Bengaluru')
assert.equal(naukriPosting.company, 'Athenahealth')
assert.equal(naukriPosting.title, 'React Developer')
const posting = normalizeTavilyResult({ url: 'https://internshala.com/job/detail/react-developer-job-in-bangalore-at-acme1760000000', title: 'React Developer Job in Bangalore at Acme', content: 'React, Redux' }, 'internshala')
assert.deepEqual([posting.title, posting.company, posting.location], ['React Developer', 'Acme', 'Bangalore'])
assert.equal(normalizeTavilyResult({ url: 'https://internshala.com/job/detail/x-1760000000', title: 'Senior Developer Work From Home Job', content: '' }, 'internshala'), null, 'no company, no card')
assert.equal(normalizeTavilyResult({ url: 'http://insecure.example/jobs', title: 'x' }, 'indeed'), null)
assert.equal(normalizeTavilyResult({ url: 'https://internshala.com/job/detail/a-b-1760000000', title: 'A Job in Pune at B', content: 'OR OR As per my preferences Profile Location All Filters Senior Developer' }, 'internshala').snippet, 'Senior Developer')

// Board listing pages: the board's own search address for the role, place and dates.
assert.equal(boardListingUrl('naukri', { role: 'Frontend Developer', location: 'Bengaluru, Karnataka', datePosted: 'week' }), 'https://www.naukri.com/frontend-developer-jobs-in-bengaluru?jobAge=7')
assert.equal(boardListingUrl('naukri', { role: 'Frontend Developer', remote: true, datePosted: 'all' }), 'https://www.naukri.com/frontend-developer-jobs?wfhType=2')
assert.equal(boardListingUrl('indeed', { role: 'Frontend Developer', location: 'Pune', datePosted: 'today' }), 'https://in.indeed.com/jobs?q=Frontend+Developer&l=Pune&fromage=1')
assert.equal(boardListingUrl('indeed', { role: 'C++ Developer', remote: true }), 'https://in.indeed.com/jobs?q=C%2B%2B+Developer&l=Remote&fromage=30')
assert.equal(boardListingUrl('internshala', { role: 'Frontend Developer', location: 'Bengaluru' }), 'https://internshala.com/jobs/keywords-frontend-developer/jobs-in-bangalore/', 'Internshala spells it Bangalore')
assert.equal(boardListingUrl('internshala', { role: 'Frontend Developer', remote: true }), 'https://internshala.com/jobs/keywords-frontend-developer/work-from-home/')

// Listing cards: a company, a link on the board itself and a related title; vague pay is dropped, Indeed links made stable.
const card = normalizeListingJob({ title: 'Frontend Developer', company: 'Zeta', location: 'Bengaluru', experience: '1-3 Yrs', salary: '₹8-12 Lacs PA', skills: ['React', 'TypeScript'], url: 'https://www.naukri.com/job-listings-frontend-developer-zeta-111' }, 'naukri', 'Frontend Developer')
assert.deepEqual([card.company, card.payText, card.snippet], ['Zeta', '₹8-12 Lacs PA', 'Skills: React, TypeScript'])
assert.equal(normalizeListingJob({ title: 'Frontend Developer', company: 'Zeta', salary: 'Not disclosed', url: 'https://www.naukri.com/job-listings-x-1' }, 'naukri', 'Frontend Developer').payText, '')
assert.equal(normalizeListingJob({ title: 'Frontend Developer', company: null, url: 'https://www.naukri.com/job-listings-x-1' }, 'naukri', 'Frontend Developer'), null, 'no company, no card')
assert.equal(normalizeListingJob({ title: 'Frontend Developer', company: 'Ad', url: 'https://ads.example/x' }, 'naukri', 'Frontend Developer'), null, 'links off the board are dropped')
assert.equal(normalizeListingJob({ title: 'Computer Science Teacher', company: 'School', url: 'https://internshala.com/job/detail/x-1' }, 'internshala', 'Frontend Developer'), null, 'unrelated padding is dropped')
assert.equal(normalizeListingJob({ title: 'Frontend Developer', company: 'Lenskart', url: 'https://in.indeed.com/rc/clk?jk=2d727f34742cc81c&bb=tracking' }, 'indeed', 'Frontend Developer').url, 'https://in.indeed.com/viewjob?jk=2d727f34742cc81c')

// Salary per card: posted pay first, then the company's median, then the role's median in that city.
const salaries = { market: { median: 900000, period: 'YEAR', count: 1112, source: 'Glassdoor' }, companies: { acme: { median: 1500000, period: 'YEAR', source: 'Glassdoor' } } }
assert.equal(salaryFor(paid, salaries, profile).kind, 'posted')
assert.deepEqual(salaryFor(job, salaries, profile), { text: '₹15 LPA', kind: 'company', note: 'Typical pay for a Frontend Developer at Acme (Glassdoor median)' })
assert.equal(salaryFor({ ...job, company: 'Unknown Co' }, salaries, profile).text, '₹9 LPA')
assert.equal(salaryFor({ ...job, company: 'Unknown Co' }, {}, profile), null)

// Rows: one per board in order, a posting in every board it is listed on, best match first.
const rows = buildRows(profile, { jobs: [job, normalizeJSearchJob({ ...raw, job_id: 'weak', job_title: 'Java Engineer', job_description: 'Java Spring', apply_options: [] })], web: [naukriPosting, posting], salaries })
assert.deepEqual(rows.map(row => row.platform), ['linkedin', 'naukri', 'internshala', 'company'])
assert.equal(rows[0].jobs[0].title, 'Frontend Developer')
assert.ok(rows[0].jobs[0].score > rows[0].jobs[1].score)
assert.equal(rows[0].jobs[0].url, 'https://www.linkedin.com/jobs/view/1')
assert.equal(rows[0].jobs[0].salary.text, '₹15 LPA')
assert.deepEqual(rows[1].jobs.map(item => item.url), ['https://www.naukri.com/job-listings-frontend-acme-1234567', naukriPosting.url])
assert.equal(rows[2].jobs[0].score, null, 'web postings have no description to score')
assert.equal(rows[2].jobs[0].salary.kind, 'company', 'Acme has a company estimate')
assert.equal(rows[0].jobs[0].key, jobKeyOf('abc=='))
assert.ok(rows.every(row => !('browse' in row)))
const [cardRow] = buildRows(profile, { web: [card], salaries })
assert.ok(cardRow.jobs[0].score > 50, 'listing cards are scored on the skills they list')
assert.ok(cardRow.jobs[0].matched.includes('React'))
assert.equal(cardRow.jobs[0].salary.text, '₹8-12 Lacs PA')

// A board's row joins the last search: merged with JSearch's postings for that board, in board order, no longer pending.
const before = { rows, failures: ['naukri.com'], pendingBoards: ['naukri', 'indeed'] }
const merged = mergeBoardRow(before, 'naukri', buildRows(profile, { web: [card], salaries })[0])
assert.deepEqual(merged.rows.map(row => row.platform), ['linkedin', 'naukri', 'internshala', 'company'])
assert.equal(merged.rows[1].jobs.length, 3, 'the listing card joins the two JSearch and web postings')
assert.deepEqual(merged.failures, [])
assert.deepEqual(merged.pendingBoards, ['indeed'])
const failedBoard = mergeBoardRow({ rows: [], failures: [], pendingBoards: ['indeed'] }, 'indeed', null, true)
assert.deepEqual([failedBoard.rows, failedBoard.failures, failedBoard.pendingBoards], [[], ['in.indeed.com'], []])

// Sources over fake fetch: the right request, and errors become JobSourceError.
const calls = []
const fakeFetch = async (url, init) => {
  calls.push({ url: String(url), init })
  if (new URL(String(url)).hostname === 'api.context.dev') {
    const page = JSON.parse(init.body).url
    if (page.includes('indeed')) return new Response(JSON.stringify({ error: 'USAGE_EXCEEDED' }), { status: 402 })
    const jobs = page.includes('naukri')
      ? [{ title: 'Frontend Developer', company: 'Zeta', location: 'Bengaluru', skills: ['React'], url: 'https://www.naukri.com/job-listings-frontend-developer-zeta-111' },
          { title: 'Frontend Developer', company: 'Zeta', url: 'https://www.naukri.com/job-listings-frontend-developer-zeta-111' },
          { title: 'Accountant', company: 'Ledger', url: 'https://www.naukri.com/job-listings-accountant-ledger-222' },
          { title: 'Frontend Developer', company: 'Ghost', url: 'https://www.naukri.com/job-listings-frontend-developer-ghost-999' }]
      : []
    const markdown = '[Frontend Developer](https://www.naukri.com/job-listings-frontend-developer-zeta-111) [Accountant](https://www.naukri.com/job-listings-accountant-ledger-222)'
    return new Response(JSON.stringify({ json: { requested: true, success: true, data: { jobs } }, markdown: { requested: true, success: true, data: markdown }, key_metadata: { credits_consumed: 5, credits_remaining: 95 } }))
  }
  if (String(url).includes('tavily')) return new Response(JSON.stringify({ results: [{ url: posting.url, title: 'React Developer Job in Bangalore at Acme', content: 'React' }, { url: 'https://internshala.com/jobs/react-jobs', title: 'React Jobs: 77 Vacancies' }] }))
  if (String(url).includes('salary')) return new Response(JSON.stringify({ status: 'OK', data: [{ median_salary: String(url).includes('company=') ? 1500000 : 900000, salary_period: 'YEAR', salary_currency: 'INR', salary_count: 10, publisher_name: 'Glassdoor' }] }))
  return new Response(JSON.stringify({ status: 'OK', data: [raw] }))
}
const found = await searchJSearch({ query: 'Frontend Developer in Bengaluru', remote: true, pages: 2 }, { apiKey: 'k', url: 'https://jsearch.test/search', fetchImpl: fakeFetch })
assert.equal(found.length, 1)
assert.equal(calls[0].init.headers['x-api-key'], 'k')
assert.match(calls[0].url, /work_from_home=true/)
assert.match(calls[0].url, /country=in/)
const web = await searchTavily({ query: 'q', platform: 'internshala' }, { apiKey: 't', fetchImpl: fakeFetch })
assert.deepEqual(JSON.parse(calls[1].init.body).include_domains, ['internshala.com'])
assert.deepEqual(web.map(item => item.company), ['Acme'], 'the search page is dropped')
const estimate = await estimateSalary({ jobTitle: 'SDE', location: 'Bengaluru, India', company: 'Google' }, { apiKey: 'k', url: 'https://jsearch.test/jsearch/search', fetchImpl: fakeFetch })
assert.match(calls[2].url, /^https:\/\/jsearch\.test\/jsearch\/company-job-salary\?.*company=Google/)
assert.equal(estimate.median, 1500000)
assert.equal(await estimateSalary({ jobTitle: 'SDE', location: 'x' }, { apiKey: 'k', url: 'https://x/search', fetchImpl: async () => new Response(JSON.stringify({ data: [{ median_salary: 5, salary_currency: 'USD' }] })) }), null, 'only rupee estimates')
// context.dev: the key in a Bearer header, the page and schema in the body; errors keep their meaning.
calls.length = 0
const listed = await readBoardListing({ platform: 'naukri', role: 'Frontend Developer', location: 'Bengaluru' }, { apiKey: 'ctx', fetchImpl: fakeFetch })
assert.equal(calls[0].url, 'https://api.context.dev/v1/web/scrape')
assert.equal(calls[0].init.headers.Authorization, 'Bearer ctx')
const scrapeBody = JSON.parse(calls[0].init.body)
assert.equal(scrapeBody.url, 'https://www.naukri.com/frontend-developer-jobs-in-bengaluru?jobAge=30')
assert.deepEqual(scrapeBody.formats, { json: true, markdown: true })
assert.deepEqual([scrapeBody.sharedParams?.waitFor, scrapeBody.maxAgeMs], [4000, 0], 'Naukri is read fresh, after its cards draw')
await assert.rejects(readBoardListing({ platform: 'internshala', role: 'Frontend Developer' }, { apiKey: 'ctx', fetchImpl: fakeFetch }), /found no postings/, 'an empty read is a failure, not an empty row')
assert.equal(scrapeBody.jsonParams.schema.properties.jobs.type, 'array')
assert.deepEqual(listed.map(item => item.company), ['Zeta'], 'duplicates, unrelated jobs and links not on the page are dropped')
// Indeed: real cards link through its click tracker; planted copies link straight to a made-up id.
const indeedPage = '[Frontend Developer](https://in.indeed.com/rc/clk?jk=c1f5a7618db0f07e&bb=x) [Frontend Developer](https://in.indeed.com/viewjob?jk=fedcba9876543210)'
assert.equal(linkedOnPage('https://in.indeed.com/viewjob?jk=c1f5a7618db0f07e', indeedPage, 'indeed'), true)
assert.equal(linkedOnPage('https://in.indeed.com/viewjob?jk=fedcba9876543210', indeedPage, 'indeed'), false, 'the planted card is left out')
assert.equal(linkedOnPage('https://www.naukri.com/job-listings-x-123', 'no links here', 'naukri'), false)
assert.equal(linkedOnPage('https://www.naukri.com/job-listings-x-123', '', 'naukri'), true, 'no page text to check against')
await assert.rejects(readBoardListing({ platform: 'indeed', role: 'x' }, { apiKey: 'ctx', fetchImpl: fakeFetch }), /answered 402/)
await assert.rejects(scrapeJson({ url: 'https://x', schema: {} }, { apiKey: '' }), error => error.code === 'not_configured')
await assert.rejects(scrapeJson({ url: 'https://x', schema: {} }, { apiKey: 'k', fetchImpl: async () => new Response('{}', { status: 402 }) }), error => error.code === 'credits')
await assert.rejects(scrapeJson({ url: 'https://x', schema: {} }, { apiKey: 'k', fetchImpl: async () => new Response(JSON.stringify({ json: { success: false, error_code: 'BLOCKED' } })) }), error => error.code === 'empty' && /BLOCKED/.test(error.message))
calls.length = 0

await assert.rejects(searchJSearch({ query: 'q' }, { apiKey: '', url: 'x' }), /not configured/)
await assert.rejects(searchJSearch({ query: 'q' }, { apiKey: 'k', url: 'https://x', fetchImpl: async () => new Response('{}', { status: 429 }) }), /answered 429/)

// Search: a general and a LinkedIn JSearch query (deduplicated), the web boards, salaries; cached per terms.
const db = createFakeFirestore()
let clock = Date.UTC(2026, 9, 14, 10)
const jobs = createJobStore({ getDb: () => db, now: () => clock })
const config = { jsearchKey: 'k', jsearchUrl: 'https://jsearch.test/search', contextDevKey: 'ctx', tavilyKey: 't', cacheHours: 6 }
const search = createJobSearch({ store: jobs, config, fetchImpl: fakeFetch })
assert.equal(await search.lookup(profile), null)
calls.length = 0
const fresh = await search.fetchFresh(profile)
assert.equal(fresh.jobs.length, 1, 'the same posting from both JSearch queries is kept once')
assert.ok(calls.some(call => new URL(call.url).searchParams.get('query')?.endsWith('via LinkedIn')))
assert.equal(fresh.web.length, 0, 'the boards load in their own requests')
assert.ok(!calls.some(call => call.url.includes('tavily') || call.url.includes('context.dev')))
assert.equal(fresh.salaries.market.median, 900000)
assert.equal(fresh.salaries.companies.acme.median, 1500000)
assert.equal(fresh.failures.length, 0)
await new Promise(resolve => setTimeout(resolve, 10))
const salaryCalls = calls.filter(call => call.url.includes('salary')).length
await search.fetchFresh({ ...profile, datePosted: 'week' })
assert.equal(calls.filter(call => call.url.includes('salary')).length, salaryCalls, 'salary estimates come from their cache the second time')
assert.ok(await search.lookup(profile), 'cached after a complete search')
clock += 7 * 3600_000
assert.equal(await search.lookup(profile), null, 'cache expires')
assert.notEqual(cacheKeyOf(profile), cacheKeyOf({ ...profile, remote: true }))
const flaky = createJobSearch({ store: jobs, config, fetchImpl: async (url, init) => (String(url).includes('LinkedIn') ? new Response('{}', { status: 500 }) : fakeFetch(url, init)) })
const partial = await flaky.fetchFresh({ ...profile, role: 'Partial role' })
assert.deepEqual(partial.failures, ['LinkedIn'])
await new Promise(resolve => setTimeout(resolve, 10))
assert.equal(await flaky.lookup({ ...profile, role: 'Partial role' }), null, 'partial results are not cached')
await assert.rejects(createJobSearch({ store: jobs, config, fetchImpl: async () => { throw new Error('down') } }).fetchFresh(profile), /could not be reached/)

// Boards: the listing page through context.dev, else a web search of the board; each cached on its own.
assert.deepEqual(WEB_BOARDS, ['naukri', 'indeed', 'internshala', 'company'])
assert.deepEqual(search.availableBoards(), WEB_BOARDS)
assert.deepEqual(createJobSearch({ store: jobs, config: { ...config, contextDevKey: '', tavilyKey: '' } }).availableBoards(), ['company'], 'employer feeds need no key')
calls.length = 0
const naukriBoard = await search.fetchBoard(profile, 'naukri')
assert.deepEqual([naukriBoard.source, naukriBoard.web.length], ['listing', 1])
assert.ok(!calls.some(call => call.url.includes('tavily')))
const indeedBoard = await search.fetchBoard(profile, 'indeed')
assert.equal(indeedBoard.source, 'search', 'out of context.dev credits: Tavily searches the board instead')
await new Promise(resolve => setTimeout(resolve, 10))
assert.equal((await search.lookupBoard(profile, 'naukri')).web[0].company, 'Zeta')
assert.notEqual(boardKeyOf(profile, 'naukri'), boardKeyOf(profile, 'indeed'))
const tavilyOnly = createJobSearch({ store: jobs, config: { ...config, contextDevKey: '' }, fetchImpl: fakeFetch })
assert.equal((await tavilyOnly.fetchBoard({ ...profile, role: 'Tavily only' }, 'internshala')).source, 'search')
const unreachable = createJobSearch({ store: jobs, config, fetchImpl: async () => new Response('{}', { status: 500 }) })
await assert.rejects(unreachable.fetchBoard({ ...profile, role: 'Down' }, 'naukri'), /naukri\.com could not be reached/)

// Related titles: other names for the same work, never the role itself; unknown roles search their top skills.
assert.deepEqual(relatedRoles('React Developer').slice(0, 2), ['Frontend Developer', 'Frontend Engineer'])
assert.ok(!relatedRoles('Frontend Developer').includes('Frontend Developer'))
assert.ok(relatedRoles('Data Analyst').includes('Business Analyst'))
assert.ok(relatedRoles('Java Developer').includes('Backend Developer'))
assert.ok(!relatedRoles('JavaScript Developer').includes('Java Developer'), 'JavaScript is not Java')
assert.deepEqual(relatedRoles('Pastry Chef'), [])
assert.deepEqual(extraQueries({ role: 'React Developer', location: 'Pune', remote: false, skills: [] }), ['Frontend Developer in Pune', 'Frontend Engineer in Pune'])
assert.deepEqual(extraQueries({ role: 'Pastry Chef', location: 'Goa', remote: true, skills: ['Baking', 'Chocolate', 'Icing'] }), ['Baking Chocolate jobs remote'])
calls.length = 0
await search.fetchFresh({ ...profile, role: 'React Developer' })
const asked = calls.map(call => new URL(call.url).searchParams.get('query')).filter(Boolean)
assert.ok(asked.includes('Frontend Developer in Bengaluru') && asked.includes('Frontend Engineer in Bengaluru'), 'related titles are searched too')
const relatedDown = createJobSearch({ store: jobs, config, fetchImpl: async (url, init) => (String(url).includes('Frontend+Engineer') ? new Response('{}', { status: 500 }) : fakeFetch(url, init)) })
assert.deepEqual((await relatedDown.fetchFresh({ ...profile, role: 'React Developer', location: 'Delhi' })).failures, [], 'a related search failing is not a board failure')

// The same opening from two sources shows once: by address, or by title and employer (legal suffixes and seniority ignored).
assert.equal(jobIdentity({ title: 'Sr. React Developer', company: 'Zeta Pvt Ltd' }), jobIdentity({ title: 'React Developer', company: 'Zeta' }))
assert.notEqual(jobIdentity({ title: 'React Developer', company: 'Zeta' }), jobIdentity({ title: 'Java Developer', company: 'Zeta' }))
assert.equal(jobIdentity({ title: 'React Developer', company: '' }), '', 'unknown employers never merge')
const once = uniqueJobs([
  { key: 'a', title: 'React Developer', company: 'Zeta Technologies', score: null },
  { key: 'b', title: 'React Developer', company: 'Zeta', score: 80, salary: null },
  { key: 'c', title: 'Java Developer', company: 'Zeta', score: 40 },
  { key: 'c', title: 'Java Developer', company: 'Zeta', score: 40 }
])
assert.deepEqual(once.map(item => item.key), ['b', 'c'], 'the scored copy is kept')

// Employer job feeds (Greenhouse, Lever, Ashby): exact openings from the companies' own boards, filtered to the search.
assert.ok(Object.keys(COMPANY_FEEDS.greenhouse).length > 5 && COMPANY_FEEDS.lever.paytm && COMPANY_FEEDS.ashby.sarvam)
assert.equal(placeFits('Bangalore, KA, India', { location: 'Bengaluru' }), true, 'either spelling')
assert.equal(placeFits('Pune, India', { location: 'Bengaluru' }), false)
assert.equal(placeFits('Remote - India', { remote: true }), true)
assert.equal(placeFits('Remote', { remote: true }), false, 'a bare "Remote" may be another country')
assert.equal(placeFits('Gurgaon, Haryana', { location: 'Gurugram' }), true)
assert.equal(roleFit('React Developer', 'Senior Software Engineer (Core Frontier)'), 0, 'generic titles need a specific word')
assert.ok(roleFit('React Developer', 'Staff Software Engineer - UI') >= .5, 'a related title counts')
assert.ok(roleFit('React Developer', 'Senior Software Engineer - Fullstack') >= .5, 'Fullstack and Full Stack are one title')
assert.ok(roleFit('Software Engineer', 'Senior Software Engineer') > 0, 'a generic role matches generic titles')
const day = 86_400_000
const feedNow = Date.UTC(2026, 10, 9)
// Fake network for the feeds, matched on the parsed host and path (never a substring of the whole address).
const feedFetch = async url => {
  const { hostname: host, pathname: path } = new URL(String(url))
  if (host === 'boards-api.greenhouse.io' && path === '/v1/boards/acme/jobs/11') return new Response(JSON.stringify({ content: '&lt;p&gt;React, TypeScript and CSS. 1-3 years.&lt;/p&gt;' }))
  if (host === 'boards-api.greenhouse.io' && path === '/v1/boards/acme/jobs') return new Response(JSON.stringify({ jobs: [
    { id: 11, title: 'Frontend Engineer', company_name: 'Acme', location: { name: 'Bangalore, India' }, absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/11', first_published: new Date(feedNow - 2 * day).toISOString() },
    { id: 12, title: 'Frontend Engineer', company_name: 'Acme', location: { name: 'London, UK' }, absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/12' },
    { id: 13, title: 'Account Executive', company_name: 'Acme', location: { name: 'Bengaluru' }, absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/13' },
    { id: 14, title: 'Frontend Developer', company_name: 'Acme', location: { name: 'Bengaluru' }, absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/14', first_published: new Date(feedNow - 90 * day).toISOString() }
  ] }))
  if (host === 'api.lever.co' && path === '/v0/postings/lev') return new Response(JSON.stringify([{ id: 'l1', text: 'frontend developer', categories: { location: 'bengaluru' }, country: 'IN', hostedUrl: 'https://jobs.lever.co/lev/l1', createdAt: feedNow - day, descriptionPlain: 'React and Redux', lists: [{ text: 'You have', content: '<li>2+ years</li>' }] }]))
  if (host === 'api.ashbyhq.com' && path === '/posting-api/job-board/ash') return new Response(JSON.stringify({ jobs: [{ id: 'x', title: 'React Developer', location: 'Remote', secondaryLocations: [], address: { postalAddress: { addressCountry: 'India' } }, isRemote: true, isListed: true, jobUrl: 'https://jobs.ashbyhq.com/ash/x', publishedAt: new Date(feedNow - day).toISOString(), descriptionPlain: 'React', compensation: { scrapeableCompensationSalarySummary: '₹20L – ₹30L' } }] }))
  if (host === 'api.tavily.com') return new Response(JSON.stringify({ results: [{ url: 'https://jobs.lever.co/newco/123' }, { url: 'https://jobs.lever.co/paytm/1' }, { url: 'https://example.com/careers' }] }))
  return new Response('{}', { status: 404 })
}
const leverJobs = await readFeed('lever', 'lev', 'Lev', { fetchImpl: feedFetch })
assert.deepEqual([leverJobs[0].title, leverJobs[0].location], ['Frontend Developer', 'Bengaluru, India'])
assert.match(leverJobs[0].description, /React and Redux.*2\+ years/)
assert.deepEqual(await discoverCompanies({ role: 'React Developer', location: 'Pune' }, { tavilyKey: 't', fetchImpl: feedFetch }), [{ ats: 'lever', slug: 'newco', name: 'Newco' }], 'listed employers and other sites are skipped')
assert.deepEqual(await discoverCompanies({ role: 'x' }, { tavilyKey: '' }), [])
const feedProfile = { ...profile, role: 'React Developer', location: 'Bengaluru', datePosted: 'month' }
const feeds = { greenhouse: { acme: 'Acme', gone: 'Gone' }, lever: { lev: 'Lev' }, ashby: { ash: 'Ash' } }
const openings = await searchCompanyFeeds(feedProfile, { fetchImpl: feedFetch, now: () => feedNow, feeds })
assert.deepEqual(openings.map(item => item.url), ['https://job-boards.greenhouse.io/acme/jobs/11', 'https://jobs.lever.co/lev/l1'], 'right city, related title, posted within the month')
assert.equal(openings[0].platform, 'company')
assert.match(openings[0].description, /React, TypeScript/, 'Greenhouse matches get their description')
const remoteOpenings = await searchCompanyFeeds({ ...feedProfile, remote: true }, { fetchImpl: feedFetch, now: () => feedNow, feeds })
assert.deepEqual(remoteOpenings.map(item => [item.company, item.payText]), [['Ash', '₹20L – ₹30L']])
await assert.rejects(searchCompanyFeeds(feedProfile, { fetchImpl: async () => new Response('{}', { status: 500 }), feeds }), /no company job board/)
const [companyRow] = buildRows(feedProfile, { web: openings })
assert.equal(companyRow.platform, 'company')
assert.ok(companyRow.jobs.every(item => item.score !== null), 'feed openings are scored on their description')
assert.ok(GREENHOUSE_DETAILS > 0)

assert.throws(() => validateSavedJob({ title: 'x', url: 'javascript:alert(1)' }), /title and a link/)
assert.equal(validateSavedJob({ title: 'x', url: 'https://a', logo: 'http://insecure/logo.png', extra: 'dropped' }).logo, '')

// Routes behind sign-in and requirePro.
db.seed('users/pro', { plan: { tier: 'pro', status: 'active', term: 'lifetime' } })
db.seed('users/free', { plan: { tier: 'free', status: 'active' } })
const resumes = createResumeStore({ getDb: () => db, timestamp: db.timestamp, checkpointMs: Infinity })
const RESUME = 'a1b2c3d4-e5f6-4789-8abc-def012345678'
await resumes.saveResume('pro', RESUME, { baseRevision: null, fields: { name: 'Main', templateId: 'onyx', data: resume, presentation: {} } })
const users = { getPlan: async uid => db.read(`users/${uid}`)?.plan ?? null }
const app = express()
app.use('/api/jobs', (request, _response, next) => { request.firebaseUser = { uid: request.get('x-uid') }; next() }, createRequirePro({ feature: 'jobTracker', users }), express.json(),
  createJobsRouter({ jobs, resumes, search: createJobSearch({ store: jobs, config, fetchImpl: fakeFetch }), perDay: 2, day: () => '2026-10-14' }))
const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)) })
const call = async (method, path, { uid = 'pro', body } = {}) => {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/jobs${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-uid': uid }, body: body ? JSON.stringify(body) : undefined })
  return { status: response.status, body: await response.json() }
}
try {
  const refused = await call('GET', '/latest', { uid: 'free' })
  assert.equal(refused.status, 403)
  assert.equal(refused.body.code, 'pro_required')

  assert.deepEqual((await call('GET', '/latest')).body, { ok: true, search: null, searchesLeft: 2, searchesPerDay: 2 })
  assert.equal((await call('POST', '/search', { body: { resumeId: 'nope' } })).status, 400)
  assert.equal((await call('POST', '/search', { body: { resumeId: '11111111-2222-4333-8444-555555555555' } })).status, 404)

  const first = await call('POST', '/search', { body: { resumeId: RESUME, role: 'React Developer', location: 'Pune' } })
  assert.equal(first.status, 200)
  assert.equal(first.body.searchesLeft, 1)
  assert.equal(first.body.search.profile.role, 'React Developer')
  assert.equal(first.body.search.resumeName, 'Main')
  assert.ok(first.body.search.rows.some(row => row.platform === 'linkedin'))
  assert.deepEqual(first.body.search.pendingBoards, ['naukri', 'indeed', 'internshala', 'company'])

  // Boards for that search load one request each and are merged into the kept last search.
  const terms = { resumeId: RESUME, role: 'React Developer', location: 'Pune' }
  assert.equal((await call('POST', '/boards/monster', { body: terms })).status, 400)
  const stale = await call('POST', '/boards/naukri', { body: { ...terms, role: 'Some other search' } })
  assert.deepEqual([stale.status, stale.body.code], [409, 'stale'], 'only the search just run')
  const [naukriRow, indeedRow] = await Promise.all([call('POST', '/boards/naukri', { body: terms }), call('POST', '/boards/indeed', { body: terms })])
  assert.equal(naukriRow.status, 200)
  assert.equal(naukriRow.body.failed, false)
  assert.equal(indeedRow.body.failed, false, 'Indeed fell back to a web search')
  const kept = (await call('GET', '/latest')).body.search
  assert.deepEqual(kept.pendingBoards, ['internshala', 'company'], 'both side-by-side boards were kept')
  await new Promise(resolve => setTimeout(resolve, 10))
  const repeat = await call('POST', '/search', { body: { resumeId: RESUME, role: 'React Developer', location: 'Pune' } })
  assert.equal(repeat.body.search.cached, true)
  assert.equal(repeat.body.searchesLeft, 1, 'cached searches are free')
  assert.equal((await call('POST', '/search', { body: { resumeId: RESUME, role: 'Designer' } })).body.searchesLeft, 0)
  const limited = await call('POST', '/search', { body: { resumeId: RESUME, role: 'Tester' } })
  assert.equal(limited.status, 429)
  assert.equal(limited.body.code, 'limit')
  assert.equal((await call('GET', '/latest')).body.search.profile.role, 'Designer', 'the last results are kept')

  const card = first.body.search.rows[0].jobs[0]
  const saved = await call('PUT', `/saved/${card.key}`, { body: { job: { ...card, resumeId: RESUME } } })
  assert.equal(saved.body.job.status, 'saved')
  await call('PATCH', `/saved/${card.key}`, { body: { status: 'applied', notes: 'Referred by Sam' } })
  await call('PUT', `/saved/${card.key}`, { body: { job: card } })
  const list = (await call('GET', '/saved')).body.jobs
  assert.equal(list.length, 1)
  assert.equal(list[0].status, 'applied', 'saving again keeps the status')
  assert.equal(list[0].notes, 'Referred by Sam')
  assert.equal((await call('PATCH', `/saved/${card.key}`, { body: { status: 'hired' } })).status, 400)
  assert.equal((await call('PATCH', `/saved/${'0'.repeat(24)}`, { body: { status: 'offer' } })).status, 404)
  assert.equal((await call('PUT', '/saved/not-a-key', { body: { job: card } })).status, 400)
  await call('DELETE', `/saved/${card.key}`)
  assert.deepEqual((await call('GET', '/saved')).body.jobs, [])
} finally {
  server.close()
}

console.log('✓ jobs tests passed')
