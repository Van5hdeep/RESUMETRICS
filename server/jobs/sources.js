// The job sources behind the job tracker: JSearch (Google Jobs), board listing pages read through context.dev, and
// Tavily web search as the listing pages' fallback. Each returns plain, trimmed objects and throws JobSourceError on
// failure, so one slow or broken source never takes another down (server/jobs/jobSearch.js).
import { platformOf, titleFit } from '../../shared/jobMatch.js'
import { ContextDevError, scrapeJson } from '../integrations/contextDev.js'

// JSearch sometimes takes 20–30 s and a listing page 15–40 s; each stays inside the 60 s serverless limit (vercel.json),
// and a listing page has its own request (server/routes/jobs.routes.js), so they never add up.
const TIMEOUT_MS = { jsearch: 40_000, tavily: 20_000, salary: 15_000, listing: 48_000 }
const clean = (value, max = 200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export class JobSourceError extends Error {
  constructor(source, message) {
    super(message)
    this.name = 'JobSourceError'
    this.source = source
  }
}

async function getJson(source, url, init, fetchImpl) {
  let response
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS[source]) })
  } catch (error) {
    throw new JobSourceError(source, error?.name === 'TimeoutError' ? 'timed out' : 'could not be reached')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok || !body) throw new JobSourceError(source, `answered ${response.status}`)
  return body
}

/** JSearch posting → the fields the tracker keeps. Every apply link is kept, one per job board. */
export function normalizeJSearchJob(job) {
  const options = [...(Array.isArray(job.apply_options) ? job.apply_options : []), { publisher: job.job_publisher, apply_link: job.job_apply_link, is_direct: job.job_apply_is_direct }]
  const applyOptions = []
  for (const option of options) {
    const url = typeof option?.apply_link === 'string' && /^https?:\/\//.test(option.apply_link) ? option.apply_link : null
    if (!url) continue
    const platform = platformOf(option.publisher, url, { direct: Boolean(option.is_direct) })
    if (!applyOptions.some(item => item.platform === platform)) applyOptions.push({ platform, publisher: clean(option.publisher, 60), url })
  }
  const city = [job.job_city, job.job_state].filter(Boolean).join(', ')
  const qualifications = Array.isArray(job.job_highlights?.Qualifications) ? job.job_highlights.Qualifications.join('\n') : ''
  // Posted pay in rupees (shared/jobMatch.js formats it); other currencies keep the posting's own wording.
  const inr = job.job_country === 'IN' || /₹|INR/.test(job.job_salary_string ?? '')
  const min = Number(job.job_min_salary) || null
  const max = Number(job.job_max_salary) || null
  const pay = inr && (min || max) ? { min, max, period: ['YEAR', 'MONTH', 'HOUR'].includes(job.job_salary_period) ? job.job_salary_period : 'YEAR' } : null
  return {
    id: clean(job.job_id, 200),
    title: clean(job.job_title, 140),
    company: clean(job.employer_name, 100),
    logo: typeof job.employer_logo === 'string' && /^https:\/\//.test(job.employer_logo) ? job.employer_logo : '',
    location: clean(city || job.job_location || job.job_country, 100),
    remote: Boolean(job.job_is_remote),
    type: clean(job.job_employment_type, 40).replace(/–/g, '-'),
    postedAt: typeof job.job_posted_at_datetime_utc === 'string' ? job.job_posted_at_datetime_utc : null,
    pay,
    payText: pay ? '' : clean(job.job_salary_string, 60),
    description: clean(job.job_description, 3000),
    qualifications: clean(qualifications, 1500),
    applyOptions
  }
}

/** Up to 10 postings per page. datePosted: all | today | 3days | week | month. */
export async function searchJSearch({ query, country = 'in', datePosted = 'month', remote = false, pages = 1 }, { apiKey, url, fetchImpl = fetch }) {
  if (!apiKey) throw new JobSourceError('jsearch', 'is not configured')
  const params = new URLSearchParams({ query, country, date_posted: datePosted, num_pages: String(pages), page: '1' })
  if (remote) params.set('work_from_home', 'true')
  const body = await getJson('jsearch', `${url}?${params}`, { headers: { 'x-api-key': apiKey } }, fetchImpl)
  if (body.status && body.status !== 'OK') throw new JobSourceError('jsearch', `answered ${body.status}`)
  return (Array.isArray(body.data) ? body.data : []).map(normalizeJSearchJob).filter(job => job.id && job.title && job.applyOptions.length)
}

