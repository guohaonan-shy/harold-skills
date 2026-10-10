// GitHub identity for idea-loop's own posts: the GitHub App configured for the repository speaks,
// otherwise the gh login. Claude's posts on a PR (pause reports, review rounds) go through here so they
// never appear as written by the human. All writes use JSON on stdin; PR text is never interpolated
// into shell code. Configuration and permissions: references/pr-description.md §1.
import { execFileSync } from 'node:child_process'
import { createPrivateKey, sign } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'

const APP_CONFIG = `${homedir()}/.idea-loop/github-apps.json`

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
