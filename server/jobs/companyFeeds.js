// "Company websites" row: openings straight from employers' own job boards on Greenhouse, Lever and Ashby. Their job
// feeds are free, public and exact (no scraping, no credits), so this board costs nothing but a few seconds. The
// companies are a checked list of employers hiring in India, plus any a web search of those job boards turns up.
import { relatedRoles, titleFit } from '../../shared/jobMatch.js'

/** Employers with India openings on each job board, checked by hand: slug → display name. */
export const COMPANY_FEEDS = Object.freeze({
  greenhouse: { okta: 'Okta', databricks: 'Databricks', mongodb: 'MongoDB', inmobi: 'InMobi', stripe: 'Stripe', gitlab: 'GitLab', rubrik: 'Rubrik', glance: 'Glance', hackerrank: 'HackerRank', elastic: 'Elastic', twilio: 'Twilio', druva: 'Druva', groww: 'Groww', figma: 'Figma' },
  lever: { paytm: 'Paytm', zeta: 'Zeta', cred: 'CRED' },
  ashby: { tekion: 'Tekion', sarvam: 'Sarvam AI', bureau: 'Bureau', snowflake: 'Snowflake' }
})
const FEED_TIMEOUT_MS = 12_000
/** Greenhouse lists have no description; this many of the best matches get theirs fetched, for scoring. */
export const GREENHOUSE_DETAILS = 12
/** At most this many employers found by web search are read on top of the checked list. */
const DISCOVERED_LIMIT = 8
const DAYS = { today: 1, '3days': 3, week: 7, month: 30 }
// Cities by their other spellings, so "Bengaluru" finds "Bangalore, KA".
const CITY_ALIASES = [['bengaluru', 'bangalore'], ['gurugram', 'gurgaon'], ['mumbai', 'bombay'], ['chennai', 'madras'], ['kolkata', 'calcutta'], ['delhi', 'new delhi', 'ncr', 'noida', 'gurugram', 'gurgaon']]

const clean = (value, max = 200) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const stripHtml = html => String(html ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&amp;|&#\d+;|&[a-z]+;/g, ' ')
const titleCase = text => text.replace(/\b[a-z]/g, letter => letter.toUpperCase())

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(FEED_TIMEOUT_MS), headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`answered ${response.status}`)
  return response.json()
}

/** Whether a posting's place fits the search: the city (any spelling), or for remote searches remote work in India. */
export function placeFits(place, { location = '', remote = false }) {
  const text = String(place ?? '').toLowerCase()
  // A bare "Remote" from a global employer is often one country only, so remote openings must name India.
  if (remote) return /remote|anywhere|work from home/.test(text) && /india/.test(text)
  const city = String(location).split(',')[0].trim().toLowerCase()
  if (!city || city === 'india') return /india|bengaluru|bangalore|mumbai|pune|hyderabad|gurugram|gurgaon|delhi|noida|chennai|kolkata|ahmedabad/.test(text)
  const spellings = CITY_ALIASES.find(group => group.includes(city)) ?? [city]
  return spellings.some(name => text.includes(name))
}

// Words every tech title shares; a title matching only these ("Senior Software Engineer") says nothing about the work.
const GENERIC = new Set(['engineer', 'engineering', 'developer', 'development', 'software', 'sde', 'programmer', 'staff', 'principal', 'senior', 'sr', 'junior', 'lead', 'associate', 'specialist', 'member', 'technical', 'and', 'of', 'the', 'ii', 'iii', 'i'])
/** One spelling for compound titles: "Full-Stack", "Full Stack" → "fullstack"; likewise front end and back end. */
const compact = text => String(text ?? '').replace(/full[\s-]?stack/gi, 'fullstack').replace(/front[\s-]?end/gi, 'frontend').replace(/back[\s-]?end/gi, 'backend')
const words = text => compact(text).toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').split(' ').filter(Boolean)

/**
 * Best title match against the role or one of its related titles (0–1). When those titles have specific words
 * ("react", "frontend", "data"), the job's title must contain one of them, so generic engineering titles don't pass.
 */
export function roleFit(role, title) {
  const wanted = [role, ...relatedRoles(role)].map(compact)
  const specific = new Set(wanted.flatMap(words).filter(word => !GENERIC.has(word)))
  const have = words(title)
  if (specific.size && !have.some(word => specific.has(word) || specific.has(word.replace(/s$/, '')))) return 0
  return Math.max(...wanted.map(item => titleFit(item, compact(title))))
}

/** "Bangalore, India, India" → "Bangalore, India". */
const uniquePlaces = parts => [...new Map(parts.flatMap(part => String(part ?? '').split(',')).map(part => part.trim()).filter(Boolean).map(part => [part.toLowerCase(), part])).values()].join(', ')