/**
 * Median pay from Glassdoor data via JSearch: for one company when `company` is given, otherwise for the role in that
 * location. Resolves { median, min, max, period, count, source } in rupees, or null when there is no rupee data.
 */
export async function estimateSalary({ jobTitle, location, company = '' }, { apiKey, url, fetchImpl = fetch }) {
  if (!apiKey) throw new JobSourceError('salary', 'is not configured')
  const params = new URLSearchParams({ job_title: jobTitle, location, location_type: 'ANY', years_of_experience: 'ALL' })
  if (company) params.set('company', company)
  const endpoint = new URL(company ? 'company-job-salary' : 'estimated-salary', url)
  const body = await getJson('salary', `${endpoint}?${params}`, { headers: { 'x-api-key': apiKey } }, fetchImpl)
  const data = Array.isArray(body.data) ? body.data[0] : null
  const median = Number(data?.median_salary)
  if (!data || data.salary_currency !== 'INR' || !(median > 0)) return null
  return { median, min: Number(data.min_salary) || null, max: Number(data.max_salary) || null, period: data.salary_period === 'MONTH' ? 'MONTH' : 'YEAR', count: Number(data.salary_count) || 0, source: clean(data.publisher_name, 40) || 'Glassdoor' }
}

// Single postings per board. Search pages ("4,422 React Developer jobs") are left out: the tracker shows jobs, not counts.
const POSTING_PATTERNS = {
  naukri: /\/job-listings-/,
  indeed: /\/(?:viewjob|rc\/clk|m\/viewjob)|\/cmp\/[^/]+\/jobs\//,
  internshala: /\/(?:job|internship)\/detail\//
}
const SITE_SUFFIX = /\s*[-|–]\s*(?:naukri(?:\.com)?|indeed(?:\.com)?|internshala)\s*$/i
const titleCase = text => text.replace(/\b[a-z]/g, letter => letter.toUpperCase())
const TITLE_END = /\b(?:developer|engineer|analyst|manager|designer|intern|internship|lead|architect|consultant|specialist|executive|scientist|administrator|tester|associate|programmer|trainee|fresher|joiner|sde)\b/gi

/**
 * "/job-listings-junior-react-developer-acme-labs-pune-2-to-4-years-180226034721" with location hint "Pune" →
 * { title: 'Junior React Developer', company: 'Acme Labs', location: 'Pune', experience: '2–4 years' }.
 */
export function postingFromSlug(url, locationHint = '') {
  let slug = ''
  try { slug = new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? '' } catch { return { title: '', company: '', location: '', experience: '' } }
  slug = slug.replace(/^job-listings-/, '').replace(/[-_]?\d{6,}$/, '').replace(/\.html?$/, '')
  const years = slug.match(/-(\d{1,2})-to-(\d{1,2})-years?/)
  let words = slug.replace(/-\d{1,2}-to-\d{1,2}-years?.*$/, '').split(/[-_]+/).filter(Boolean)
  const city = locationHint.toLowerCase().split(/[\s,]+/)[0]
  const cityAt = city ? words.lastIndexOf(city) : -1
  const location = cityAt > 0 ? titleCase(city) : ''
  if (cityAt > 0) words = words.slice(0, cityAt)
  const text = words.join(' ')
  const ends = [...text.matchAll(TITLE_END)]
  const cut = ends.length ? ends.at(-1).index + ends.at(-1)[0].length : text.length
  return { title: titleCase(text.slice(0, cut).trim()), company: titleCase(text.slice(cut).trim()), location, experience: years ? `${years[1]}–${years[2]} years` : '' }
}

/** Title, company and place from a posting page's title, in each board's own format. */
export function postingFromTitle(title, platform) {
  if (platform === 'internshala') {
    const remote = title.match(/^(.*?)\s+work from home\s+(?:job|internship)(?:\s+at\s+(.+))?$/i)
    if (remote) return { title: remote[1], company: remote[2] ?? '', location: 'Remote' }
    const onsite = title.match(/^(.*?)\s+(?:job|internship)\s+in\s+(.+?)\s+at\s+(.+)$/i)
    if (onsite) return { title: onsite[1], location: onsite[2], company: onsite[3] }
    return { title, company: '', location: '' }
  }
  const parts = title.split(/\s+-\s+/).map(part => part.trim()).filter(Boolean)
  if (platform === 'naukri' && parts.length >= 3) return { title: parts[0], location: parts[1], company: parts[2] }   // Title - City - Company - Experience
  if (platform === 'indeed' && parts.length >= 3) return { title: parts[0], company: parts[1], location: parts[2] }   // Title - Company - City
  return { title, company: '', location: '' }
}

