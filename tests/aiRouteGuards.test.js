import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

// Every API route that can reach the AI model must sit behind sign-in, the per-user limits, the daily token
// allowance and usage tracking. This test finds those routes from the import graph (so a new AI route can't be
// forgotten) and checks how server/index.js mounts each one.
const root = resolve(import.meta.dirname, '..')
const AI_ENTRY = ['server/ai/runTask.js', 'server/services/aiClient.js'].map(file => resolve(root, file))

const files = []
const walk = directory => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) { if (name !== 'evals') walk(path) } else if (/\.(m?js)$/.test(name) && !name.endsWith('.test.js')) files.push(path)
  }
}
walk(resolve(root, 'server'))
walk(resolve(root, 'shared'))

const importsOf = new Map(files.map(file => {
  const source = readFileSync(file, 'utf8')
  const targets = [...source.matchAll(/(?:import|export)[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/g)].map(match => resolve(dirname(file), match[1]))
  return [file, targets]
}))
const reachesAi = new Map()
const reaches = (file, seen = new Set()) => {
  if (AI_ENTRY.includes(file)) return true
  if (reachesAi.has(file)) return reachesAi.get(file)
  if (seen.has(file)) return false
  seen.add(file)
  const result = (importsOf.get(file) ?? []).some(target => reaches(target, seen))
  reachesAi.set(file, result)
  return result
}

const routeFiles = files.filter(file => file.includes(`${join('server', 'routes')}`))
const aiRoutes = routeFiles.filter(file => reaches(file)).map(file => relative(root, file).replaceAll('\\', '/'))
// Sanity: the scan finds the routes we know call the model.
for (const known of ['server/routes/resume.routes.js', 'server/routes/nimbus.routes.js', 'server/routes/jd.routes.js', 'server/routes/github.routes.js', 'server/routes/hr.routes.js']) {
  assert.ok(aiRoutes.includes(known), `${known} should be detected as calling the AI model`)
}

const index = readFileSync(resolve(root, 'server/index.js'), 'utf8')
const mountOf = name => index.split('\n').find(line => /^app\.use\('\/api\//.test(line) && line.includes(name))

for (const route of aiRoutes) {
  const base = route.split('/').pop().replace('.routes.js', '')
  if (base === 'hr') {
    // The HR router guards its one AI route itself (checked by tests/hrSessions.test.js); check the wiring here.
    const hr = readFileSync(resolve(root, route), 'utf8')
    const upload = hr.split('\n').find(line => line.includes("router.post('/openings/:openingId/candidates',"))
    for (const guard of ['aiLimits', 'aiBudget', 'trackAiUsageFor']) assert.ok(upload?.includes(guard), `HR resume upload must use ${guard}`)
    assert.ok(hr.indexOf('router.use(auth.requireHr)') < hr.indexOf("router.post('/openings/:openingId/candidates',"), 'HR uploads need an HR session')
    continue
  }
  const line = mountOf(base === 'github' ? 'createGitHubRouter' : `${base}Routes`)
  assert.ok(line, `${route} must be mounted in server/index.js`)
  if (base === 'github') {
    for (const guard of ['userAiLimits', 'enforceDailyTokenBudget', 'trackAiUsage']) assert.ok(line.includes(guard), `GitHub evidence scan must get ${guard}`)
    const github = readFileSync(resolve(root, route), 'utf8')
    assert.match(github, /router\.post\('\/evidence-scan', authenticate, \.\.\.aiGuard,/, 'the evidence scan must run aiGuard after sign-in')
    continue
  }
  const order = ['requireUser', 'userAiLimits', 'enforceDailyTokenBudget', 'trackAiUsage', `${base}Routes`].map(name => line.indexOf(name))
  assert.ok(order.every(position => position > 0), `${route} must be mounted with requireUser, userAiLimits, enforceDailyTokenBudget and trackAiUsage`)
  assert.deepEqual([...order].sort((a, b) => a - b), order, `${route}: guards must run in order (sign-in, limits, allowance, tracking, router)`)
}

// Pro features stay behind the plan check.
assert.match(mountOf('jdRoutes'), /createRequirePro\(\{ feature: 'jobTailoring' \}\)/)
assert.match(mountOf('jobsRoutes'), /createRequirePro\(\{ feature: 'jobTracker' \}\)/)
// Hardening that must not quietly disappear.
assert.match(index, /app\.disable\('x-powered-by'\)/)
assert.match(index, /app\.use\(securityHeaders\)/)
assert.match(index, /app\.use\('\/api', \(_request, response\) => response\.status\(404\)/)

console.log(`aiRouteGuards: ${aiRoutes.length} AI routes checked`)
