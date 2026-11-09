// Job tracker search, in two parts so neither runs past the 60 s serverless limit:
//   1. fetchFresh: resume → search terms → JSearch (Google Jobs, which also fills LinkedIn) and salary estimates.
//   2. fetchBoard, once per board in WEB_BOARDS and in its own request: that board's listing page read through
//      context.dev, or a Tavily web search of the board when context.dev is not set up or fails.
// Every posting is scored against the resume (shared/jobMatch.js) and given a salary: the posted pay, or else a
// Glassdoor median for that company, or for the role in that city. Raw results are cached per set of search terms
// (and per board), so the same search by anyone in the next few hours costs no API calls; scoring is always redone.
import { env } from '../config/env.js'
import { PLATFORMS, formatPay, scoreJob } from '../../shared/jobMatch.js'
import { jobKeyOf, jobStore } from '../db/jobStore.js'
import { JobSourceError, TAVILY_SITES, estimateSalary, readBoardListing, searchJSearch, searchTavily } from './sources.js'

/** Boards read one at a time after the main search (their listing pages, or a web search of them). */
export const WEB_BOARDS = Object.freeze(Object.keys(TAVILY_SITES))
export const boardLabel = platform => TAVILY_SITES[platform] ?? platform
const FALLBACK_BUDGET_MS = 35_000

export class JobSearchError extends Error {
  constructor(message) {
    super(message)
    this.name = 'JobSearchError'
  }
}

/** JSON round trip: Firestore refuses `undefined`. */
const plain = value => JSON.parse(JSON.stringify(value))
const SALARY_CACHE_MS = 30 * 24 * 3600_000
/** Company salary lookups per fresh search, for the best-matching companies without posted pay. */
export const COMPANY_SALARY_LOOKUPS = 6
export const MIN_COMPANY_SALARIES = 3
const companyKey = company => company.trim().toLowerCase()

export function searchQueries(profile) {
  const where = profile.remote ? 'remote' : `in ${profile.location}`
  // Google Jobs (behind JSearch) answers "via LinkedIn" with LinkedIn postings only, which fills the LinkedIn row.
  return { jsearch: `${profile.role} ${where}`, linkedin: `${profile.role} ${where} via LinkedIn`, web: `${profile.role} job ${where}` }
}

export function cacheKeyOf(profile) {
  const { jsearch } = searchQueries(profile)
  return jobKeyOf(JSON.stringify({ v: 3, query: jsearch.toLowerCase(), remote: profile.remote, datePosted: profile.datePosted }))
}

export function boardKeyOf(profile, platform) {
  const { jsearch } = searchQueries(profile)
  return jobKeyOf(JSON.stringify({ v: 1, board: platform, query: jsearch.toLowerCase(), remote: profile.remote, datePosted: profile.datePosted }))
}

/** { text, kind: 'posted' | 'company' | 'market', note } for a card, or null when nothing is known. */
export function salaryFor(job, salaries = {}, profile) {
  if (job.pay) return { text: formatPay(job.pay), kind: 'posted', note: 'Pay listed in the posting' }
  if (job.payText) return { text: job.payText, kind: 'posted', note: 'Pay listed in the posting' }
  const company = job.company ? salaries.companies?.[companyKey(job.company)] : null
  if (company) return { text: formatPay({ min: company.median, period: company.period }), kind: 'company', note: `Typical pay for a ${profile.role} at ${job.company} (${company.source} median)` }
  const market = salaries.market
  if (market) return { text: formatPay({ min: market.median, period: market.period }), kind: 'market', note: `Typical pay for a ${profile.role} in ${profile.location} (${market.source} median${market.count ? ` of ${market.count.toLocaleString('en-IN')} salaries` : ''})` }
  return null
}

/**
 * Rows in PLATFORMS order, each { platform, name, jobs[] }. A posting listed on several boards appears in each of
 * their rows with that board's apply link. Board postings are scored on the skills their card lists; ones found by
 * web search have only a short snippet, so they get no score.
 */
