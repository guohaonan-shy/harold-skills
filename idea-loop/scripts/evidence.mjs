#!/usr/bin/env node
/**
 * Delivery evidence store — one draft GitHub release per PR, deleted when the PR is merged.
 *
 * Delivery evidence (the human-verify flows and GIFs a ticket's implementer records, the figures a
 * review round draws for its findings) only serves "is this delivery right?". It dies with the PR,
 * so it never enters git: not the code branch, not docs/. A draft release is the cheapest home
 * that is off git, private to the repository's collaborators, scriptable with gh, and deletable in
 * one call. Rules and lifecycle: references/evidence.md.
 *
 * Release assets are a flat namespace, so the caller names files with their owner up front
 * (`t03-flow-sentence-failed.png`, `r2-spec-1-quota-flow.png`). Uploading the same name again
 * replaces it, so a re-recorded GIF keeps its URL.
 *
 * Deterministic core (releaseTag, checkAssets) is pure and unit-tested. The CLI at the bottom is
 * the gh boundary.
 *
 * Usage:
 *   node evidence.mjs publish <owner/repo> <pr> <file>...   → prints {"<name>": "<url>"} as JSON
 *   node evidence.mjs list    <owner/repo> <pr>             → prints {"<name>": "<url>"} as JSON
 *   node evidence.mjs cleanup <owner/repo> <pr>             → deletes the release (no-op if absent)
 * Exit: 0 = done, 1 = usage / gh error, 2 = the files are invalid (problems listed).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_BYTES = 10 * 1024 * 1024;
export const EXTENSIONS = ['.png', '.gif', '.jpg', '.jpeg', '.webp'];
const NAME = /^[a-z0-9][a-z0-9._-]*$/;

export const releaseTag = (pr) => `idea-loop-evidence-pr-${pr}`;

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
      errors.push(`${name}：文件名只用小写字母、数字、点、横线、下划线（release 附件名会被 GitHub 改写，改写后链接对不上）`);
    }
    if (!/^(t\d{2}|r\d+)-/.test(name)) {
      errors.push(`${name}：要以归属开头——工单素材 tNN-（如 t03-），review 第 N 轮的图 rN-（如 r2-）；附件是平铺的，不带归属就会互相覆盖`);
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

const gh = (args, opts = {}) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...opts });

function release(repo, pr) {
  try {
    return JSON.parse(gh(['release', 'view', releaseTag(pr), '--repo', repo, '--json', 'tagName,isDraft,assets'], { stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
}

const urls = (rel) => Object.fromEntries((rel?.assets ?? []).map((a) => [a.name, a.url]));

function publish(repo, pr, paths) {
  const files = paths.map((path) => ({ path, size: existsSync(path) ? statSync(path).size : 0 }));
  const { valid, errors } = checkAssets(files);
  if (!valid) {
    console.error(errors.join('\n'));
    process.exit(2);
  }
  const existing = release(repo, pr);
  if (existing && !existing.isDraft) {
    console.error(`${releaseTag(pr)} 已经被发布成正式 release，不再往里传——它不该是正式 release，先让人处理`);
    process.exit(1);
  }
  if (!existing) {
    gh(['release', 'create', releaseTag(pr), '--repo', repo, '--draft',
      '--title', `PR #${pr} 交付证据（idea-loop，合并后删除）`,
      '--notes', `idea-loop 为 PR #${pr} 存的人验素材与 review 配图。不进 git，PR 合并或关闭后整个删除。`]);
  }
  gh(['release', 'upload', releaseTag(pr), '--repo', repo, '--clobber', ...paths]);
  const all = urls(release(repo, pr));
  const mine = Object.fromEntries(paths.map((p) => [basename(p), all[basename(p)]]));
  console.log(JSON.stringify(mine, null, 2));
}

function cleanup(repo, pr) {
  const existing = release(repo, pr);
  if (!existing) return console.log(`${releaseTag(pr)} 不存在，无需删除`);
  if (!existing.isDraft) {
    console.error(`${releaseTag(pr)} 是正式 release，不由本脚本删除`);
    process.exit(1);
  }
  gh(['release', 'delete', releaseTag(pr), '--repo', repo, '--yes']);
  console.log(`已删除 ${releaseTag(pr)}（${existing.assets.length} 个附件）`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, repo, pr, ...paths] = process.argv.slice(2);
  if (!['publish', 'list', 'cleanup'].includes(cmd) || !/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !/^\d+$/.test(pr ?? '')) {
    console.error('usage: evidence.mjs publish|list|cleanup <owner/repo> <pr> [file...]');
    process.exit(1);
  }
  if (cmd === 'publish') publish(repo, pr, paths);
  else if (cmd === 'list') console.log(JSON.stringify(urls(release(repo, pr)), null, 2));
  else cleanup(repo, pr);
}
