import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Guards the wording rule behind issue comments: idea-loop's comments start with the hidden marker, not a
// visible prefix, and nothing it posts on a PR is signed "posted by Claude". The old prefix survives only
// where it is recognised (dyna's Go code, outside this plugin, and this test) or named as the legacy form (a line that says 旧).

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// The marker is defined once, in the dyna command that posts the comments (`dyna issues note` / `set --comment`).
const GO_STATE = fileURLToPath(new URL('../../dyna/internal/issues/state.go', import.meta.url));
const AI_MARKER = (readFileSync(GO_STATE, 'utf8').match(/const AIMarker = "([^"]+)"/) || [])[1];
test('dyna defines the comment marker (const AIMarker in dyna/internal/issues/state.go)', () => {
  assert.ok(AI_MARKER, 'dyna/internal/issues/state.go has no `const AIMarker = "…"`');
});
const OLD_PREFIX = '🤖 idea-loop：';
const SIGNATURE = '由 Claude 代发';
const AS_HUMAN = '以人的身份';

function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'evals' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(md|mjs|json)$/.test(name)) out.push(p);
  }
  return out;
}

const all = files(ROOT).map((p) => ({ rel: relative(ROOT, p), lines: readFileSync(p, 'utf8').split('\n') }));
const isTest = (rel) => rel.endsWith('.test.mjs');
const RECOGNISES_OLD = new Set(['scripts/comment-marker-doc.test.mjs']);

test('the old 「🤖 idea-loop：」 prefix is written only where it is recognised, or named as the old form (旧)', () => {
  const hits = [];
  for (const f of all) {
    if (RECOGNISES_OLD.has(f.rel)) continue;
    f.lines.forEach((l, i) => {
      if (l.includes(OLD_PREFIX) && !l.includes('旧')) hits.push(`${f.rel}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
});

test('nothing in the plugin says a comment is posted on Claude\'s behalf or in a person\'s name', () => {
  const hits = [];
  for (const f of all) {
    if (isTest(f.rel)) continue;
    f.lines.forEach((l, i) => {
      if (l.includes(SIGNATURE) || l.includes(AS_HUMAN)) hits.push(`${f.rel}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
});

// The rule (write through the command so it carries the marker; read the latest comment that has it) lives once, in `issues`'
// 「评论」; the three places that read idea-loop's latest comment point there and do not write the marker out again.
test('the marker rule is written once, in issues 「评论」; the places that read idea-loop\'s comments point there', () => {
  const issues = all.find((f) => f.rel === 'skills/engineering/issues/SKILL.md').lines.join('\n');
  const section = issues.slice(issues.indexOf('## 评论'), issues.indexOf('## blocked by'));
  assert.ok(section.includes(AI_MARKER), `issues 「评论」 must name the ${AI_MARKER} marker`);
  assert.match(section, /dyna issues note/);
  assert.match(section, /最近一条/);
  for (const rel of ['skills/engineering/issue-session/SKILL.md', 'skills/engineering/issue-dispatch/references/morning-summary.md', 'skills/engineering/issue-session/references/draft-spec.md', 'agents/issue-triager.md']) {
    const text = all.find((f) => f.rel === rel).lines.join('\n');
    assert.match(text, /`idea-loop:issues` 的「评论」/, `${rel} must point at issues 「评论」`);
    assert.ok(!text.includes(AI_MARKER), `${rel} must not write the ${AI_MARKER} marker out: it is owned by issues`);
  }
});

test('no script usage text or posting-identity note still says a prefix is added or that Claude hides behind the human', () => {
  const STALE = [/with the AI prefix/, /never appear as written by the human/, /never speaks as the human/, /saying up front that Claude posted/, /不会显得是人本人/, /以项目 bot 的身份发/];
  const hits = [];
  for (const f of all) {
    if (isTest(f.rel)) continue;
    f.lines.forEach((l, i) => {
      if (STALE.some((re) => re.test(l))) hits.push(`${f.rel}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
});

test('no test writes the comment marker out: they all take it from AIMarker in dyna', () => {
  const hits = [];
  for (const f of all) {
    if (!isTest(f.rel)) continue;
    f.lines.forEach((l, i) => {
      if (l.includes(AI_MARKER)) hits.push(`${f.rel}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
});