/** A Tavily result → a single posting with its company, or null (search pages, anything without a company). */
export function normalizeTavilyResult(result, platform, locationHint = '') {
  const url = typeof result?.url === 'string' && /^https:\/\//.test(result.url) ? result.url : null
  if (!url || !POSTING_PATTERNS[platform]?.test(url)) return null
  const pageTitle = clean(result.title, 160).replace(SITE_SUFFIX, '')
  // Page text often starts with the board's filter menu ("OR OR As per my preferences … All Filters").
  const snippet = clean(String(result.content ?? '').replace(/#+/g, ' ').replace(/^Title:.*?#?\s/, '').replace(/As per my preferences.*?All Filters/i, ' ').replace(/^(?:\s*OR\b)+/, ''), 300)
  const fromSlug = postingFromSlug(url, locationHint)
  // Posting pages often carry the board's generic search title; then the address names the job better.
  const generic = /\bjobs\s+in\b|\bvacancies\b|\bopenings\b/i.test(pageTitle)
  const parsed = generic ? fromSlug : postingFromTitle(pageTitle, platform)
  const company = clean(parsed.company || fromSlug.company, 100)
  if (!company) return null
  return { platform, url, title: clean(parsed.title || fromSlug.title, 140), company, location: clean(parsed.location || fromSlug.location, 100), experience: fromSlug.experience, snippet }
}

export const TAVILY_SITES = Object.freeze({ naukri: 'naukri.com', indeed: 'in.indeed.com', internshala: 'internshala.com' })

export async function searchTavily({ query, platform, location = '' }, { apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new JobSourceError('tavily', 'is not configured')
  const body = await getJson('tavily', 'https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, include_domains: [TAVILY_SITES[platform]], max_results: 10, search_depth: 'basic', topic: 'general' })
  }, fetchImpl)
  return (Array.isArray(body.results) ? body.results : []).map(result => normalizeTavilyResult(result, platform, location)).filter(Boolean)
}

// Board listing pages, read whole through context.dev: one page lists 15–40 postings with their company, place,
// experience and often pay and skills, which a web search can't give (it mostly returns these pages, not postings).
const slugOf = text => String(text ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
// Internshala spells some cities the older way.
const INTERNSHALA_CITY = { bengaluru: 'bangalore', gurugram: 'gurgaon', mysuru: 'mysore' }
// datePosted → the boards' "posted within N days" filters.
const DAYS = { today: 1, '3days': 3, week: 7, month: 30 }

/** The board's own search page for this role, place and date range. */
export function boardListingUrl(platform, { role, location = '', remote = false, datePosted = 'month' }) {
  const roleSlug = slugOf(role)
  const city = slugOf(String(location).split(',')[0])
  const days = DAYS[datePosted]
  if (platform === 'naukri') {
    const url = new URL(remote ? `https://www.naukri.com/${roleSlug}-jobs` : `https://www.naukri.com/${roleSlug}-jobs${city ? `-in-${city}` : ''}`)
    if (remote) url.searchParams.set('wfhType', '2')
    if (days) url.searchParams.set('jobAge', String(days))
    return url.href
  }
  if (platform === 'indeed') {
    const url = new URL('https://in.indeed.com/jobs')
    url.searchParams.set('q', role)
    url.searchParams.set('l', remote ? 'Remote' : String(location))
    if (days) url.searchParams.set('fromage', String(days))
    return url.href
  }
  if (platform === 'internshala') {
    const where = remote ? 'work-from-home/' : city ? `jobs-in-${INTERNSHALA_CITY[city] ?? city}/` : ''
    return `https://internshala.com/jobs/keywords-${roleSlug}/${where}`
  }
  throw new JobSourceError('listing', `has no page for ${platform}`)
}

const LISTING_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    jobs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          company: { type: ['string', 'null'] },
          location: { type: ['string', 'null'] },
          experience: { type: ['string', 'null'] },
          salary: { type: ['string', 'null'] },
          skills: { type: 'array', items: { type: 'string' } },
          url: { type: ['string', 'null'] }
        },
        required: ['title']
      }
    }
  },
  required: ['jobs']
})
const LISTING_INSTRUCTIONS = 'Extract every individual job card in the search results on this page, in page order. url is the absolute link to that single job posting, exactly as it appears on the page. skills are the skill tags or keywords shown on the card. Leave a field null when the card does not show it. Skip ads, filters, and "similar jobs" or "recommended" sections.'
// Pay wording that says nothing ("Not disclosed") is dropped so the card can show an estimate instead.
const VAGUE_PAY = /not disclosed|competitive|as per|negotiable|unpaid|best in industry/i
// How each board's page is read. Naukri draws its cards with scripts after the page loads, and context.dev's saved copy
// can be one caught before they appeared, so Naukri is always read fresh after a short wait. Others may come from a
// copy under 6 hours old.
const LISTING_READ = { naukri: { waitForMs: 4000, maxAgeMs: 0 }, indeed: { maxAgeMs: 6 * 3600_000 }, internshala: { maxAgeMs: 6 * 3600_000 } }
const BOARD_HOSTS = { naukri: /(^|\.)naukri\.com$/, indeed: /(^|\.)indeed\.com$/, internshala: /(^|\.)internshala\.com$/ }

