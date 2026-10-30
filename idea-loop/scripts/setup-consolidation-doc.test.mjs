/**
 * Tripwire — setup's "整合定时任务" step and the cloud prompt it writes into the scheduled task.
 *
 * 1. The setup SKILL.md body (frontmatter stripped, UTF-8 characters) stays under 5000: long material lives in
 *    setup's own `references/`.
 * 2. Every `references/<file>.md` the SKILL.md links exists.
 * 3. The SKILL.md has the "整合定时任务" section with the five moves (App install link, RemoteTrigger + cron,
 *    clear connectors, Run now, fallback), and "交回" reports it.
 * 4. The prompt (the fenced block in references/consolidation-prompt.md) carries every rule the cloud session
 *    needs: it has no plugin, no repo files, so anything missing here is simply unknown to it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const setupDir = join(pluginRoot, 'skills', 'engineering', 'setup');
const skill = readFileSync(join(setupDir, 'SKILL.md'), 'utf8');
const body = skill.split(/^---\s*$/m).slice(2).join('---');

function section(text, title) {
  const m = text.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'));
  return m ? m[1] : null;
}

test('setup SKILL.md body is under 5000 characters', () => {
  assert.ok([...body].length < 5000, `body is ${[...body].length} characters`);
});

test('every references/ link in setup SKILL.md exists', () => {
  const links = [...skill.matchAll(/\]\((references\/[^)#]+)\)/g)].map((m) => m[1]);
  assert.ok(links.length > 0);
  for (const l of links) assert.ok(existsSync(join(setupDir, l)), `${l} is linked but missing`);
});

test('setup has the 整合定时任务 section, placed before 交回', () => {
  const s = section(body, '整合定时任务');
  assert.ok(s, 'no "## 整合定时任务" section');
  assert.ok(body.indexOf('## 整合定时任务') < body.indexOf('## 交回'));
  assert.ok(s.includes('https://github.com/apps/claude/installations/new'), 'App install link');
  assert.match(s, /只装在/, 'installs on the target repo only');
  assert.ok(s.includes('RemoteTrigger'), 'creates the task with RemoteTrigger');
  assert.ok(s.includes('7 */6 * * *'), 'cron');
  assert.match(s, /UTC/, 'cron is read as UTC');
  assert.match(s, /连接器/, 'clears connectors');
  assert.match(s, /Run now/, 'smoke run');
  assert.match(s, /Scheduled/, 'tells the human where to see the run');
  assert.match(s, /未做/, 'fallback when no tool / refused');
  assert.ok(s.includes('references/consolidation-prompt.md'), 'points at the prompt');
});

test('交回 reports the consolidation task', () => {
  const s = section(body, '交回');
  assert.ok(s);
  assert.match(s, /整合任务[^\n]*(任务 id|cron)[^\n]*连接器[^\n]*冒烟/, 'one line: created / id+cron / connectors / smoke');
});

function prompt() {
  const f = join(setupDir, 'references', 'consolidation-prompt.md');
  assert.ok(existsSync(f), 'references/consolidation-prompt.md is missing');
  const m = readFileSync(f, 'utf8').match(/^````\n([\s\S]*?)\n````/m);
  assert.ok(m, 'the prompt must be one fenced block (four backticks)');
  return m[1];
}

test('the cloud prompt carries the scope and the grouping rules', () => {
  const p = prompt();
  assert.ok(p.includes('<仓库>'), 'repo name is a placeholder setup fills in');
  assert.match(p, /status:/, 'only issues without a status: label');
  assert.match(p, /parent_issue_url/, 'only issues without a parent');
  assert.match(p, /已关闭/, 'closed issues are not looked back at');
  assert.match(p, /同一个文件/, 'grouping rule: same file');
  assert.match(p, /同一个(页面|功能模块)/, 'grouping rule: same page / module');
  assert.match(p, /SKILL\.md/, 'same-file example');
  for (const word of ['Email', '付款回调', '分析页']) assert.ok(p.includes(word), `module example: ${word}`);
  assert.match(p, /标题和正文/, 'judge the module from title and body, not labels alone');
  assert.match(p, /不设上限/, 'a group has no upper limit');
});

test('the cloud prompt says which root to use and how a new root reads', () => {
  const p = prompt();
  assert.match(p, /sub_issues_summary/, 'an existing open root is found by its sub-issues');
  assert.ok(p.includes('由整合定时任务开出'), 'root body first line names its origin');
  assert.match(p, /第一行/);
});

test('the cloud prompt names the three repo-scoped REST calls and forbids the rest', () => {
  const p = prompt();
  assert.ok(p.includes('GET repos/<仓库>/issues?state=open'));
  assert.ok(p.includes('POST repos/<仓库>/issues'));
  assert.ok(p.includes('POST repos/<仓库>/issues/<根号>/sub_issues'));
  assert.match(p, /sub_issue_id[^\n]*(数据库 id|`id`)/, 'sub_issue_id is the database id');
  assert.match(p, /不是\s*(issue\s*)?号/, '…not the issue number');
  for (const banned of ['GraphQL', 'search/issues', 'gh issue view']) {
    assert.match(p, new RegExp(`不用[^\\n]*${banned.replace('/', '\\/')}`), `says not to use ${banned}`);
  }
});

test('the cloud prompt posts no comment, changes nothing else, and reports in the session', () => {
  const p = prompt();
  assert.match(p, /不发评论/);
  assert.match(p, /不改 label/);
  assert.match(p, /不关 issue/);
  assert.match(p, /不改仓库文件/);
  assert.match(p, /不开 PR/);
  assert.match(p, /这次运行的会话/, 'merge reasons go in the run session');
  assert.match(p, /无/, 'says "无" when nothing to merge');
});
