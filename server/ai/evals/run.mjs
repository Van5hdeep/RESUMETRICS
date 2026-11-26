// AI evaluation harness. Usage:
//   npm run ai:eval -- --task nimbus|letter|jd-parse|jd-fixes|all [--model openai/gpt-oss-120b]
// Writes a Markdown report to .planning/evals/. Uses the API key in server/.env.local; data is synthetic.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const option = name => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : null }
const task = option('task') ?? 'all'
const model = option('model')
if (model) for (const key of ['RESUMETRICS_AI_MODEL_NIMBUS', 'RESUMETRICS_AI_MODEL_JD']) process.env[key] = model

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const { env } = await import('../../config/env.js')
const { planNimbusTurn } = await import('../../nimbus/nimbusEngine.js')
const { planLetterTurn } = await import('../../nimbus/letterEngine.js')
const { isGenericOpener } = await import('../../../shared/letterLint.js')
const { countWords } = await import('../../../shared/letterModel.js')
const { parseJobDescription, suggestFixes } = await import('../../jd/jdEngine.js')
const { extractJdKeywords, scoreKeywords } = await import('../../../shared/jdKeywords.js')
const { findInventedFacts, sourceTextOf } = await import('../../../shared/factGuard.js')
const { resume, elements, style, jobs, letters } = await import('./fixtures.js')
const { nimbusCases, letterCases, jdParseCases, jdFixCases } = await import('./cases.js')

const asList = value => Array.isArray(value) ? value : value == null ? [] : [value]
const numbersIn = text => (String(text).match(/\d[\d,.]*%?/g) ?? []).map(value => value.replace(/[,%.]+$/, ''))
const allText = turn => JSON.stringify(turn.steps ?? [])

async function timed(fn) {
  const started = Date.now()
  const attempts = []
  try {
    const value = await fn(attempt => attempts.push(attempt))
    return { value, ms: Date.now() - started, attempts }
  } catch (error) {
    return { error: error.message, ms: Date.now() - started, attempts }
  }
}

async function evalNimbus() {
  const rows = []
  for (const testCase of nimbusCases) {
    const context = { resumeData: resume, elements, style, elementOverrides: {}, selection: testCase.selection ?? null, conversation: [] }
    const run = await timed(onAttempt => planNimbusTurn({ instruction: testCase.instruction, context, onAttempt }))
    const turn = run.value
    const failures = []
    if (!turn) failures.push(`error: ${run.error}`)
    else {
      if (!asList(testCase.expect.mode).includes(turn.mode)) failures.push(`mode ${turn.mode}`)
      const ops = (turn.steps ?? []).flatMap(step => step.operations)
      const items = turn.items ?? []
      if (testCase.expect.minItems && items.length < testCase.expect.minItems) failures.push(`${items.length} items`)
      if (testCase.expect.minReady && items.filter(item => item.operations?.length).length < testCase.expect.minReady) failures.push('too few ready items')
      if (testCase.expect.itemOps && !items.some(item => (item.operations ?? []).some(op => testCase.expect.itemOps.includes(op.type)))) failures.push('no removal or trim item')
      if (testCase.expect.minSteps && (turn.steps ?? []).length < testCase.expect.minSteps) failures.push(`${(turn.steps ?? []).length} steps`)
      if (testCase.expect.ops && turn.mode === 'edit' && !testCase.expect.ops.some(type => ops.some(op => op.type === type))) failures.push(`missing op ${testCase.expect.ops.join('|')}`)
      if (testCase.expect.target && turn.mode === 'edit' && !ops.some(op => testCase.expect.target.test(op.target ?? ''))) failures.push('wrong target')
      if (testCase.expect.optionsKind && !asList(testCase.expect.optionsKind).includes(turn.options?.kind)) failures.push(`options ${turn.options?.kind}`)
      if (testCase.expect.noOps && ops.some(op => testCase.expect.noOps.includes(op.type) && /google/i.test(JSON.stringify(op)))) failures.push('invented employer')
      if (testCase.expect.noNewNumbers) {
        const invented = ops.flatMap(op => [op.value, ...(op.values ?? [])].filter(value => typeof value === 'string')).flatMap(text => findInventedFacts(text, sourceTextOf(resume, testCase.instruction)))
        if (invented.length) failures.push(`invented ${invented.map(item => item.value).join(',')}`)
      }
      if (testCase.expect.keepNumbers && turn.mode === 'edit' && !testCase.expect.keepNumbers.every(number => numbersIn(allText(turn)).includes(number))) failures.push('dropped a number')
      if (testCase.expect.mustContain && !allText(turn).includes(testCase.expect.mustContain)) failures.push(`missing "${testCase.expect.mustContain}"`)
      if (testCase.expect.mentions && !testCase.expect.mentions.test(turn.message ?? '')) failures.push('did not point to the Format panel')
      if (turn.repaired) failures.push('(repaired)')
    }
    const pass = failures.every(item => item === '(repaired)')
    rows.push({ id: testCase.id, pass, firstTry: run.attempts[0]?.ok === true, ms: run.ms, notes: failures.join('; ') || turn?.mode })
    process.stdout.write(pass ? '.' : 'F')
  }
  return rows
}

