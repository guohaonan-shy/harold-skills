import { execFileSync } from 'node:child_process'
import { createPrivateKey, sign } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'

// One Conversation comment per review round ("round post") is the durable record.
// All writes use JSON on stdin; PR text is never interpolated into shell code.

const APP_CONFIG = `${homedir()}/.idea-loop/github-apps.json`
const INSTRUMENTS = ['unit-test', 'api', 'db', 'browser', 'eval', 'eval-replay', 'static']
const RED_GREEN = ['unit-test', 'api', 'db']
const STATUSES = ['confirmed', 'resolved', 'needs-decision', 'needs-verification', 'backlogged', 'dismissed', 'accepted-risk']
const CLOSED = ['resolved', 'backlogged', 'dismissed', 'accepted-risk']
const CODE_REF = /[\w./-]+\.[A-Za-z]\w*:\d+/
const MAX_BODY = 65000

const expandHome = path => path.startsWith('~/') ? `${homedir()}${path.slice(1)}` : path
const base64url = value => Buffer.from(value).toString('base64url')

// ---------- identity: a configured GitHub App speaks, otherwise the gh login ----------

export function appConfig(repo, configPath = APP_CONFIG) {
  if (!existsSync(configPath)) return null
  const entry = JSON.parse(readFileSync(configPath, 'utf8'))[repo]
  if (!entry) return null
  if (!Number.isSafeInteger(entry.appId) || !entry.privateKeyPath) throw new Error(`Invalid GitHub App config for ${repo}`)
  return { appId: entry.appId, privateKeyPath: expandHome(entry.privateKeyPath) }
}

export function appJwt(appId, privateKeyPem, nowSeconds) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: String(appId) }))
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), createPrivateKey(privateKeyPem))
  return `${header}.${payload}.${signature.toString('base64url')}`
}

// The installation token lives only in this process; it is never printed or written.
export async function appToken(repo, { config = appConfig(repo), fetchImpl = fetch, nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
  if (!config) return null
  const jwt = appJwt(config.appId, readFileSync(config.privateKeyPath, 'utf8'), nowSeconds)
  const headers = { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  const installation = await fetchImpl(`https://api.github.com/repos/${repo}/installation`, { headers })
  if (!installation.ok) throw new Error(`GitHub App ${config.appId} is not installed on ${repo} (${installation.status})`)
  const { id } = await installation.json()
  const access = await fetchImpl(`https://api.github.com/app/installations/${id}/access_tokens`, { method: 'POST', headers })
  if (!access.ok) throw new Error(`Could not mint an installation token for ${repo} (${access.status})`)
  return (await access.json()).token
}

export function ghApi(method, endpoint, data, paginate = false, token = null) {
  const argv = ['api', endpoint, '--method', method]
  if (paginate) argv.push('--paginate', '--slurp')
  if (data) argv.push('--input', '-')
  const result = JSON.parse(execFileSync('gh', argv, {
    input: data ? JSON.stringify(data) : undefined, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    env: token ? { ...process.env, GH_TOKEN: token } : process.env,
  }))
  if (result.errors) throw new Error(JSON.stringify(result.errors))
  return result
}

export async function repoApi(repo) {
  const token = await appToken(repo)
  const api = (method, endpoint, data, paginate) => ghApi(method, endpoint, data, paginate, token)
  api.identity = token ? 'app' : 'gh-login'
  return api
}

// ---------- markers ----------

export function marker(record) {
  return `<!-- idea-loop-review ${JSON.stringify(record).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e')} -->`
}

export function parseMarker(body = '') {
  const match = body.match(/<!-- idea-loop-review (.+?) -->/)
  if (!match) return null
  try { return JSON.parse(match[1]) } catch { return null }
}

function repoPath(repo, pr) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isSafeInteger(pr) || pr < 1) {
    throw new Error('Expected owner/repo and a positive PR number')
  }
  return `repos/${repo}/pulls/${pr}`
}

const idNumber = id => Number(String(id || '').replace(/^F-/, '')) || 0

// ---------- snapshot ----------