export function buildRows(profile, { jobs = [], web = [], salaries = {} }) {
  const rows = new Map(PLATFORMS.map(platform => [platform.id, { platform: platform.id, name: platform.name, jobs: [] }]))
  for (const job of jobs) {
    const fit = scoreJob(profile, job)
    const card = {
      key: jobKeyOf(job.id), title: job.title, company: job.company, logo: job.logo, location: job.location, remote: job.remote, type: job.type, experience: '',
      postedAt: job.postedAt, salary: salaryFor(job, salaries, profile), snippet: job.description.slice(0, 220), score: fit.score, matched: fit.matched, missing: fit.missing, source: 'jsearch'
    }
    for (const option of job.applyOptions) rows.get(option.platform)?.jobs.push({ ...card, platform: option.platform, url: option.url })
  }
  for (const item of web) {
    const fit = item.skills?.length ? scoreJob(profile, { title: item.title, description: item.skills.join(', '), qualifications: item.experience ?? '' }) : null
    rows.get(item.platform)?.jobs.push({
      key: jobKeyOf(item.url), title: item.title, company: item.company, logo: '', location: item.location, remote: /remote|work from home/i.test(item.location), type: '', experience: item.experience,
      postedAt: null, salary: salaryFor(item, salaries, profile), snippet: item.snippet.slice(0, 220), score: fit?.score ?? null,
      matched: fit?.matched ?? profile.skills.filter(skill => item.snippet.toLowerCase().includes(skill.toLowerCase())).slice(0, 6), missing: fit?.missing ?? [], source: 'web', platform: item.platform, url: item.url
    })
  }
  return [...rows.values()]
    .map(row => {
      const seen = new Set()
      const unique = row.jobs.filter(job => !seen.has(job.key) && seen.add(job.key))
      unique.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
      return { ...row, jobs: unique }
    })
    .filter(row => row.jobs.length)
}

/**
 * The last search with one board's row merged in: its postings join any that JSearch already put in that row (each
 * once, best match first), the board leaves pendingBoards, and a board that could not be read joins failures.
 */
export function mergeBoardRow(search, platform, row, failed = false) {
  const rows = (search.rows ?? []).filter(item => item.platform !== platform)
  const existing = (search.rows ?? []).find(item => item.platform === platform)
  const seen = new Set()
  const jobs = [...(row?.jobs ?? []), ...(existing?.jobs ?? [])].filter(job => !seen.has(job.key) && seen.add(job.key))
  jobs.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  if (jobs.length) {
    const order = PLATFORMS.map(item => item.id)
    rows.push({ platform, name: row?.name ?? existing?.name ?? PLATFORMS.find(item => item.id === platform)?.name ?? platform, jobs })
    rows.sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform))
  }
  const label = boardLabel(platform)
  const failures = (search.failures ?? []).filter(item => item !== label)
  if (failed) failures.push(label)
  return { ...search, rows, failures, pendingBoards: (search.pendingBoards ?? []).filter(item => item !== platform) }
}

