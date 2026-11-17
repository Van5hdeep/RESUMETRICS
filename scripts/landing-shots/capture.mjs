// Captures the landing-page screenshots from the harness (vite.config.js here, http://localhost:5198) with headless
// Chrome over the DevTools protocol, into public/landing/shots/*.webp. Start the harness first, then:
//   node scripts/landing-shots/capture.mjs [only-these names…]
// NIMBUS, job tailoring and the cover letter call the real AI provider, with pauses so its per-minute limit holds.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openPage, sleep } from './cdp.mjs'

const BASE = process.env.SHOTS_BASE ?? 'http://localhost:5198'
const OUT = fileURLToPath(new URL('../../public/landing/shots/', import.meta.url))
const PORT = 9333
const VIEW = { width: 1440, height: 900, deviceScaleFactor: 1.5 }
// The server allows 8,000 AI tokens a minute (the Groq free tier) and a NIMBUS turn uses up to ~7,000.
const AI_COOLDOWN_MS = Number(process.env.SHOTS_AI_COOLDOWN ?? 65_000)
const only = new Set(process.argv.slice(2))

const JOB_POST = `Full Stack Developer — Lumen Payments, Pune (Hybrid)

About the role
Lumen Payments builds checkout and billing tools for 4,000 Indian merchants. We are hiring a Full Stack Developer to build merchant-facing dashboards and the APIs behind them.

What you will do
- Build responsive dashboards in React and TypeScript
- Design REST APIs and background jobs in Node.js
- Model data in PostgreSQL and cache hot paths with Redis
- Ship features behind CI/CD pipelines and write unit tests with Jest
- Containerise services with Docker and deploy on AWS

Requirements
- 1-3 years of experience building web applications
- Strong JavaScript and TypeScript, React and Node.js
- Experience with PostgreSQL, Redis and Docker
- Familiarity with GraphQL and Kubernetes is a plus
- Clear communication and a habit of writing tests`
const LETTER_JOB = 'Full Stack Developer at Lumen Payments, Pune. Build React and TypeScript dashboards and Node.js APIs with PostgreSQL, Redis and Docker for 4,000 merchants. 1-3 years of experience.'

