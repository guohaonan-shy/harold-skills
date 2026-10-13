#!/usr/bin/env node
/**
 * Delivery evidence store — one orphan branch per PR, deleted when the PR is merged.
 *
 * Delivery evidence (the human-verify flows and GIFs a ticket's implementer records, the figures a
 * review round draws for its findings) only serves "is this delivery right?". It dies with the PR,
 * so it never enters the code branch or docs/. It lives on its own orphan branch
 * `idea-loop-evidence-pr-<N>`: never merged, no history shared with the code, deleted in one call.
 * Rules and lifecycle: references/evidence.md.
 *
 * Why a branch and not a release: a release asset URL is served as a download
 * (`content-disposition: attachment`), so clicking an image in a PR comment downloads it instead of
 * opening it full size. A file on a branch, linked as `blob/<branch>/<name>?raw=true`, redirects to
 * raw.githubusercontent.com and comes back as `image/png` — the browser shows it, and it zooms. GitHub
 * wraps every comment image in a link to its own src, so the embed alone is enough.
 *
 * The orphan tree holds no `.github/workflows`, so pushing to it starts no CI run. Files are a flat
 * namespace, so the caller names them with their owner up front (`t03-flow-sentence-failed.png`,
 * `r2-spec-1-quota-flow.png`, and `pr-` for the PR description's before/after shots). Uploading the same name again replaces it and the URL stays the same,
 * so a re-recorded GIF does not touch the reports already posted.
 *
 * Deterministic core (evidenceBranch, imageUrl, checkAssets) is pure and unit-tested. The CLI at the
 * bottom is the gh boundary; it writes through the git data API, never touching the local checkout.
 *
 * Usage:
 *   node evidence.mjs publish <owner/repo> <pr> <file>...   → prints {"<name>": "<url>"} as JSON
 *   node evidence.mjs list    <owner/repo> <pr>             → prints {"<name>": "<url>"} as JSON
 *   node evidence.mjs cleanup <owner/repo> <pr>             → deletes the branch (no-op if absent)
 * Exit: 0 = done, 1 = usage / gh error, 2 = the files are invalid (problems listed).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_BYTES = 10 * 1024 * 1024;
export const EXTENSIONS = ['.png', '.gif', '.jpg', '.jpeg', '.webp'];
const NAME = /^[a-z0-9][a-z0-9._-]*$/;

export const evidenceBranch = (pr) => `idea-loop-evidence-pr-${pr}`;

/** The address to embed: opens as an image in the browser, not as a download. */
export const imageUrl = (repo, pr, name) => `https://github.com/${repo}/blob/${evidenceBranch(pr)}/${name}?raw=true`;

/**
 * Validate the files of one publish.
 *
 * @param files  [{ path, size }] — sizes injected so the core stays pure
 * @returns { valid, errors }
 */
