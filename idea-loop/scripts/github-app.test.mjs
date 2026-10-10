import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appConfig, appJwt, appToken } from './github-app.mjs'

test('GitHub App identity: config lookup, signed JWT, installation token, no config means gh login', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const dir = mkdtempSync(join(tmpdir(), 'idea-loop-app-'))
  const pem = join(dir, 'app.pem')
  writeFileSync(pem, privateKey.export({ type: 'pkcs8', format: 'pem' }))
  const configPath = join(dir, 'github-apps.json')
  writeFileSync(configPath, JSON.stringify({ 'owner/repo': { appId: 4948428, privateKeyPath: pem } }))
  assert.equal(appConfig('other/repo', configPath), null)
  assert.equal(appConfig('owner/repo', join(dir, 'missing.json')), null)
  const config = appConfig('owner/repo', configPath)

  const jwt = appJwt(config.appId, privateKey.export({ type: 'pkcs8', format: 'pem' }), 1_000_000)
  const [header, payload, signature] = jwt.split('.')
  assert.ok(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url')))
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), { iat: 999_940, exp: 1_000_540, iss: '4948428' })

  const requests = []
  const fetchImpl = async (url, options) => {
    requests.push({ url, method: options.method || 'GET', auth: options.headers.Authorization })
    if (url.endsWith('/repos/owner/repo/installation')) return { ok: true, json: async () => ({ id: 55 }) }
    if (url.endsWith('/app/installations/55/access_tokens')) return { ok: true, json: async () => ({ token: 'ghs_test' }) }
    return { ok: false, status: 404 }
  }
  assert.equal(await appToken('owner/repo', { config, fetchImpl, nowSeconds: 1_000_000 }), 'ghs_test')
  assert.deepEqual(requests.map(r => r.method), ['GET', 'POST'])
  assert.ok(requests.every(r => r.auth.startsWith('Bearer ')))
  assert.equal(await appToken('owner/repo', { config: null, fetchImpl }), null)
  await assert.rejects(appToken('owner/repo', { config, fetchImpl: async () => ({ ok: false, status: 404 }) }), /not installed/)
})
