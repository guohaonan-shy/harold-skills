/**
 * Tripwire — `idea-loop:implement`'s SKILL.md stays inside the body limit; what only some runs reach lives behind
 * pointers in its own `references/`.
 *
 * Spec skill-edit-acceptance, ticket 01. The body had grown to 9414 characters (the limit in AGENTS.md「标准 plugin 目录结构」
 * is 5000: UTF-8 characters after the frontmatter, `awk 'f>=2; /^---$/{f++}' SKILL.md | LC_ALL=en_US.UTF-8 wc -m`). The
 * branches that only some runs walk (waiting for the human, redispatch, CI failures, other repositories, design
 * changes, a session that broke) moved to references; the steps every run walks stayed. This test catches the body
 * growing back, a title that other skills cite by name disappearing, and a pointer that names a file that is not there.
 * It cannot tell whether a moved branch is the right one to move: review judges that against `writing-for-agents`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = join(pluginRoot, 'skills', 'engineering', 'implement');
const skill = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');

/** What AGENTS.md's measure counts: everything after the closing `---` line of the frontmatter. */
function body(doc) {
  const lines = doc.split('\n');
  let seen = 0;
  const rest = [];
  for (const line of lines) {
    if (seen >= 2) rest.push(line);
    if (line === '---') seen++;
  }
  return rest.join('\n');
}

test('implement SKILL.md body is under 5000 characters (the limit in AGENTS.md)', () => {
  const n = [...body(skill)].length;
  assert.ok(n < 5000, `implement body is ${n} characters`);
});

// pr-review cites 「派工」「核对与落地」「回收」「等 CI」「设计变更」; the pr skill's review-loop reference cites 「没活了就停下」.
test('the titles other skills cite by name are still in SKILL.md', () => {
  for (const title of ['## 派工', '## 核对与落地', '## 回收', '## 设计变更', '## 没活了就停下']) {
    assert.ok(skill.split('\n').some((l) => l.startsWith(title)), `no "${title}" heading`);
  }
  assert.ok(skill.split('\n').some((l) => l.startsWith('**等 CI**')), 'no 「等 CI」 title');
});

test('every reference SKILL.md points at exists', () => {
  const pointed = [...skill.matchAll(/references\/([\w.-]+\.md)/g)].map((m) => m[1]);
  assert.ok(pointed.length > 0, 'SKILL.md points at no reference');
  for (const f of pointed) assert.ok(existsSync(join(skillDir, 'references', f)), `SKILL.md names references/${f}, which is not there`);
});

// Review round 1: a link moved into a reference is read from that reference's own directory, so
// `references/x.md` inside `references/` pointed at `references/references/x.md`, which is not there.
test('every markdown link inside a reference opens from the reference file\'s own directory', () => {
  const refDir = join(skillDir, 'references');
  for (const name of readdirSync(refDir).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(join(refDir, name), 'utf8');
    for (const m of text.matchAll(/\]\(([^)#\s]+)\)/g)) {
      if (/^[a-z]+:/.test(m[1])) continue;
      assert.ok(existsSync(join(refDir, m[1])), `references/${name} links to ${m[1]}, which does not open from there`);
    }
  }
});

// Review round 2: the 「等 CI」 rule was written in SKILL.md and again in the reference, so a change to one is easy to
// miss in the other. The rule lives in the reference; SKILL.md keeps the title and a pointer, no command or outcome.
test('the 「等 CI」 rule is written once: SKILL.md keeps the title and a pointer, the rule stays in the reference', () => {
  const line = skill.split('\n').find((l) => l.startsWith('**等 CI**'));
  assert.ok(line, 'no 「等 CI」 title');
  assert.ok(!line.includes('gh pr checks'), 'SKILL.md repeats the wait command; the rule belongs in the reference only');
  assert.match(line, /references\/stop-and-resume\.md/, '「等 CI」 must point at the reference');
  const ref = readFileSync(join(skillDir, 'references', 'stop-and-resume.md'), 'utf8');
  assert.match(ref, /\*\*等 CI\*\*：[^\n]*gh pr checks <PR 号> --watch/, 'the reference no longer holds the rule');
});