/**
 * One job card from a listing page → a web posting, or null. Cards need a company and a link on the board itself,
 * and their title must share a word with the searched role (boards pad thin results with unrelated jobs).
 */
export function normalizeListingJob(job, platform, role) {
  let url = null
  try {
    const parsed = new URL(String(job?.url ?? ''))
    // Indeed's card links are click trackers; the posting's own address (by its jk id) stays valid for saved jobs.
    const jk = platform === 'indeed' ? parsed.searchParams.get('jk') : null
    if (parsed.protocol === 'https:' && BOARD_HOSTS[platform]?.test(parsed.hostname)) url = jk && /^[a-f0-9]{8,32}$/i.test(jk) ? `https://${parsed.hostname}/viewjob?jk=${jk}` : parsed.href
  } catch { /* no usable link */ }
  const title = clean(job?.title, 140)
  const company = clean(job?.company, 100)
  if (!url || !title || !company || titleFit(role, title) === 0) return null
  const salary = clean(job.salary, 60)
  const skills = (Array.isArray(job.skills) ? job.skills : []).map(skill => clean(skill, 40)).filter(Boolean).slice(0, 12)
  return {
    platform, url, title, company,
    location: clean(job.location, 100),
    experience: clean(job.experience, 40),
    payText: salary && !VAGUE_PAY.test(salary) && /\d/.test(salary) ? salary : '',
    skills,
    snippet: skills.length ? `Skills: ${skills.join(', ')}` : ''
  }
}

/**
 * Whether the page's own text links to this posting. The extraction is done by a model, which can invent a link, so
 * the posting's id (Indeed's jk, else the address's last part) must appear on the page. Indeed's real cards link
 * through its click tracker (rc/clk or pagead/clk); it also plants copies of cards that link straight to a made-up
 * id to catch scrapers, and those are left out.
 */
export function linkedOnPage(url, pageText, platform = '') {
  if (!pageText) return true
  try {
    const parsed = new URL(url)
    const jk = parsed.searchParams.get('jk')
    if (platform === 'indeed') return Boolean(jk) && pageText.includes(`clk?jk=${jk}`)
    const id = jk || parsed.pathname.split('/').filter(Boolean).at(-1)
    return Boolean(id) && pageText.includes(id)
  } catch {
    return false
  }
}

/** Every posting on the board's listing page for this search, through context.dev. */
export async function readBoardListing({ platform, role, location, remote, datePosted }, { apiKey, fetchImpl = fetch }) {
  const url = boardListingUrl(platform, { role, location, remote, datePosted })
  let data
  let markdown
  try {
    ({ data, markdown } = await scrapeJson({ url, schema: LISTING_SCHEMA, instructions: LISTING_INSTRUCTIONS, markdown: true, ...LISTING_READ[platform] }, { apiKey, fetchImpl, timeoutMs: TIMEOUT_MS.listing }))
  } catch (error) {
    throw new JobSourceError('listing', error instanceof ContextDevError ? error.message : 'failed')
  }
  // Each posting once, by address and by what the card shows (boards repeat promoted cards further down).
  const seen = new Set()
  const once = item => {
    const keys = [item.url, `${item.title}|${item.company}|${item.location}`.toLowerCase()]
    if (keys.some(key => seen.has(key))) return false
    keys.forEach(key => seen.add(key))
    return true
  }
  const postings = (Array.isArray(data.jobs) ? data.jobs : [])
    .map(job => normalizeListingJob(job, platform, role))
    .filter(item => item && linkedOnPage(item.url, markdown, platform) && once(item))
  // An empty read is usually a page caught before its cards drew; it fails so a web search of the board stands in
  // and nothing empty is cached.
  if (!postings.length) throw new JobSourceError('listing', 'found no postings on the page')
  return postings
}
