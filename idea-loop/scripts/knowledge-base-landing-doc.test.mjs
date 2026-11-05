// spec, design and tickets ride in the code PR (docs/spec/docs-ride-code-pr): no separate spec PR
// or design PR. The rule is written once, in wiki-conventions「知识库落地」; the places that used to open a
// docs-only PR for a stage point at it instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');

function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}
const docs = [...files(join(root, 'skills')), ...files(join(root, 'agents')), join(root, 'README.md')];

test('no skill, agent or the README opens a separate spec PR or design PR', () => {
  const banned = [/(?<!不)开\*{0,2}设计 PR/, /经设计 PR/, /经一个只改 `docs\/` 的 PR 合进主分支/, /spec PR、设计 PR/, /docs-only spec PR/, /a design PR/];
  const hits = [];
  for (const f of docs) {
    const text = readFileSync(f, 'utf8');
    for (const re of banned) if (re.test(text)) hits.push(`${relative(root, f)}: ${re}`);
  }
  assert.deepEqual(hits, []);
});

test('the places that used to land a stage on its own point at wiki-conventions「知识库落地」', () => {
  for (const f of [
    'skills/engineering/to-spec/references/land-on-main.md',
    'skills/engineering/issue-verify/SKILL.md',
    'skills/engineering/issue-session/SKILL.md',
    'skills/design/uiux-refine/SKILL.md',
    'skills/productivity/decision-rules/SKILL.md',
    'skills/productivity/retro/SKILL.md',
  ]) assert.match(read(f), /知识库落地/, `${f} does not point at 知识库落地`);
});

test('which work has no code to ride along is listed only in wiki-conventions', () => {
  const wiki = 'skills/productivity/wiki-conventions/SKILL.md';
  const rule = /父 issue 拆完子 issue（spec 与设计定稿）/;
  assert.match(read(wiki), /## 知识库落地/);
  assert.match(read(wiki), rule);
  assert.deepEqual(docs.filter((f) => !f.endsWith(wiki) && rule.test(readFileSync(f, 'utf8'))).map((f) => relative(root, f)), []);
});

test('an issue session keeps one branch from spec to implementation', () => {
  const session = read('skills/engineering/issue-session/SKILL.md');
  assert.match(session, /git switch -c issue-<根号> origin\/<主分支>/);
  assert.match(session, /不切新分支：下一段接着在这一组的分支上做/);
  assert.doesNotMatch(session, /git switch -c <下一段>/);
});

test('setup asks whether there is a knowledge base and where, and builds docs/ only for the in-repo answer', () => {
  const q = read('skills/engineering/setup/references/questions.md');
  assert.match(q, /\*\*要不要知识库，放在哪\*\*/);
  for (const answer of ['**仓库里的 `docs/`**', '**仓库外的目录（或单独一个仓库）**', '**不要**']) assert.ok(q.includes(answer), answer);
  const setup = read('skills/engineering/setup/SKILL.md');
  assert.match(setup, /`docs\/` 骨架：人选了「仓库里的 `docs\/`」才建/);
  assert.match(setup, /知识库选了仓库外或不要的：说清 spec、设计、dreaming 这些流程只读写仓库里的 `docs\/`/);
});