const page = await openPage({ port: PORT, viewport: VIEW })
const { evaluate, waitFor } = page
const goto = (path, ready) => page.goto(`${BASE}${path}`, ready)
// Client-side route change, so the open resume and its state stay.
const route = path => evaluate(`history.pushState({}, '', '${path}'); dispatchEvent(new PopStateEvent('popstate'))`)
const click = text => evaluate(`const el = [...document.querySelectorAll('button, a, [role=tab]')].find(node => (node.getAttribute('aria-label') || node.textContent).trim() === ${JSON.stringify(text)}); if (!el) throw new Error('No button: ' + ${JSON.stringify(text)}); el.click()`)
const fill = (selector, value) => evaluate(`const el = document.querySelector(${JSON.stringify(selector)}); const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true }))`)
const scrollTo = selector => evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -24)`)

mkdirSync(OUT, { recursive: true })
let lastAi = 0
async function aiPause() {
  const wait = lastAi + AI_COOLDOWN_MS - Date.now()
  if (wait > 0) { console.log(`  waiting ${Math.ceil(wait / 1000)} s for the AI limit`); await sleep(wait) }
  lastAi = Date.now()
}
async function shot(name) {
  if (only.size && !only.has(name)) return
  await sleep(700)
  writeFileSync(join(OUT, `${name}.webp`), await page.screenshot())
  console.log(`✓ ${name}`)
}
const wants = (...names) => !only.size || names.some(name => only.has(name))

try {
  // Dashboard, then the editor with the first resume.
  await goto('/dashboard', `document.querySelector('.dashboard-project-select')`)
  await evaluate(`document.querySelector('.dashboard-project-select').click()`)
  await shot('dashboard')
  await click('Open')
  await waitFor(`document.querySelector('.resume-page-document') && location.pathname === '/workspace/editor'`, 'editor')
  await evaluate('await document.fonts.ready')
  await sleep(1500)
  await shot('editor')

  if (wants('nimbus')) {
    await aiPause()
    await fill('.ai-rail textarea', 'Make my summary sharper and lead with my strongest result')
    await click('Send')
    await waitFor(`!document.querySelector('.ai-rail [aria-busy="true"]') && /summary|Updated|rewrote|Done/i.test(document.querySelector('.ai-rail').innerText.split('strongest result')[1] ?? '')`, 'NIMBUS reply', 90_000)
    await shot('nimbus')
  }

  if (wants('tailor', 'tailor-keywords')) {
    await route('/workspace/tailor')
    await waitFor(`document.querySelector('.tailor-page textarea')`, 'tailor page')
    await fill('.tailor-page textarea', JOB_POST)
    await click('Find keywords')
    await waitFor(`[...document.querySelectorAll('.tailor-page button')].some(b => b.textContent.trim() === 'Score my resume')`, 'keywords')
    await shot('tailor-keywords')
    await aiPause()
    await click('Score my resume')
    // The report appears once the AI fixes (or their fallback) are back.
    await waitFor(`/of \\d+ keywords are on your resume/.test(document.querySelector('.tailor-page').innerText) && !/Preparing fixes/i.test(document.querySelector('.tailor-page').innerText)`, 'match report and fixes', 150_000)
    await sleep(2500)
    await shot('tailor')
  }

  if (wants('letter')) {
    await route('/workspace/letter')
    await waitFor(`[...document.querySelectorAll('textarea')].some(t => t.placeholder.startsWith('Paste the job post'))`, 'letter studio')
    // A short post: the letter prompt plus the full post would pass the free Groq tier's 8,000 tokens a minute.
    await evaluate(`const box = [...document.querySelectorAll('textarea')].find(t => t.placeholder.startsWith('Paste the job post')); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(box, ${JSON.stringify(LETTER_JOB)}); box.dispatchEvent(new Event('input', { bubbles: true }))`)
    await aiPause()
    await click('Write my cover letter')
    await waitFor(`/Letter guide\\s*[1-9]\\d* of \\d+ checks/.test(document.querySelector('.ai-rail').innerText)`, 'cover letter', 150_000)
    await sleep(1500)
    await shot('letter')
  }

  await route('/workspace/evidence')
  await waitFor(`document.querySelector('.tailor-page') && /CODE EVIDENCE/i.test(document.querySelector('.tailor-page').innerText)`, 'evidence')
  await shot('evidence')

  await goto('/templates', `document.querySelectorAll('.templates-grid li').length > 6`)
  await sleep(1500)
  await shot('templates')

  await goto('/jobs', `document.querySelector('.jobs-top')`)
  await sleep(1500)
  await shot('jobs')
  await scrollTo('.jobs-top')
  await shot('jobs-matches')
  await evaluate(`window.scrollTo(0, 0)`)
  await evaluate(`[...document.querySelectorAll('[role=tab]')].find(tab => tab.textContent.trim().startsWith('My applications')).click()`)
  await waitFor(`document.querySelector('.jobs-board')`, 'applications board')
  await scrollTo('.jobs-tabs')
  await shot('jobs-board')

  await goto('/plan', `document.querySelector('.plan-grid')`)
  await shot('plan')

  await goto('/workspace', `document.body.innerText.includes('Start a resume')`)
  await shot('start')

  await goto('/settings', `document.querySelector('.settings-plan-row')`)
  await shot('settings')

  // The HR portal, through its own "Explore the demo" workspace (made-up candidates, kept in the harness's memory).
  if (wants('hr-overview', 'hr-opening', 'hr-compare')) {
    await goto('/hr/login', `[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Explore the demo')`)
    await click('Explore the demo')
    await waitFor(`location.pathname === '/hr' && document.querySelector('.hr-figures') && !document.querySelector('.hr-loading')`, 'HR overview')
    await sleep(800)
    await shot('hr-overview')
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Review').click()`)
    await waitFor(`document.querySelector('.hr-table--ranked tbody tr') && document.querySelector('.hr-scatter')`, 'HR opening')
    await sleep(1200)
    await shot('hr-opening')
    await scrollTo('.hr-scatter')
    await shot('hr-compare')
  }
} finally {
  page.close()
}
