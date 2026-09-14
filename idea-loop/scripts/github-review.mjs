import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// All writes use JSON on stdin; PR text is never interpolated into shell code.
export function ghApi(method, endpoint, data, paginate = false) {
  const argv = ['api', endpoint, '--method', method]
  if (paginate) argv.push('--paginate', '--slurp')
  if (data) argv.push('--input', '-')
  const result = JSON.parse(execFileSync('gh', argv, {
    input: data ? JSON.stringify(data) : undefined, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  }))
  if (result.errors) throw new Error(JSON.stringify(result.errors))
  return result
}

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

export async function snapshot(repo, pr, api = ghApi) {
  const path = repoPath(repo, pr)
  const pull = await api('GET', path)
  const conversation = (await api('GET', `repos/${repo}/issues/${pr}/comments?per_page=100`, null, true)).flat()
  const inline = (await api('GET', `${path}/comments?per_page=100`, null, true)).flat()
  const [owner, name] = repo.split('/')
  const threads = []
  let cursor = null
  do {
    const result = await api('POST', 'graphql', {
      query: `query($owner:String!,$name:String!,$pr:Int!,$cursor:String){repository(owner:$owner,name:$name){pullRequest(number:$pr){reviewThreads(first:100,after:$cursor){nodes{id isResolved isOutdated comments(first:1){nodes{databaseId}}} pageInfo{hasNextPage endCursor}}}}}`,
      variables: { owner, name, pr, cursor },
    })
    const page = result.data.repository.pullRequest.reviewThreads
    threads.push(...page.nodes)
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
  } while (cursor)
  const records = [...conversation.map(c => ({ ...c, channel: 'conversation' })),
    ...inline.map(c => ({ ...c, channel: 'inline' }))]
    .map(c => ({ ...c, record: parseMarker(c.body) })).filter(c => c.record)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id)
  const findings = new Map()
  for (const comment of records.filter(c => c.record.kind === 'finding')) {
    const record = comment.record
    const previous = findings.get(record.key)
    if (!previous && comment.in_reply_to_id) continue
    const rootCommentId = previous?.rootCommentId || comment.id
    const thread = threads.find(t => t.comments.nodes[0]?.databaseId === rootCommentId)
    findings.set(record.key, { ...record, rootCommentId,
      channel: previous?.channel || comment.channel,
      url: previous?.url || comment.html_url,
      threadId: thread?.id || null, threadResolved: thread?.isResolved || false,
      latestBody: comment.body,
    })
  }
  const rounds = records.filter(c => c.record.kind === 'round')
  const maxRound = Math.max(0, ...records.map(c => c.record.round || 0))
  const currentRun = records.find(c => c.record.round === maxRound && c.record.headSha === pull.head.sha && c.record.baseSha === pull.base.sha)
  return { repo, pr, url: pull.html_url, headSha: pull.head.sha, baseSha: pull.base.sha,
    baseRefName: pull.base.ref, headRefName: pull.head.ref, state: pull.state,
    body: pull.body || '', title: pull.title, findings: [...findings.values()],
    rounds, round: currentRun ? maxRound : maxRound + 1, conversation, inline }
}

export function readiness(findings, checks) {
  const gaps = checks.filter(c => c.required && !['passed', 'not-applicable'].includes(c.status))
  const unresolved = findings.filter(f => !['resolved', 'dismissed', 'accepted-risk'].includes(f.status))
  const needsEvidence = unresolved.some(f => f.blocksMerge && f.status !== 'confirmed')
  const count = unresolved.filter(f => f.status === 'confirmed' && f.blocksMerge).length
  return { openBlockingCount: count, mergeReady: gaps.length === 0 && !needsEvidence && count === 0 }
}