/** Postings from one employer's feed, as plain rows: { title, company, location, url, postedAt, description, remote }. */
export async function readFeed(ats, slug, name, { fetchImpl = fetch } = {}) {
  if (ats === 'greenhouse') {
    const body = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs`, fetchImpl)
    return (Array.isArray(body.jobs) ? body.jobs : []).map(job => ({
      ats, slug, id: job.id, title: clean(job.title, 140), company: clean(job.company_name, 100) || name, location: clean(uniquePlaces([job.location?.name]), 100),
      url: job.absolute_url, postedAt: job.first_published || job.updated_at || null, description: '', remote: /remote/i.test(job.location?.name ?? '')
    }))
  }
  if (ats === 'lever') {
    const body = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`, fetchImpl)
    return (Array.isArray(body) ? body : []).map(job => {
      const places = [job.categories?.location, ...(job.categories?.allLocations ?? []), job.workplaceType === 'remote' ? 'remote' : '', job.country === 'IN' ? 'india' : ''].filter(Boolean)
      return {
        ats, slug, id: job.id, title: clean(/[A-Z]/.test(job.text ?? '') ? job.text : titleCase(String(job.text ?? '')), 140), company: name, location: clean(titleCase(uniquePlaces(places)), 100),
        url: job.hostedUrl, postedAt: Number.isFinite(job.createdAt) ? new Date(job.createdAt).toISOString() : null,
        description: clean(`${job.descriptionPlain ?? ''} ${job.descriptionBodyPlain ?? ''} ${(job.lists ?? []).map(list => `${list.text} ${stripHtml(list.content)}`).join(' ')}`, 3000),
        remote: job.workplaceType === 'remote'
      }
    })
  }
  if (ats === 'ashby') {
    const body = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`, fetchImpl)
    return (Array.isArray(body.jobs) ? body.jobs : []).filter(job => job.isListed !== false).map(job => ({
      ats, slug, id: job.id, title: clean(job.title, 140), company: name,
      location: clean(uniquePlaces([job.location, ...(job.secondaryLocations ?? []).map(item => item.location), job.address?.postalAddress?.addressCountry]), 100),
      url: job.jobUrl, postedAt: job.publishedAt ?? null, description: clean(job.descriptionPlain, 3000), remote: Boolean(job.isRemote),
      payText: clean(job.compensation?.scrapeableCompensationSalarySummary, 60)
    }))
  }
  throw new Error(`unknown job board ${ats}`)
}

const ATS_HOSTS = [[/(^|\.)greenhouse\.io$/, 'greenhouse'], [/^jobs\.lever\.co$/, 'lever'], [/^jobs\.ashbyhq\.com$/, 'ashby']]

/** Employers on these job boards that a web search finds for the role: [{ ats, slug, name }], or [] on any failure. */
export async function discoverCompanies(profile, { tavilyKey, fetchImpl = fetch } = {}) {
  if (!tavilyKey) return []
  const where = profile.remote ? 'remote India' : `${profile.location} India`
  try {
    const response = await fetchImpl('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tavilyKey}` },
      body: JSON.stringify({ query: `${profile.role} ${where}`, include_domains: ['job-boards.greenhouse.io', 'boards.greenhouse.io', 'jobs.lever.co', 'jobs.ashbyhq.com'], max_results: 20, search_depth: 'basic' }),
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS)
    })
    if (!response.ok) return []
    const body = await response.json()
    const found = new Map()
    for (const result of Array.isArray(body.results) ? body.results : []) {
      try {
        const url = new URL(result.url)
        const ats = ATS_HOSTS.find(([pattern]) => pattern.test(url.hostname))?.[1]
        const slug = url.pathname.split('/').filter(Boolean)[0]?.toLowerCase()
        if (ats && slug && /^[a-z0-9-]{2,60}$/.test(slug) && !COMPANY_FEEDS[ats][slug]) found.set(`${ats}:${slug}`, { ats, slug, name: titleCase(slug.replace(/-/g, ' ')) })
      } catch { /* not a job board address */ }
    }
    return [...found.values()].slice(0, DISCOVERED_LIMIT)
  } catch {
    return []
  }
}

/**
 * Matching openings across the employers' feeds, as web postings for the "Company websites" row: the place and dates
 * fit the search and the title matches the role or a related title. Greenhouse's best matches get their description
 * fetched so they can be scored. A feed that fails is skipped; throws only when every feed fails.
 */
export async function searchCompanyFeeds(profile, { tavilyKey = '', fetchImpl = fetch, now = () => Date.now(), feeds = COMPANY_FEEDS } = {}) {
  const listed = Object.entries(feeds).flatMap(([ats, companies]) => Object.entries(companies).map(([slug, name]) => ({ ats, slug, name })))
  const companies = [...listed, ...await discoverCompanies(profile, { tavilyKey, fetchImpl })]
  const settled = await Promise.allSettled(companies.map(({ ats, slug, name }) => readFeed(ats, slug, name, { fetchImpl })))
  if (settled.every(result => result.status === 'rejected')) throw new Error('no company job board answered')
  const days = DAYS[profile.datePosted]
  const oldest = days ? now() - days * 86_400_000 : -Infinity
  const matches = settled.flatMap(result => (result.status === 'fulfilled' ? result.value : []))
    .filter(job => job.title && /^https:\/\//.test(job.url ?? '') && placeFits(job.location, profile) && (!job.postedAt || Date.parse(job.postedAt) >= oldest))
    .map(job => ({ ...job, fit: roleFit(profile.role, job.title) }))
    .filter(job => job.fit >= .5)
    .sort((a, b) => b.fit - a.fit)
  // Descriptions for the best Greenhouse matches (one request each, all at once).
  const needDetail = matches.filter(job => job.ats === 'greenhouse').slice(0, GREENHOUSE_DETAILS)
  await Promise.all(needDetail.map(async job => {
    try {
      const detail = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(job.slug)}/jobs/${encodeURIComponent(job.id)}`, fetchImpl)
      job.description = clean(stripHtml(detail.content), 3000)
    } catch { /* scored on the title alone */ }
  }))
  return matches.map(job => ({
    platform: 'company', url: job.url, title: job.title, company: job.company, location: job.location, experience: '',
    payText: job.payText ?? '', skills: [], snippet: clean(job.description, 300), description: job.description, postedAt: job.postedAt, remote: job.remote
  }))
}