export function createJobSearch({ store = jobStore, config = env.jobs, fetchImpl = fetch } = {}) {
  const cacheMs = config.cacheHours * 3600_000
  const jsearch = { apiKey: config.jsearchKey, url: config.jsearchUrl, fetchImpl }

  /** Cached raw results for these terms, or null. A cache that can't be read just means a fresh search. */
  async function lookup(profile) {
    try {
      return await store.getCached(cacheKeyOf(profile), cacheMs)
    } catch (error) {
      console.error('Job cache could not be read:', error?.message)
      return null
    }
  }

  /** One salary estimate through the salary cache; null when unknown. Never throws: pay is a nice-to-have. */
  async function cachedEstimate(request) {
    const key = jobKeyOf(JSON.stringify({ v: 1, ...request, company: request.company ? companyKey(request.company) : '' }))
    try {
      const cached = await store.getSalary(key, SALARY_CACHE_MS)
      if (cached !== undefined) return cached
    } catch (error) {
      console.error('Salary cache could not be read:', error?.message)
    }
    try {
      const estimate = await estimateSalary(request, jsearch)
      store.putSalary(key, estimate).catch(error => console.error('Salary cache could not be written:', error?.message))
      return estimate
    } catch (error) {
      console.error('Salary estimate failed:', error?.message)
      return null
    }
  }

  /** The market median for the role here, and medians for the best-matching companies that don't list pay. */
  async function estimateSalaries(profile, jobs, web) {
    const location = profile.remote ? 'India' : `${profile.location}, India`
    const ranked = [...jobs.filter(job => !job.pay && !job.payText).map(job => ({ company: job.company, score: scoreJob(profile, job).score })), ...web.map(item => ({ company: item.company, score: 0 }))]
      .filter(item => item.company)
      .sort((a, b) => b.score - a.score)
    const companies = [...new Map(ranked.map(item => [companyKey(item.company), item.company])).values()].slice(0, COMPANY_SALARY_LOOKUPS)
    const [market, ...byCompany] = await Promise.all([
      cachedEstimate({ jobTitle: profile.role, location }),
      ...companies.map(company => cachedEstimate({ jobTitle: profile.role, location, company }))
    ])
    // A company median from one or two salaries says little; those cards show the role's median in the city instead.
    return { market, companies: Object.fromEntries(companies.map((company, index) => [companyKey(company), byCompany[index]]).filter(([, estimate]) => estimate?.count >= MIN_COMPANY_SALARIES)) }
  }

  /** Both JSearch queries; fails only when both fail. Complete results are cached. */
  async function fetchFresh(profile) {
    const queries = searchQueries(profile)
    const options = { datePosted: profile.datePosted, remote: profile.remote }
    const settled = await Promise.allSettled([
      searchJSearch({ query: queries.jsearch, ...options, pages: 2 }, jsearch),
      searchJSearch({ query: queries.linkedin, ...options, pages: 1 }, jsearch)
    ])
    const labels = ['LinkedIn, Glassdoor and other boards', 'LinkedIn']
    const failures = []
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') return
      console.error(`Job source ${labels[index]} failed:`, result.reason instanceof JobSourceError ? result.reason.message : result.reason?.message)
      if (!failures.includes(labels[index])) failures.push(labels[index])
    })
    if (failures.length && settled.every(result => result.status === 'rejected')) throw new JobSearchError('Job boards could not be reached right now. Please try again in a few minutes.')
    const value = index => (settled[index].status === 'fulfilled' ? settled[index].value : [])
    const jobs = [...new Map([...value(0), ...value(1)].map(job => [job.id, job])).values()]
    const raw = plain({ jobs, web: [], salaries: await estimateSalaries(profile, jobs, []), failures })
    if (!failures.length) store.putCached(cacheKeyOf(profile), raw).catch(error => console.error('Job cache could not be written:', error?.message))
    return raw
  }

  /** Whether any board can be read at all (a listing page or a web search). */
  const boardsAvailable = () => Boolean(config.contextDevKey || config.tavilyKey)

  /** A board's cached postings for these terms ({ platform, web, source }), or null. */
  async function lookupBoard(profile, platform) {
    try {
      return await store.getCached(boardKeyOf(profile, platform), cacheMs)
    } catch (error) {
      console.error('Board cache could not be read:', error?.message)
      return null
    }
  }

  /** The board's listing page, else a web search of it. Throws JobSearchError when neither answers. */
  async function fetchBoard(profile, platform) {
    let web = null
    let source = ''
    const started = Date.now()
    if (config.contextDevKey) {
      try {
        web = await readBoardListing({ platform, role: profile.role, location: profile.location, remote: profile.remote, datePosted: profile.datePosted }, { apiKey: config.contextDevKey, fetchImpl })
        source = 'listing'
      } catch (error) {
        console.error(`Listing page for ${boardLabel(platform)} failed:`, error?.message)
      }
    }
    // The fallback search takes up to 20 s; after a slow listing failure it would run past the 60 s request limit.
    if (!web && config.tavilyKey && Date.now() - started < FALLBACK_BUDGET_MS) {
      try {
        web = await searchTavily({ query: searchQueries(profile).web, platform, location: profile.location }, { apiKey: config.tavilyKey, fetchImpl })
        source = 'search'
      } catch (error) {
        console.error(`Web search of ${boardLabel(platform)} failed:`, error instanceof JobSourceError ? error.message : error?.message)
      }
    }
    if (!web) throw new JobSearchError(`${boardLabel(platform)} could not be reached right now.`)
    const raw = plain({ platform, web, source })
    store.putCached(boardKeyOf(profile, platform), raw).catch(error => console.error('Board cache could not be written:', error?.message))
    return raw
  }

  return { lookup, fetchFresh, boardsAvailable, lookupBoard, fetchBoard }
}

export const jobSearch = createJobSearch()