export function validatePlan(plan) {
  repoPath(plan.repo, plan.pr)
  for (const field of ['headSha', 'baseSha']) {
    if (!/^[a-f0-9]{40}$/.test(plan[field] || '')) throw new Error(`Invalid ${field}`)
  }
  for (const field of ['expectedBody', 'expectedTitle', 'body', 'title', 'summary']) {
    if (typeof plan[field] !== 'string') throw new Error(`Missing ${field}`)
  }
  if (!plan.body.trim() || !plan.title.trim() || !plan.summary.trim()) throw new Error('Empty publication')
  if (!Array.isArray(plan.updates) || !Array.isArray(plan.checks)) throw new Error('Missing updates/checks')
  for (const name of ['correctness', 'standards', 'spec', 'verification']) {
    if (!plan.checks.some(c => c.name === name && c.required === true)) throw new Error(`Missing required ${name} check`)
  }
  for (const check of plan.checks) {
    if (!['passed', 'failed', 'incomplete', 'not-applicable'].includes(check.status) || !check.evidence?.trim()) {
      throw new Error('Every check requires status and evidence, including not-applicable reasons')
    }
    if (check.name === 'correctness' && check.status === 'not-applicable') throw new Error('Correctness must run')
  }
  const keys = new Set()
  for (const f of plan.updates) {
    if (!f.key || keys.has(f.key)) throw new Error('Missing/duplicate finding key')
    keys.add(f.key)
    if (!['confirmed', 'needs-verification', 'needs-decision', 'resolved', 'dismissed', 'accepted-risk'].includes(f.status)) throw new Error('Invalid finding status')
    if (!['P0', 'P1', 'P2'].includes(f.priority) || typeof f.blocksMerge !== 'boolean' || !f.body?.trim() || !f.title?.trim()) throw new Error('Incomplete finding')
    if (!Array.isArray(f.axes) || !f.axes.length || f.axes.some(a => !['correctness', 'standards', 'spec'].includes(a))) throw new Error('Invalid finding axes')
    if (f.status === 'resolved' && (!f.verification || f.verification.headSha !== plan.headSha || f.verification.result !== 'passed' || !f.verification.procedure?.trim() || !f.verification.before?.trim() || !f.verification.after?.trim())) {
      throw new Error('Resolution requires current-head verification with procedure and before/after evidence')
    }
    if (['dismissed', 'accepted-risk'].includes(f.status) && !f.dispositionEvidence?.trim()) throw new Error('Missing disposition evidence')
    if (f.location && (!f.location.path || !Number.isInteger(f.location.line) || f.location.line < 1 || !['LEFT', 'RIGHT'].includes(f.location.side))) throw new Error('Invalid inline location')
  }
}

async function assertCurrent(plan, api) {
  const pull = await api('GET', repoPath(plan.repo, plan.pr))
  if (pull.state !== 'open' || pull.head.sha !== plan.headSha || pull.base.sha !== plan.baseSha) {
    throw new Error('PR closed or base/head changed; review the new snapshot before publishing')
  }
  return pull
}

