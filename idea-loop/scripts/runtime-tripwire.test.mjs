/**
 * Tripwire — the plugin's flows stay runtime-agnostic.
 *
 * idea-loop's skills and agents write capabilities (scheduled task, browser, asking the human …);
 * how a capability is done in one runtime (claude-desktop, magi) lives only in the runtime skill's
 * references. This test scans skills/ and agents/ for runtime-specific writing (tool names, CLI
 * commands, settings paths — the list is in docs/spec/runtime/runtime.md, "tripwire 的名单") and
 * reports every hit as "file:line  rule  original line". Scanning stays aligned with
 * no-project-leak.test.mjs (skills/ and agents/ are in both; scripts/ and evals/ are out of both).
 *
 * Exactly two things are let through, and why:
 *   1. skills/productivity/runtime/references/ — that is where runtime-specific writing belongs.
 *   2. `allowed-tools:` / `tools:` lines inside a file's frontmatter — those declare which tools a
 *      skill or agent may call; a tool declared but absent in some runtime is harmless, and the
 *      declaration is not a flow an agent follows. The same words in the body are still hits.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNED = ['skills', 'agents'];
const ALLOWED_DIR = join('skills', 'productivity', 'runtime', 'references');

const RULES = [
  ['scheduled-task tool', /create_scheduled_task|list_scheduled_tasks|list_task_runs|update_scheduled_task/],
  ['session-management tool', /mcp__ccd_session_mgmt|start_session|list_sections|create_section/],
  ['in-session loop tool', /CronCreate|CronList|CronDelete/],
  ['browser tool', /mcp__playwright__|mcp__Claude_Browser__/],
  ['asking tool', /AskUserQuestion/],
  ['review-page tool', /Artifact/],
  ['push tool', /PushNotification/],
  ['magi command', /magi /],
  ['mcp install command', /claude mcp add/],
  ['settings path', /~\/\.claude\/settings/],
  ['desktop app wording', /桌面 ?app/],
];

function files(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => {
    const p = join(path, name);
    if (statSync(p).isDirectory()) return files(p);
    return name.endsWith('.md') ? [p] : [];
  });
}

/** Scan `root` (a plugin root) and return "file:line  rule  line" for every hit. */
function scan(root) {
  const hits = [];
  for (const entry of SCANNED) {
    let list;
    try { list = files(join(root, entry)); } catch { continue; }
    for (const file of list) {
      const rel = relative(root, file);
      if (rel.startsWith(ALLOWED_DIR + sep)) continue;
      let inFront = false;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/^---\s*$/.test(line)) {
          if (i === 0) inFront = true;
          else if (inFront) inFront = false;
          return;
        }
        if (inFront && /^(allowed-tools|tools):/.test(line)) return;
        const rule = RULES.find(([, re]) => re.test(line));
        if (rule) hits.push(`${rel}:${i + 1}  ${rule[0]}  ${line.trim().slice(0, 100)}`);
      });
    }
  }
  return hits;
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'runtime-tripwire-'));
  const put = (rel, text) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  put('skills/engineering/hardcoded/SKILL.md',
    '---\nname: hardcoded\nallowed-tools: AskUserQuestion, mcp__playwright__browser_click\n---\n\n先问人。\n用 create_scheduled_task 建任务。\n');
  put('agents/worker.md', '---\nname: worker\ntools: PushNotification\n---\n\n跑 `magi cron list`。\n');
  put('skills/productivity/runtime/references/magi.md', '用 magi cron create。AskUserQuestion。\n');
  return root;
}

test('fixture with hard-coded tool names goes red: every body hit is reported with file:line, rule and the line', () => {
  const hits = scan(fixture());
  assert.deepEqual(hits, [
    'skills/engineering/hardcoded/SKILL.md:7  scheduled-task tool  用 create_scheduled_task 建任务。',
    'agents/worker.md:6  magi command  跑 `magi cron list`。',
  ]);
});

test('the same words in the runtime references and in frontmatter tool declarations are let through; in a body they are not', () => {
  const root = fixture();
  assert.ok(!scan(root).some((h) => h.includes('references/')));
  assert.ok(!scan(root).some((h) => /:(3|4):/.test(h)), 'frontmatter allowed-tools / tools lines are exempt');
});

test('skills/ and agents/ write capability names, not runtime-specific tools', () => {
  const hits = scan(pluginRoot);
  assert.deepEqual(hits, [], `runtime-specific writing outside the runtime references:\n${hits.join('\n')}`);
});