async function evalLetter() {
  const rows = []
  for (const testCase of letterCases) {
    const job = testCase.job ? { text: jobs[testCase.job], title: '', company: '' } : null
    const context = { document: 'letter', resumeData: resume, letter: letters[testCase.letter], job, elements: [], selection: null, conversation: [] }
    const run = await timed(onAttempt => planLetterTurn({ instruction: testCase.instruction, context, onAttempt }))
    const turn = run.value
    const failures = []
    if (!turn) failures.push(`error: ${run.error}`)
    else {
      const ops = (turn.steps ?? []).flatMap(step => step.operations)
      const written = ops.flatMap(op => op.type === 'replace_paragraphs' ? op.values : typeof op.text === 'string' ? [op.text] : [])
      if (!asList(testCase.expect.mode).includes(turn.mode)) failures.push(`mode ${turn.mode}`)
      if (testCase.expect.ops && turn.mode === 'edit' && !testCase.expect.ops.some(type => ops.some(op => op.type === type))) failures.push(`missing op ${testCase.expect.ops.join('|')}`)
      if (testCase.expect.noOps && ops.some(op => testCase.expect.noOps.includes(op.type))) failures.push('set a field it could not know')
      if (testCase.expect.mustContain && !JSON.stringify(ops).includes(testCase.expect.mustContain)) failures.push(`missing "${testCase.expect.mustContain}"`)
      if (testCase.expect.mentions && !testCase.expect.mentions.test(turn.message ?? '')) failures.push('did not point to the Format panel')
      if (testCase.expect.words && turn.mode === 'edit' && ops.some(op => op.type === 'replace_paragraphs')) {
        const total = written.reduce((sum, text) => sum + countWords(text), 0)
        if (total < testCase.expect.words[0] || total > testCase.expect.words[1]) failures.push(`${total} words`)
      }
      if (testCase.expect.noGenericOpener && written[0] && isGenericOpener(written[0])) failures.push('generic opener')
      if (testCase.expect.noNewNumbers) {
        const invented = written.flatMap(text => findInventedFacts(text, sourceTextOf(resume, testCase.instruction, job?.text, letters[testCase.letter])))
        if (invented.length) failures.push(`invented ${invented.map(item => item.value).join(',')}`)
      }
      if (turn.repaired) failures.push('(repaired)')
    }
    const pass = failures.every(item => item === '(repaired)')
    rows.push({ id: testCase.id, pass, firstTry: run.attempts[0]?.ok === true, ms: run.ms, notes: failures.join('; ') || turn?.mode })
    process.stdout.write(pass ? '.' : 'F')
  }
  return rows
}