// A plan contains only new/changed findings. Omitted older findings are retained.
// Retry this same JSON after a partial network failure: markers recover posted operations.
export async function publish(plan, api = ghApi) {
  validatePlan(plan)
  const state = await snapshot(plan.repo, plan.pr, api)
  await assertCurrent(plan, api)
  if ((state.body !== plan.expectedBody && state.body !== plan.body) ||
      (state.title !== plan.expectedTitle && state.title !== plan.title)) throw new Error('PR description edited since preparation; reconcile human edits first')
  let nextId = Math.max(0, ...state.findings.map(f => Number(f.id.slice(2)))) + 1
  const path = repoPath(plan.repo, plan.pr)
  for (const update of plan.updates) {
    let current = state.findings.find(f => f.key === update.key)
    if (!current && ['resolved', 'dismissed', 'accepted-risk'].includes(update.status)) throw new Error('Cannot close an unknown finding')
    const record = { ...update, kind: 'finding', id: current?.id || `F-${nextId++}`,
      round: state.round, headSha: plan.headSha, baseSha: plan.baseSha }
    const body = `${marker(record)}\n### ${record.id} · [${record.priority}] ${record.title}\n\n${record.axes.join(' / ')} · ${record.status} · ${record.blocksMerge ? '阻塞' : '不阻塞'}\n\n${record.body}`
    await assertCurrent(plan, api)
    // Reuse the exact completed operation on retries; do not post replies-to-replies.
    if (!current || JSON.stringify(parseMarker(current.latestBody)) !== JSON.stringify(record)) {
      let comment
      if (current?.channel === 'inline') {
        comment = await api('POST', `${path}/comments/${current.rootCommentId}/replies`, { body })
      } else if (current) {
        comment = await api('POST', `repos/${plan.repo}/issues/${plan.pr}/comments`, {
          body: `${body}\n\n[原问题 ${current.id}](${current.url})`,
        })
      } else if (record.location) {
        comment = await api('POST', `${path}/comments`, { body, commit_id: plan.headSha, ...record.location })
      } else {
        comment = await api('POST', `repos/${plan.repo}/issues/${plan.pr}/comments`, { body })
      }
      // Refresh after each write so an interrupted invocation can resume from GitHub alone.
      const refreshed = await snapshot(plan.repo, plan.pr, api)
      current = refreshed.findings.find(f => f.key === record.key)
      if (!current || !comment.id) throw new Error('Could not read back published finding')
      const index = state.findings.findIndex(f => f.key === record.key)
      if (index < 0) state.findings.push(current)
      else state.findings[index] = current
    }
    if (current?.threadId) {
      const closed = ['resolved', 'dismissed', 'accepted-risk'].includes(record.status)
      if (current.threadResolved !== closed) {
        await assertCurrent(plan, api)
        await api('POST', 'graphql', {
          query: `mutation($id:ID!){${closed ? 'resolveReviewThread' : 'unresolveReviewThread'}(input:{threadId:$id}){thread{id isResolved}}}`,
          variables: { id: current.threadId },
        })
      }
    }
  }
  const beforeBody = await assertCurrent(plan, api)
  if (((beforeBody.body || '') !== plan.expectedBody && (beforeBody.body || '') !== plan.body) ||
      (beforeBody.title !== plan.expectedTitle && beforeBody.title !== plan.title)) throw new Error('PR description changed during publication; reconcile first')
  await api('PATCH', path, { body: plan.body, title: plan.title })
  const finalState = await snapshot(plan.repo, plan.pr, api)
  const result = readiness(finalState.findings, plan.checks)
  const links = finalState.findings.map(f => `- [${f.id} · ${f.title}](${f.url}) — ${f.status}`).join('\n')
  const checks = plan.checks.map(c => `| ${c.name} | ${c.status} | ${c.evidence.replaceAll('|', '\\|').replaceAll('\n', ' ')} |`).join('\n')
  const body = `${marker({ kind: 'round', round: state.round, headSha: plan.headSha, baseSha: plan.baseSha, checks: plan.checks })}\n## Review 第 ${state.round} 轮\n\n提交：${plan.headSha}\n\n${plan.summary}\n\n| 检查 | 结果 | 证据 / 限制 |\n| --- | --- | --- |\n${checks}\n\n${links || '没有符合准入标准的 finding。'}\n\n未解决阻塞问题：${result.openBlockingCount}。${result.mergeReady ? '本轮必需检查已完成；没有未处置的阻塞问题。此结论不是合并授权。' : '本轮不能视为通过：存在阻塞问题或必需验证/决策缺口。'}`
  await assertCurrent(plan, api)
  const existing = finalState.rounds.find(c => c.record.round === state.round)
  const summary = await api(existing ? 'PATCH' : 'POST', existing
    ? `repos/${plan.repo}/issues/comments/${existing.id}`
    : `repos/${plan.repo}/issues/${plan.pr}/comments`, { body })
  await assertCurrent(plan, api)
  return { ...result, prUrl: state.url, round: state.round, headSha: plan.headSha, summaryUrl: summary.html_url }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, ...values] = process.argv.slice(2)
    if (command === 'snapshot' && values.length === 2) {
      console.log(JSON.stringify(await snapshot(values[0], Number(values[1])), null, 2))
    } else if (command === 'publish' && values.length === 1) {
      console.log(JSON.stringify(await publish(JSON.parse(readFileSync(values[0], 'utf8'))), null, 2))
    } else throw new Error('Usage: github-review.mjs snapshot OWNER/REPO PR | publish PLAN.json')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
