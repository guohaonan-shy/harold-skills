/**
 * Doc test — seo-outreach goes from "drafts only, never calls a mail or form tool" to four branches:
 * put the draft in the human's mailbox, send, follow up, directory submission. Building a draft or filling
 * a form is allowed; sending and submitting wait for the human. The skill's own text names capabilities,
 * never tools (runtime-tripwire guards that); this test pins the rules a reader of the skill must find.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = process.env.OUTREACH_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const SKILL = read('skills', 'seo', 'seo-outreach', 'SKILL.md');
const SCAN = read('skills', 'seo', 'seo-scan', 'SKILL.md');
const body = (md) => md.split(/^---\s*$/m).slice(2).join('---');
const section = (md, title) => {
  const parts = body(md).split(/^## /m).slice(1);
  const hit = parts.find((s) => s.startsWith(title));
  assert.ok(hit, `no "## ${title}" section`);
  return hit;
};

test('description routes: carries the 发外联邮件 trigger, one line, no steps or file formats', () => {
  const description = SKILL.match(/^description: (.+)$/m)[1];
  assert.match(description, /发外联邮件/);
  assert.ok(description.length < 200, `${description.length} characters`);
  assert.doesNotMatch(description, /docs\/|PR|草稿 id|线程 id|跟进表/);
});

test('the opening says building drafts and filling forms is allowed, and sending and submitting wait for the human', () => {
  const text = body(SKILL);
  assert.match(text, /发出和提交只在人说之后/);
  assert.match(text, /不注册账号、不输入密码/);
  assert.doesNotMatch(text, /任何邮件、表单、私信工具都不调/);
  assert.doesNotMatch(text, /没有任何工具会替你发出/);
  assert.doesNotMatch(text, /邮件需要你自己发/);
});

test('four branches are sections of the skill', () => {
  for (const title of ['放进草稿箱', '发送', '跟进', '目录提交']) section(SKILL, title);
});

test('放进草稿箱: finds a mail MCP with draft, send and thread search; pushes the count; falls back to docs/', () => {
  const s = section(SKILL, '放进草稿箱');
  assert.match(s, /『调用 MCP』/);
  assert.match(s, /建草稿[、，]发送[、，]搜索线程/);
  assert.match(s, /N 封外联邮件在草稿箱/);
  assert.match(s, /『推送』/);
  assert.match(s, /没有邮件 MCP[\s\S]*docs\//);
  assert.match(s, /草稿在 <路径>/);
});

test('发送: starts only from the human saying 发外联邮件, reads 待发送 rows with a draft id, flips to 已发送 and commits the tracker to home', () => {
  const s = section(SKILL, '发送');
  assert.match(s, /发外联邮件/);
  assert.match(s, /待发送/);
  assert.match(s, /草稿 id/);
  assert.match(s, /已发送/);
  assert.match(s, /`commit` 到 home/);
  assert.match(s, /没有邮件 MCP/);
});

test('跟进: reads threads of 已发送 rows, 已回复 plus a push on a reply, a follow-up draft after 7 days, into the mailbox', () => {
  const s = section(SKILL, '跟进');
  assert.match(s, /已发送/);
  assert.match(s, /线程/);
  assert.match(s, /已回复/);
  assert.match(s, /『推送』/);
  assert.match(s, /7 天/);
  assert.match(s, /追发/);
  assert.match(s, /草稿箱/);
  assert.match(s, /没有邮件 MCP/);
});

test('目录提交: fills through 人的浏览器, stops at login, human check and the submit button, clicks only after 提交, falls back to docs/', () => {
  const s = section(SKILL, '目录提交');
  assert.match(s, /『人的浏览器』/);
  assert.match(s, /截图/);
  assert.match(s, /登录页/);
  assert.match(s, /人机验证/);
  assert.match(s, /提交按钮/);
  assert.match(s, /人说「提交」/);
  assert.match(s, /不注册账号、不输入密码/);
  assert.match(s, /没有『人的浏览器』[\s\S]*docs\//);
  assert.match(s, /目录提交页已填好等你点/);
});

test('the tracker format has the 草稿 id and 线程 id columns, with the three columns backlink-analyst reads kept', () => {
  const header = body(SKILL).split('\n').find((l) => l.startsWith('| 站点 |'));
  assert.ok(header, 'no tracker header');
  const columns = header.split('|').map((c) => c.trim()).filter(Boolean);
  assert.deepEqual(columns, ['站点', '联系方式', '来源网址', '角度', '草稿', '草稿 id', '线程 id', '状态', '更新于']);
  const analyst = read('agents', 'backlink-analyst.md');
  for (const c of ['域名', '状态', '更新于']) assert.ok(analyst.includes(c), c);
  assert.match(body(SKILL), /待发送、已发送、已回复、已拿到链接、被拒、无回应/);
});

test('the body is under 5000 characters', () => {
  assert.ok([...body(SKILL)].length < 5000, String([...body(SKILL)].length));
});

test('seo-scan calls the follow-up branch of seo-outreach, and stays within its limit', () => {
  const s = section(SCAN, '外联跟进');
  assert.match(s, /idea-loop:seo-outreach/);
  assert.match(s, /跟进/);
  assert.ok([...body(SCAN)].length <= 5000, String([...body(SCAN)].length));
});