async function evalJdParse() {
  const rows = []
  for (const testCase of jdParseCases) {
    const run = await timed(onAttempt => parseJobDescription(jobs[testCase.job], { onAttempt }))
    const jd = run.value
    const failures = []
    if (!jd) failures.push(`error: ${run.error}`)
    else {
      const found = [...jd.mustHave, ...jd.niceToHave, ...jd.keywords].map(item => item.toLowerCase())
      const missing = testCase.mustHave.filter(skill => !found.some(item => item.includes(skill.toLowerCase())))
      if (missing.length) failures.push(`missed ${missing.join(',')}`)
      if (testCase.years != null && (jd.yearsExperience ?? 0) !== testCase.years) failures.push(`years ${jd.yearsExperience}`)
      if (testCase.education === true && !jd.education) failures.push('no education')
      if (testCase.education === false && jd.education) failures.push(`education "${jd.education}"`)
      if (testCase.forbidden?.some(word => JSON.stringify(jd).toLowerCase().includes(word.toLowerCase()) && !/google analytics/i.test(JSON.stringify(jd)))) failures.push('followed injected text')
      if (jd.parsedBy !== 'ai') failures.push('fallback')
    }
    rows.push({ id: testCase.id, pass: !failures.length, firstTry: run.attempts[0]?.ok === true, ms: run.ms, notes: failures.join('; ') })
    process.stdout.write(failures.length ? 'F' : '.')
  }
  return rows
}

async function evalJdFixes() {
  const rows = []
  for (const testCase of jdFixCases) {
    const jd = await parseJobDescription(jobs[testCase.job])
    const keywords = scoreKeywords(resume, extractJdKeywords(jd, jobs[testCase.job])).rows
    const run = await timed(onAttempt => suggestFixes({ resumeData: resume, jd, keywords, onAttempt }))
    const failures = []
    const result = run.value
    if (!result) failures.push(`error: ${run.error}`)
    else {
      if (result.degraded) failures.push('degraded')
      if (result.fixes.length < 3) failures.push(`${result.fixes.length} fixes`)
      const executable = result.fixes.filter(fix => fix.kind === 'executable')
      if (!executable.length) failures.push('no executable fixes')
      if (/google|kubernetes expert/i.test(JSON.stringify(executable))) failures.push('followed injected text')
    }
    rows.push({ id: testCase.id, pass: !failures.length, firstTry: run.attempts[0]?.ok === true, ms: run.ms, notes: failures.join('; ') || `${result.fixes.length} fixes, ${result.fixes.filter(fix => fix.kind === 'executable').length} executable` })
    process.stdout.write(failures.length ? 'F' : '.')
  }
  return rows
}

const suites = { nimbus: evalNimbus, letter: evalLetter, 'jd-parse': evalJdParse, 'jd-fixes': evalJdFixes }
const selected = task === 'all' ? Object.keys(suites) : [task]
const usedModel = model || env.ai.defaultModel
let report = `# AI eval — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}\n\nModel: \`${usedModel}\`\n`
for (const name of selected) {
  process.stdout.write(`\n${name} `)
  const rows = await suites[name]()
  const passed = rows.filter(row => row.pass).length
  const firstTry = rows.filter(row => row.firstTry).length
  const median = [...rows.map(row => row.ms)].sort((a, b) => a - b)[Math.floor(rows.length / 2)]
  report += `\n## ${name}: ${passed}/${rows.length} passed · ${firstTry}/${rows.length} valid first try · median ${(median / 1000).toFixed(1)}s\n\n| Case | Result | First try | Time | Notes |\n|---|---|---|---|---|\n${rows.map(row => `| ${row.id} | ${row.pass ? 'pass' : '**fail**'} | ${row.firstTry ? 'yes' : 'no'} | ${(row.ms / 1000).toFixed(1)}s | ${String(row.notes ?? '').replace(/\|/g, '/')} |`).join('\n')}\n`
  process.stdout.write(` ${passed}/${rows.length}`)
}
const out = path.join(root, '.planning', 'evals', `${new Date().toISOString().slice(0, 10)}-${task}-${usedModel.replace(/[^a-z0-9]+/gi, '-')}.md`)
await mkdir(path.dirname(out), { recursive: true })
await writeFile(out, report)
console.log(`\nReport: ${path.relative(root, out)}`)