export async function snapshot(repo, pr, api = ghApi) {
  const pull = await api('GET', repoPath(repo, pr))
  const conversation = (await api('GET', `repos/${repo}/issues/${pr}/comments?per_page=100`, null, true)).flat()
  // Inline comments are only read for legacy per-finding records, so their F-N IDs are not reused.
  const inline = (await api('GET', `repos/${repo}/pulls/${pr}/comments?per_page=100`, null, true)).flat()
  const marked = [...conversation, ...inline].map(c => ({ ...c, record: parseMarker(c.body) })).filter(c => c.record)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id)
  const rounds = marked.filter(c => c.record.kind === 'round-post')
    .map(c => ({ round: c.record.round, commentId: c.id, url: c.html_url, record: c.record }))
    .sort((a, b) => a.round - b.round)
  // Per-finding comments from the previous design stay readable, never rewritten.
  const legacy = marked.filter(c => c.record.kind === 'finding' || (c.record.kind === 'round' && !c.record.v))
  const findings = new Map()
  for (const { round, url, record } of rounds) {
    for (const f of record.findings) findings.set(f.key, { ...f, round, url })
  }
  const maxRound = Math.max(0, ...rounds.map(r => r.round), ...legacy.map(c => c.record.round || 0))
  const maxId = Math.max(0, ...[...findings.values()].map(f => idNumber(f.id)), ...legacy.map(c => idNumber(c.record.id)))
  return { repo, pr, url: pull.html_url, headSha: pull.head.sha, baseSha: pull.base.sha,
    baseRefName: pull.base.ref, headRefName: pull.head.ref, state: pull.state,
    body: pull.body || '', title: pull.title, rounds, findings: [...findings.values()],
    legacyCount: legacy.length, nextRound: maxRound + 1, maxId }
}

// ---------- validation ----------

export function readiness(findings, checks) {
  const gaps = checks.filter(c => c.required && !['passed', 'not-applicable'].includes(c.status))
  const open = findings.filter(f => !CLOSED.includes(f.status))
  const openBlockingCount = open.filter(f => f.status === 'confirmed' && f.blocksMerge).length
  const needsHuman = open.filter(f => f.blocksMerge && f.status !== 'confirmed').map(f => f.key)
  return { openBlockingCount, needsHuman, mergeReady: gaps.length === 0 && open.every(f => !f.blocksMerge) }
}

const text = value => typeof value === 'string' && value.trim().length > 0

function validateFinding(f, plan) {
  const fail = message => { throw new Error(`Finding ${f.key || '(no key)'}: ${message}`) }
  if (!text(f.key)) fail('missing key')
  if (!STATUSES.includes(f.status)) fail(`invalid status ${f.status}`)
  if (!['P0', 'P1', 'P2'].includes(f.priority)) fail('priority must be P0, P1 or P2')
  if (typeof f.blocksMerge !== 'boolean' || typeof f.introduced !== 'boolean') fail('blocksMerge and introduced must be booleans')
  if (!Array.isArray(f.axes) || !f.axes.length || f.axes.some(a => !['correctness', 'standards', 'spec'].includes(a))) fail('invalid axes')
  if (!text(f.title) || CODE_REF.test(f.title)) fail('title must state the consequence, without path:line')
  if (!text(f.impact) || CODE_REF.test(f.impact)) fail('impact must be one sentence without path:line')
  if ([...f.impact.trim()].length > 60) fail('impact must be at most 60 characters')
  if (!Array.isArray(f.repro) || f.repro.filter(text).length < 2) fail('repro needs at least two steps')
  if (!text(f.evidence)) fail('missing evidence')
  if (!INSTRUMENTS.includes(f.instrument)) fail(`instrument must be one of ${INSTRUMENTS.join(', ')}`)
  if (['confirmed', 'resolved'].includes(f.status) && (!text(f.reproducer) || !text(f.fix))) fail('confirmed findings need a reproducer and one fix')
  if (f.status === 'needs-decision' && (!Array.isArray(f.options) || f.options.length !== 2 || !f.options.every(text))) fail('needs-decision requires exactly two options')
  if (!f.introduced && f.blocksMerge) fail('a pre-existing problem cannot block this PR')
  if (f.status === 'backlogged' && (f.introduced || !text(f.backlog?.entry) || !text(f.backlog?.path))) fail('backlogged means pre-existing with a backlog path and entry')
  if (['dismissed', 'accepted-risk'].includes(f.status) && !text(f.dispositionEvidence)) fail('missing disposition evidence')
  if (f.location && (!text(f.location.path) || !Number.isInteger(f.location.line) || f.location.line < 1)) fail('invalid location')
  if (f.status === 'resolved') {
    const v = f.verification || {}
    if (v.result !== 'passed' || v.headSha !== plan.headSha || v.beforeSha !== plan.reviewedSha || v.beforeSha === v.headSha) {
      fail('resolution needs a passing verification from the reviewed SHA to a later fix head')
    }
    if (v.instrument !== f.instrument) fail(`verification cannot downgrade ${f.instrument} to ${v.instrument}`)
    if (![v.procedure, v.before, v.after].every(text)) fail('verification needs procedure and before/after results')
    if (RED_GREEN.includes(f.instrument) && !text(v.testRef)) fail('a regression test (testRef) must fail before and pass after')
  }
}

