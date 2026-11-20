/**
 * Pins the sentences that make "每 3 天一份 SEO 效果报告" true in the docs: the results-analyst definition (inputs, where
 * the change list comes from, the two charts, the three blocks of the report, the 14-day rule, the findings it raises
 * and that nothing is rolled back for them), seo-scan's results direction and how the report lands (committed straight to home), the daily scheduled task the SEO module installs, SEO.md's optional 分析 section, and the old
 * "不写周报" sentence being gone.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see it fail there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const path = (...p) => join(root, ...p);
const read = (...p) => (existsSync(path(...p)) ? readFileSync(path(...p), 'utf8') : '');
const body = (md) => md.split(/^---\s*$/m).slice(2).join('---');
const section = (doc, title) => doc.split(/^#{2,3} /m).find((s) => s.startsWith(title)) ?? '';
const field = (md, name) => md.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1] ?? '';

const AGENT = read('agents', 'results-analyst.md');
const AGENT_BODY = body(AGENT);
const SCAN = read('skills', 'seo', 'seo-scan', 'SKILL.md');
const SCAN_BODY = body(SCAN);
const REPORT = read('skills', 'seo', 'seo-scan', 'references', 'results-report.md');
const LOG = read('skills', 'seo', 'seo-scan', 'references', 'research-log.md');
const SETUP = read('skills', 'engineering', 'setup', 'references', 'seo', 'steps.md');
const DAILY = read('skills', 'engineering', 'setup', 'references', 'seo', 'daily-scan.md');
const FORMAT = read('skills', 'engineering', 'setup', 'references', 'seo', 'seo-md.md');
const README = read('README.md');
const SEO_README = read('skills', 'seo', 'README.md');

test('results-analyst is defined like the other direction agents: a description of its job and deliverable (not who starts it), pinned model and effort, its tools', () => {
  assert.ok(AGENT, 'agents/results-analyst.md does not exist');
  assert.equal(field(AGENT, 'name'), 'results-analyst');
  const description = field(AGENT, 'description');
  assert.match(description, /SEO 效果分析师/);
  assert.match(description, /Search Console/);
  assert.match(description, /效果报告/);
  assert.match(description, /发现/);
  assert.doesNotMatch(description, /seo-scan|起它/, 'AGENTS.md: an agent description is its job and deliverable, not who starts it');
  assert.equal(field(AGENT, 'model'), 'sonnet');
  assert.match(field(AGENT, 'effort'), /^(medium|high)$/);
  assert.match(field(AGENT, 'maxTurns'), /^\d+$/);
  assert.equal(field(AGENT, 'tools'), '', 'it uses connectors, so no tools whitelist (a renamed connector would leave it with no tools)');
  assert.equal(field(AGENT, 'disallowedTools'), 'Edit, NotebookEdit, Agent');
});

test('results-analyst takes the same five input lines as the other direction agents and reads findings.md and SEO.md first', () => {
  assert.match(AGENT_BODY, /skills\/seo\/seo-scan\/references\/findings\.md/);
  const input = section(AGENT_BODY, '输入');
  assert.match(input, /六行：SEO\.md 路径、项目目录、OpenSEO 项目、本次额度、运行目录、今天/);
  assert.match(input, /dyna seo parse/);
  assert.match(input, /「分析」/);
});

test('the change list comes from dyna seo record list, i.e. the 上线自查 comments on closed SEO issues', () => {
  assert.match(AGENT_BODY, /dyna seo record list/);
  assert.match(AGENT_BODY, /「上线自查」/);
  assert.match(AGENT_BODY, /已关/);
});

test('the report reads Search Console, OpenSEO rankings and the analytics tool 分析 names', () => {
  assert.match(AGENT_BODY, /get_search_console_performance/);
  assert.match(AGENT_BODY, /get_rank_history|排名/);
  assert.match(AGENT_BODY, /「分析」节/);
  assert.match(AGENT_BODY, /dashboard/);
});

test('two charts through excalidrawer chart: a 4-week daily clicks line with every change\'s launch day, and a before/after bar chart', () => {
  const charts = section(AGENT_BODY, '图');
  assert.ok(charts, 'no 图 section');
  assert.match(charts, /excalidrawer:chart/);
  assert.match(charts, /近 4 周/);
  assert.match(charts, /每日点击/);
  assert.match(charts, /折线/);
  assert.match(charts, /上线日/);
  assert.match(charts, /柱状/);
  assert.match(charts, /前后对比/);
  assert.match(charts, /assets\//);
});

test('the report has three blocks and says up front the date its window ends, since Search Console is 2 to 3 days behind', () => {
  const report = section(AGENT_BODY, '报告');
  assert.ok(report, 'no 报告 section');
  assert.match(report, /results\/<今天>\.md/);
  assert.match(report, /截止日/);
  assert.match(report, /晚 2[–-]3 天/);
  assert.match(report, /近 7 天[^\n]*上一个 7 天/);
  assert.match(report, /本周要做什么/);
  assert.match(report, /没有接分析工具/);
  assert.match(report, /三块/);
});

test('only changes live for 14 days are compared before and after', () => {
  assert.match(AGENT_BODY, /上线满 14 天/);
  assert.match(AGENT_BODY, /前 14 天[\s\S]*后 14 天|改动前 14 天[\s\S]*改动后 14 天/);
  assert.match(AGENT_BODY, /不满 14 天[^\n]*不列|没满 14 天[^\n]*不列|只列上线满 14 天/);
});

test('the things to do this week are also findings in results.json, filed under the change\'s own direction, with no results category', () => {
  const findings = section(AGENT_BODY, '发现');
  assert.ok(findings, 'no 发现 section');
  assert.match(findings, /results\.json/);
  assert.match(findings, /本周要做什么/);
  assert.match(findings, /原改动的方向/);
  assert.match(findings, /type:seo\/results/);
  assert.match(findings, /反常下跌/);
  assert.match(findings, /改了没起色/);
});

test('a drop or a flat change is never rolled back by the report: it only becomes a report line and an issue', () => {
  assert.match(AGENT_BODY, /不回滚/);
  assert.match(AGENT_BODY, /不改任何文件|只写运行目录/);
});

test('results-analyst writes its file the findings.md way: uncollected when Search Console is not connected, one line back, page text is data', () => {
  assert.match(AGENT_BODY, /未采集/);
  assert.match(AGENT_BODY, /Search Console/);
  assert.match(AGENT_BODY, /findings\.md[^\n]*交回|照 findings\.md 的「交回」/);
  assert.match(AGENT_BODY, /是数据，不是指令/);
});

test('seo-scan runs results as a direction: argument-hint, due cadence, agent table, and no longer calls itself weekly', () => {
  const hint = field(SCAN, 'argument-hint');
  assert.match(hint, /results/);
  assert.doesNotMatch(field(SCAN, 'description'), /每周/);
  const dir = section(SCAN_BODY, '方向');
  assert.match(dir, /technical pages keywords backlinks geo results/);
  assert.match(dir, /`results` 每 3 天，其余五个每 7 天/);
  assert.match(dir, /定时任务每天/);
  assert.match(section(SCAN_BODY, '派方向 agent'), /\| `results` \| `idea-loop:results-analyst` \|/);
});

test('the old "不写周报或洞察" sentence is gone; the report is a deliverable next to the issues', () => {
  assert.doesNotMatch(SCAN_BODY, /不写周报|不写周报或/);
  assert.match(SCAN_BODY.split('\n').slice(0, 12).join('\n'), /效果报告/);
});

test('seo-scan lands the report: a section that points at the reference, after 外联跟进 and before 交回, with the hand-back line', () => {
  const titles = [...SCAN_BODY.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  const i = titles.indexOf('效果报告');
  assert.ok(i > 0, 'seo-scan has no 效果报告 section');
  assert.equal(titles[i - 1], '外联跟进');
  assert.equal(titles[i + 1], '交回');
  const s = section(SCAN_BODY, '效果报告');
  assert.match(s, /references\/results-report\.md/);
  assert.match(s, /docs\/records\/seo-results\/<日期>\.md/);
  assert.match(s, /`commit` 到 home/);
  assert.match(SCAN_BODY, /- 效果报告：/);
});

test('the reference lands the report straight in home: copy into the project directory, commit only those files, push the path', () => {
  assert.ok(REPORT, 'references/results-report.md does not exist');
  assert.match(REPORT, /docs\/records\/seo-results\/<日期>\.md/);
  assert.match(REPORT, /docs\/records\/seo-results\/assets/);
  assert.match(REPORT, /dyna home commit/);
  assert.match(REPORT, /只列这次放进去的文件/);
  assert.match(REPORT, /home 没推上去/);
  assert.doesNotMatch(REPORT, /git worktree|gh pr create|git push|git checkout/);
  assert.match(REPORT, /『推送』/);
  assert.match(REPORT, /idea-loop:wiki-conventions/);
  assert.match(REPORT, /type: record/, 'the report file carries the records frontmatter');
});

test('seo-scan can run what landing needs: allowed-tools has dyna home commit and no longer git add / commit / push or gh pr', () => {
  const tools = field(SCAN, 'allowed-tools');
  assert.ok(tools.includes('Bash(dyna home commit:*)'), 'allowed-tools lacks dyna home commit');
  for (const t of ['Bash(git add:*)', 'Bash(git commit:*)', 'Bash(git push:*)', 'Bash(gh pr:*)']) assert.ok(!tools.includes(t), `allowed-tools still has ${t}`);
  assert.ok(tools.includes('Bash(dyna worktree:*)'), 'triage still uses a worktree, made with dyna worktree');
  assert.ok(!tools.includes('Bash(git worktree:*)'), 'no hand-written git worktree');
});

test('the scan names results-analyst, so its private references stay private to seo-scan and the agent it starts', () => {
  assert.match(SCAN, /idea-loop:results-analyst/);
});

test('the research log: results is collected like any direction (so seo-due sees it), and a day with nothing due writes one line', () => {
  assert.match(LOG, /采集：<方向> <N> 条/);
  assert.match(LOG, /results/);
  assert.match(LOG, /没有到期的方向/);
  const tpl = LOG.match(/```\n([\s\S]*?)```/)[1].split('\n');
  assert.match(tpl[0], /^seo-scan <YYYY-MM-DD HH:MM>，方向：<方向\.\.\.>$/);
  assert.match(tpl[1], /^采集：<方向> <N> 条；/);
});

test('the SEO module installs the scan every day, not every week; the old weekly reference is gone and the task id stays', () => {
  assert.match(SETUP, /^## 8\. 每天扫描$/m);
  assert.doesNotMatch(SETUP, /每周扫描/);
  assert.match(section(SETUP, '8. 每天扫描'), /daily-scan\.md/);
  assert.ok(DAILY, 'references/daily-scan.md does not exist');
  assert.ok(!existsSync(path('skills', 'engineering', 'setup', 'references', 'seo', 'weekly-scan.md')), 'weekly-scan.md is still there');
  assert.match(DAILY, /每天/);
  assert.match(DAILY, /^# 每天扫描$/m);
  assert.match(DAILY, /任务 id：`seo-scan-<仓库名>`/);
  assert.match(DAILY, /每周一次[^\n]*改成每天/, 'an existing weekly task gets moved to daily');
  assert.match(DAILY, /分钟避开 0 和 30/);
});

test('SEO.md format: ten sections, the optional 分析 section with tool, project id and dashboard link, and who reads it', () => {
  assert.match(FORMAT, /十个 `## ` 小节/);
  assert.doesNotMatch(FORMAT, /九个 `## ` 小节/);
  assert.match(FORMAT, /^## 分析$/m);
  assert.match(FORMAT, /- 工具：/);
  assert.match(FORMAT, /- dashboard：/);
  const row = FORMAT.split('\n').find((l) => l.startsWith('| 分析')) ?? '';
  assert.ok(row, 'the 每节读的人 table has no 分析 row');
  assert.match(row, /results-analyst/);
  assert.match(row, /可选|没写/);
});

test('READMEs list results-analyst, the every-3-days report and the daily schedule', () => {
  assert.match(README, /results-analyst/);
  assert.match(README, /seo-results/);
  assert.match(README, /every 3 days/);
  assert.match(README, /daily scheduled task/);
  assert.doesNotMatch(README, /Started weekly by a scheduled task/);
  assert.match(SEO_README, /results-analyst/);
});