export function checkAssets(files) {
  const errors = [];
  if (!Array.isArray(files) || files.length === 0) return { valid: false, errors: ['没有要上传的文件'] };
  const seen = new Set();
  for (const { path, size } of files) {
    const name = basename(path);
    if (!EXTENSIONS.includes(extname(name).toLowerCase())) {
      errors.push(`${name}：只收图片（${EXTENSIONS.join(' / ')}）`);
    }
    if (!NAME.test(name)) {
      errors.push(`${name}：文件名只用小写字母、数字、点、横线、下划线（要直接放进图片地址里，别的字符会被转义，链接对不上）`);
    }
    if (!/^(t\d{2}|r\d+|pr)-/.test(name)) {
      errors.push(`${name}：要以归属开头——工单素材 tNN-（如 t03-），review 第 N 轮的图 rN-（如 r2-），PR 描述的之前 / 之后对照 pr-；素材分支是平铺的，不带归属就会互相覆盖`);
    }
    if (seen.has(name)) errors.push(`${name}：同一次上传里重名`);
    seen.add(name);
    if (!(size > 0)) errors.push(`${name}：空文件或不存在`);
    else if (size > MAX_BYTES) {
      errors.push(`${name}：${(size / 1024 / 1024).toFixed(1)}MB，超过 10MB——裁短、降帧率或缩小尺寸再传，太大的图在 PR 里加载不出来`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ---------- gh boundary ----------

const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
const api = (method, endpoint, data) => JSON.parse(gh(['api', endpoint, '--method', method, ...(data ? ['--input', '-'] : [])], data ? JSON.stringify(data) : undefined) || 'null');

function head(repo, pr) {
  try {
    return api('GET', `repos/${repo}/git/ref/heads/${evidenceBranch(pr)}`).object.sha;
  } catch {
    return null;
  }
}

function names(repo, pr) {
  const sha = head(repo, pr);
  if (!sha) return [];
  return api('GET', `repos/${repo}/git/trees/${sha}`).tree.filter((e) => e.type === 'blob').map((e) => e.path);
}

const urls = (repo, pr, list) => Object.fromEntries(list.map((n) => [n, imageUrl(repo, pr, n)]));

/** Upload files to the PR's evidence branch; returns {"<name>": "<url>"}. Throws (with .invalid) on bad files. */
export function publish(repo, pr, paths) {
  const files = paths.map((path) => ({ path, size: existsSync(path) ? statSync(path).size : 0 }));
  const { valid, errors } = checkAssets(files);
  if (!valid) throw Object.assign(new Error(errors.join('\n')), { invalid: true });
  const parent = head(repo, pr);
  const tree = paths.map((p) => ({
    path: basename(p), mode: '100644', type: 'blob',
    sha: api('POST', `repos/${repo}/git/blobs`, { content: readFileSync(p).toString('base64'), encoding: 'base64' }).sha,
  }));
  const treeSha = api('POST', `repos/${repo}/git/trees`, parent ? { base_tree: api('GET', `repos/${repo}/git/commits/${parent}`).tree.sha, tree } : { tree }).sha;
  const commit = api('POST', `repos/${repo}/git/commits`, {
    message: `PR #${pr} 交付证据：${tree.map((t) => t.path).join(', ')}\n\nidea-loop 素材分支，不合并，PR 合并或关闭后整个删除。`,
    tree: treeSha, parents: parent ? [parent] : [],
  }).sha;
  if (parent) api('PATCH', `repos/${repo}/git/refs/heads/${evidenceBranch(pr)}`, { sha: commit, force: false });
  else api('POST', `repos/${repo}/git/refs`, { ref: `refs/heads/${evidenceBranch(pr)}`, sha: commit });
  return urls(repo, pr, tree.map((t) => t.path));
}

function cleanup(repo, pr) {
  const files = names(repo, pr);
  if (head(repo, pr)) {
    api('DELETE', `repos/${repo}/git/refs/heads/${evidenceBranch(pr)}`);
    console.log(`已删除 ${evidenceBranch(pr)}（${files.length} 个文件）`);
  } else {
    console.log(`${evidenceBranch(pr)} 不存在，无需删除`);
  }
  // Before 0.0.16 evidence lived in a draft release under the same name; sweep one left over.
  try {
    const rel = JSON.parse(gh(['release', 'view', evidenceBranch(pr), '--repo', repo, '--json', 'isDraft']));
    if (rel.isDraft) {
      gh(['release', 'delete', evidenceBranch(pr), '--repo', repo, '--yes']);
      console.log(`另删除了旧版留下的 draft release ${evidenceBranch(pr)}`);
    }
  } catch {
    // no legacy release
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, repo, pr, ...paths] = process.argv.slice(2);
  if (!['publish', 'list', 'cleanup'].includes(cmd) || !/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !/^\d+$/.test(pr ?? '')) {
    console.error('usage: evidence.mjs publish|list|cleanup <owner/repo> <pr> [file...]');
    process.exit(1);
  }
  try {
    if (cmd === 'publish') console.log(JSON.stringify(publish(repo, pr, paths), null, 2));
    else if (cmd === 'list') console.log(JSON.stringify(urls(repo, pr, names(repo, pr)), null, 2));
    else cleanup(repo, pr);
  } catch (error) {
    console.error(String(error.stderr || error.message));
    process.exit(error.invalid ? 2 : 1);
  }
}