export function validatePlan(plan) {
  repoPath(plan.repo, plan.pr)
  for (const field of ['headSha', 'reviewedSha', 'baseSha', 'mergeBaseSha']) {
    if (!/^[a-f0-9]{40}$/.test(plan[field] || '')) throw new Error(`Invalid ${field}`)
  }
  if (!Number.isSafeInteger(plan.round) || plan.round < 1) throw new Error('Invalid round')
  if (!text(plan.summary)) throw new Error('Missing summary')
  if (!Array.isArray(plan.findings) || !Array.isArray(plan.checks)) throw new Error('Missing findings/checks')
  for (const name of ['correctness', 'standards', 'spec', 'verification']) {
    if (!plan.checks.some(c => c.name === name && c.required === true)) throw new Error(`Missing required ${name} check`)
  }
  for (const check of plan.checks) {
    if (!['passed', 'failed', 'incomplete', 'not-applicable'].includes(check.status) || !text(check.evidence)) {
      throw new Error('Every check requires status and evidence, including not-applicable reasons')
    }
    if (check.name === 'correctness' && check.status === 'not-applicable') throw new Error('Correctness must run')
  }
  const keys = new Set()
  for (const f of plan.findings) {
    if (keys.has(f.key)) throw new Error(`Duplicate finding key ${f.key}`)
    keys.add(f.key)
    validateFinding(f, plan)
  }
}

// ---------- rendering ----------

const STATUS_LABEL = { confirmed: '待修', resolved: '已修复', 'needs-decision': '待决定', 'needs-verification': '待验证',
  backlogged: '进 backlog', dismissed: '驳回', 'accepted-risk': '接受风险' }
const short = sha => sha.slice(0, 7)
const cell = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')

function renderFinding(f, plan) {
  const link = f.location ? ` · [代码](https://github.com/${plan.repo}/blob/${plan.headSha}/${f.location.path}#L${f.location.line})` : ''
  const lines = [
    `### ${f.id} · [${f.priority}] ${f.title}`,
    `${f.axes.join(' / ')} · ${STATUS_LABEL[f.status]} · ${f.blocksMerge ? '阻塞' : '不阻塞'} · ${f.introduced ? '本次引入' : '存量问题'}${link}`,
    '', `**影响**：${f.impact.trim()}`, '', '**复现**', ...f.repro.filter(text).map((step, i) => `${i + 1}. ${step.trim()}`),
  ]
  if (f.status === 'needs-decision') {
    lines.push('', '**需要决定**', ...f.options.map((o, i) => `- 选项 ${'AB'[i]}：${o.trim()}`))
  } else if (text(f.fix)) {
    lines.push('', `**${f.status === 'resolved' ? '修法（已做）' : '修法'}**：${f.fix.trim()}`)
  }
  const v = f.verification
  if (f.status === 'resolved') {
    lines.push('', `**验证**：\`${v.instrument}\` · ${v.procedure.trim()}`,
      `- 修复前 ${short(v.beforeSha)}：${v.before.trim()}`, `- 修复后 ${short(v.headSha)}：${v.after.trim()}`)
    if (text(v.testRef)) lines.push(`- 回归测试：\`${v.testRef.trim()}\``)
    if (text(v.regressions)) lines.push(`- 回归范围：${v.regressions.trim()}`)
  }
  if (f.status === 'backlogged') lines.push('', `**去向**：已登记到 \`${f.backlog.path}\`${f.backlog.commit ? `（${f.backlog.commit}）` : ''}`)
  if (text(f.dispositionEvidence)) lines.push('', `**处置依据**：${f.dispositionEvidence.trim()}`)
  lines.push('', `<details><summary>证据（${f.instrument}${f.instrument === 'static' ? '，静态推理' : ''}）</summary>`, '',
    text(f.reproducer) ? `复现命令：\`${f.reproducer.trim()}\`\n\n${f.evidence.trim()}` : f.evidence.trim(), '', '</details>')
  return lines.join('\n')
}

