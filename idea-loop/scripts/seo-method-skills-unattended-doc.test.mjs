/**
 * Tripwire — the unattended branch of four seo method skills sits in the skill's own references/unattended.md.
 *
 * Spec skill-rewrite, ticket 14. seo-audit, keyword-research, keyword-clustering and competitor-analysis serve two
 * callers: a human (the default, the main file) and a direction agent of seo-scan (first line of the prompt:
 * 「无人值守，交回发现清单。」). The second branch is only walked by the second caller, so it lives behind a pointer.
 * The main file has to say when to go there, in the words the direction agents put on the prompt's first line, and the
 * reference has to carry what an agent cannot guess: what changes against a human run and the hand-back format.
 * The main file stays within 4500 characters (the line the spec set), counted as AGENTS.md says.
 *
 * SEO_SKILLS_DIR points the test at another copy of skills/seo (used to watch it fail on the pre-change text).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const seoDir = process.env.SEO_SKILLS_DIR ?? join(pluginRoot, 'skills', 'seo');
const SLUGS = ['seo-audit', 'keyword-research', 'keyword-clustering', 'competitor-analysis'];

const body = (doc) => doc.split(/^---\s*$/m).slice(2).join('---');
function section(doc, title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

for (const slug of SLUGS) {
  const main = readFileSync(join(seoDir, slug, 'SKILL.md'), 'utf8');
  const refPath = join(seoDir, slug, 'references', 'unattended.md');

  test(`${slug}: SKILL.md says when to read references/unattended.md, and keeps no copy of the hand-back`, () => {
    assert.match(main, /调用方提示的第一行是「无人值守，交回发现清单。」/);
    assert.match(main, /\]\(references\/unattended\.md\)/);
    assert.ok(!/"direction": "(keywords|technical)", "kind"/.test(main), 'the hand-back template is still in SKILL.md');
    assert.ok([...body(main)].length <= 4500, `SKILL.md body is ${[...body(main)].length} characters`);
  });

  test(`${slug}: references/unattended.md holds what changes against a human run, and the hand-back with its completion condition`, () => {
    assert.ok(existsSync(refPath), `${slug}/references/unattended.md is missing`);
    const text = readFileSync(refPath, 'utf8');
    assert.match(section(text, '和人在场的差别'), /不提问[\s\S]*不写入、不保存[\s\S]*不出报告[\s\S]*花费不超过调用方给的额度/);
    assert.match(section(text, '交回'), /"evidence"[\s\S]*"repro"[\s\S]*"acceptance"/);
    assert.match(text, /完成条件：.*`evidence`.*`repro`.*`acceptance`|完成条件：.*线上核实.*`evidence`.*`repro`.*`acceptance`/);
  });
}
