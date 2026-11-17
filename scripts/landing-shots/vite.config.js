// Screenshot harness: the real app (index.html → src/main.jsx) with a demo user always signed in and a small
// in-memory API, so landing-page screenshots show the actual UI without a Google account or anyone's real data.
// NIMBUS and job tailoring use the real server routes (and the AI key in server/.env.local) for genuine answers.
//   npx vite --config scripts/landing-shots/vite.config.js      → http://localhost:5198
//   node scripts/landing-shots/capture.mjs                      → public/landing/shots/*.webp
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import express from 'express'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DEMO_USER, sampleEvidence, sampleResumes } from './sample.js'
import { DEFAULT_SETTINGS } from '../../server/db/userStore.js'
import nimbusRoutes from '../../server/routes/nimbus.routes.js'
import jdRoutes from '../../server/routes/jd.routes.js'
import { createHrRouter } from '../../server/routes/hr.routes.js'
import { createHrAuth } from '../../server/hr/hrAuth.js'
import { createHrStore } from '../../server/db/hrStore.js'
import { createFakeFirestore } from '../../tests/helpers/fakeFirestore.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const root = fileURLToPath(new URL('../..', import.meta.url))
const jobs = JSON.parse(readFileSync(`${here}jobs-fixture.json`, 'utf8'))

const firebaseMock = {
  name: 'landing-shots-firebase',
  enforce: 'pre',
  resolveId(source) {
    if (source === 'firebase/auth' || source === 'firebase/app') return `${here}mockFirebase.js`
  }
}

function demoApi() {
  // `uploaded` makes the editor show the sample photo instead of its "add a photo" placeholder.
  const presentationOf = resume => ({ template: resume.templateId, photo: { ...resume.data.photo, uploaded: true } })
  const resumes = new Map(sampleResumes.map(resume => [resume.id, { presentation: presentationOf(resume), confirmedSections: null, sourceFileName: 'Aarav_Mehta_Resume.pdf', parseMetadata: null, revision: 3, ...resume }]))
  const best = jobs.rows.flatMap(row => row.jobs).filter(job => job.score !== null).sort((a, b) => b.score - a.score)
  let saved = best.slice(0, 5).map((job, index) => ({
    key: job.key, title: job.title, company: job.company, location: job.location, logo: job.logo, url: job.url, platform: job.platform,
    type: job.type, salary: job.salary ? `${job.salary.text}${job.salary.kind === 'posted' ? '' : ' (est.)'}` : '', postedAt: job.postedAt, score: job.score,
    resumeId: sampleResumes[0].id, status: ['applied', 'interview', 'saved', 'applied', 'offer'][index], notes: index === 1 ? 'Technical round on Friday, 11:00' : '',
    savedAt: new Date(Date.now() - index * 86_400_000).toISOString()
  }))
  const api = express()
  api.use(express.json({ limit: '2mb' }))
  api.use((request, _response, next) => { request.firebaseUser = { uid: DEMO_USER.uid, email: DEMO_USER.email, name: DEMO_USER.displayName }; next() })

  api.get('/api/user/plan', (_request, response) => response.json({ ok: true, plan: { tier: 'pro', status: 'active', term: 'yearly', source: null, currentPeriodEnd: '2027-10-14T00:00:00.000Z' }, pro: true, resumes: { used: resumes.size, limit: null } }))
  api.get('/api/user/settings', (_request, response) => response.json({ ok: true, settings: { ...DEFAULT_SETTINGS, onboardingComplete: true } }))
  api.patch('/api/user/settings', (request, response) => response.json({ ok: true, settings: { ...DEFAULT_SETTINGS, ...request.body?.settings } }))
  api.get('/api/user/resumes', (_request, response) => response.json({ ok: true, resumes: [...resumes.values()] }))
  api.get('/api/user/resumes/:id', (request, response) => {
    const resume = resumes.get(request.params.id)
    return resume ? response.json({ ok: true, resume }) : response.status(404).json({ ok: false, code: 'not_found', error: 'Resume not found.' })
  })
  api.put('/api/user/resumes/:id', (request, response) => {
    const current = resumes.get(request.params.id)
    const revision = (current?.revision ?? 0) + 1
    const updatedAt = new Date().toISOString()
    resumes.set(request.params.id, { ...current, ...request.body?.fields, id: request.params.id, revision, updatedAt })
    response.json({ ok: true, resume: { id: request.params.id, revision, updatedAt } })
  })
  api.get('/api/user/resumes/:id/versions', (_request, response) => response.json({ ok: true, versions: [
    { id: '0001-auto', reason: 'auto', name: 'Full stack resume', revision: 2, progress: 83, createdAt: new Date(Date.now() - 5 * 3600_000).toISOString() },
    { id: '0002-manual', reason: 'manual', name: 'Full stack resume', revision: 1, progress: 67, createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() }
  ] }))
  api.get('/api/user/resumes/:id/evidence', (request, response) => response.json({ ok: true, evidence: { github: request.params.id === sampleResumes[0].id ? sampleEvidence : null } }))
  api.get('/api/github/status', (_request, response) => response.json({ ok: true, connection: { connected: true, githubLogin: 'aaravmehta' } }))

  api.get('/api/jobs/latest', (_request, response) => response.json({ ok: true, search: jobs, searchesLeft: 12, searchesPerDay: 15 }))
  api.post('/api/jobs/search', (_request, response) => response.json({ ok: true, search: jobs, searchesLeft: 11, searchesPerDay: 15 }))
  api.get('/api/jobs/saved', (_request, response) => response.json({ ok: true, jobs: saved }))
  api.put('/api/jobs/saved/:key', (request, response) => {
    const job = { ...request.body?.job, key: request.params.key, status: 'saved', notes: '', savedAt: new Date().toISOString() }
    saved = [job, ...saved.filter(item => item.key !== job.key)]
    response.json({ ok: true, job })
  })
  api.patch('/api/jobs/saved/:key', (request, response) => {
    saved = saved.map(item => (item.key === request.params.key ? { ...item, ...request.body } : item))
    response.json({ ok: true, job: saved.find(item => item.key === request.params.key) })
  })
  api.delete('/api/jobs/saved/:key', (request, response) => { saved = saved.filter(item => item.key !== request.params.key); response.json({ ok: true }) })

  // The HR portal's own "Explore the demo" workspace, kept in memory (the fake Firestore the tests use).
  const hrDb = createFakeFirestore()
  const pass = (_request, _response, next) => next()
  api.use('/api/hr', createHrRouter({ store: createHrStore({ getDb: () => hrDb, timestamp: hrDb.timestamp }), auth: createHrAuth({ accounts: [], secret: 'landing-shots' }), aiLimits: pass, aiBudget: pass, limitStore: () => undefined }))

  api.use('/api/nimbus', nimbusRoutes)
  api.use('/api/jd', jdRoutes)
  return api
}

export default defineConfig({
  root,
  plugins: [firebaseMock, react(), tailwindcss(), { name: 'landing-shots-api', configureServer(server) { server.middlewares.use(demoApi()) } }],
  optimizeDeps: { exclude: ['firebase'] },
  server: { port: 5198, strictPort: true }
})