export function renderRoundPost(plan, findings, result, identity) {
  const headLine = plan.headSha === plan.reviewedSha
    ? `审 ${short(plan.reviewedSha)}（本轮无修复提交）` : `审 ${short(plan.reviewedSha)} → 修复后 ${short(plan.headSha)}`
  const table = findings.length
    ? ['| # | 标题 | 优先级 | 轴 | 状态 |', '|---|---|---|---|---|',
      ...findings.map(f => `| ${f.id} | ${cell(f.title)} | ${f.priority} | ${f.axes.join('/')} | ${STATUS_LABEL[f.status]} |`)].join('\n')
    : '本轮没有符合准入标准的 finding。'
  const checks = ['| 检查 | 结果 | 证据 / 限制 |', '|---|---|---|',
    ...plan.checks.map(c => `| ${c.name} | ${c.status} | ${cell(c.evidence)} |`)].join('\n')
  const verdict = result.mergeReady
    ? '**mergeReady**：必需检查已完成，没有未处置的阻塞问题。这不是合并授权，合并等维护者下令。'
    : `**不能合并**：未解决阻塞 ${result.openBlockingCount} 条${result.needsHuman.length ? `，待人决定或待验证 ${result.needsHuman.length} 条` : ''}${plan.checks.some(c => c.required && !['passed', 'not-applicable'].includes(c.status)) ? '，有必需检查未完成' : ''}。`
  const footer = identity === 'gh-login' ? '\n\n<sub>未配置 GitHub App，本帖以 gh 当前登录身份发布。</sub>' : ''
  return [`## Review 第 ${plan.round} 轮 · ${headLine}`, '', plan.summary.trim(), '', verdict, '', table, '',
    ...findings.map(f => renderFinding(f, plan) + '\n'), '<details><summary>本轮检查</summary>', '', checks, '', '</details>'].join('\n') + footer
}

// ---------- publish ----------

async function assertCurrent(plan, api) {
  const pull = await api('GET', repoPath(plan.repo, plan.pr))
  if (pull.state !== 'open' || pull.head.sha !== plan.headSha || pull.base.sha !== plan.baseSha) {
    throw new Error('PR closed or base/head changed; review the new snapshot before publishing')
  }
}

const COMPACT = ['key', 'id', 'title', 'priority', 'axes', 'status', 'blocksMerge', 'introduced', 'instrument', 'reproducer', 'location', 'fix']

// Publishing the same plan again edits the same round post; it never duplicates it.
export async function publish(plan, api = ghApi) {
  validatePlan(plan)
  const state = await snapshot(plan.repo, plan.pr, api)
  await assertCurrent(plan, api)
  const existing = state.rounds.find(r => r.round === plan.round)
  if (existing && existing.record.reviewedSha !== plan.reviewedSha) throw new Error(`Round ${plan.round} was already published for a different reviewed SHA`)
  if (!existing && plan.round !== state.nextRound) throw new Error(`Expected round ${state.nextRound}, got ${plan.round}`)
  let nextId = state.maxId + 1
  const ids = new Map([...state.findings, ...(existing?.record.findings || [])].map(f => [f.key, f.id]))
  const findings = plan.findings.map(f => ({ ...f, id: ids.get(f.key) || `F-${nextId++}` }))
  const merged = new Map(state.findings.map(f => [f.key, f]))
  for (const f of findings) merged.set(f.key, f)
  const result = readiness([...merged.values()], plan.checks)
  const record = { kind: 'round-post', v: 2, round: plan.round, reviewedSha: plan.reviewedSha, headSha: plan.headSha,
    baseSha: plan.baseSha, mergeBaseSha: plan.mergeBaseSha, checks: plan.checks.map(({ name, status, required }) => ({ name, status, required })),
    findings: findings.map(f => Object.fromEntries(COMPACT.filter(k => f[k] !== undefined).map(k => [k, f[k]]))) }
  const body = `${marker(record)}\n${renderRoundPost(plan, findings, result, api.identity)}`
  if (body.length > MAX_BODY) throw new Error(`Round post is ${body.length} characters; shorten evidence below ${MAX_BODY}`)
  await assertCurrent(plan, api)
  const comment = await api(existing ? 'PATCH' : 'POST', existing
    ? `repos/${plan.repo}/issues/comments/${existing.commentId}`
    : `repos/${plan.repo}/issues/${plan.pr}/comments`, { body })
  const after = await snapshot(plan.repo, plan.pr, api)
  if (!after.rounds.some(r => r.round === plan.round && r.record.reviewedSha === plan.reviewedSha)) throw new Error('Could not read back the round post')
  return { ...result, round: plan.round, prUrl: state.url, url: comment.html_url, headSha: plan.headSha,
    identity: api.identity || 'gh-login', ids: Object.fromEntries(findings.map(f => [f.key, f.id])) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, ...values] = process.argv.slice(2)
    if (command === 'snapshot' && values.length === 2) {
      console.log(JSON.stringify(await snapshot(values[0], Number(values[1]), await repoApi(values[0])), null, 2))
    } else if (command === 'publish' && values.length === 1) {
      const plan = JSON.parse(readFileSync(values[0] === '-' ? 0 : values[0], 'utf8'))
      console.log(JSON.stringify(await publish(plan, await repoApi(plan.repo)), null, 2))
    } else throw new Error('Usage: github-review.mjs snapshot OWNER/REPO PR | publish PLAN.json|-')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
