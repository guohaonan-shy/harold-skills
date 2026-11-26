/**
 * Tripwire — one spelling for the draft-shots directory in design-archive's review-reconcile reference
 * (docs/spec/dreaming-shots-dir, ticket 01).
 *
 * 「输入」 defines the draft-shots directory once: `shots/` under the intermediates directory (`<中间物目录>`). The reference's
 * step 「拍」 uses it by that name. A relative `.tmp/dreaming/<日期>/shots` there lands in the code worktree and lacks the project
 * layer, so the images the later steps read from the 「输入」 path are not there.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const ref = readFileSync(join(pluginRoot, 'skills', 'design', 'design-archive', 'references', 'review-reconcile.md'), 'utf8');

const inputSection = ref.slice(ref.indexOf('### 输入'), ref.indexOf('### 源码波'));
const shootStep = ref.slice(ref.indexOf('3. **拍**'), ref.indexOf('4. **比**'));

test('the reference has the 「输入」 section and the 「拍」 step', () => {
  assert.ok(inputSection.length > 0, 'no 「### 输入」 section');
  assert.ok(shootStep.length > 0, 'no 「3. **拍**」 step');
});

test('「输入」 defines the draft-shots directory as `shots/` under the intermediates directory', () => {
  assert.match(inputSection, /\*\*中间物目录\*\* `<home>\/\.tmp\/dreaming\/<日期>\/<项目名>\/`/);
  assert.match(inputSection, /\*\*草稿图目录\*\*是它下面的 `shots\/`/);
});

test('every directory with `shots` in the reference is `<中间物目录>/shots`; the only bare `shots/` is the definition in 「输入」', () => {
  const bad = [];
  for (const m of ref.matchAll(/(\S*)shots(?![A-Za-z])/g)) {
    const prefix = m[1].replace(/^`+/, '');
    if (prefix === '<中间物目录>/') continue;
    const at = m.index;
    const inInput = at >= ref.indexOf(inputSection) && at < ref.indexOf(inputSection) + inputSection.length;
    if (prefix === '' && inInput) continue;
    bad.push(`${prefix}shots`);
  }
  assert.deepEqual(bad, []);
});

test('no `.tmp/dreaming/` written in the reference other than the one 「输入」 definition of the intermediates directory', () => {
  const hits = ref.match(/\.tmp\/dreaming\//g) ?? [];
  assert.equal(hits.length, 1, `.tmp/dreaming/ appears ${hits.length} times`);
  assert.ok(inputSection.includes('.tmp/dreaming/'), 'the one occurrence is not in 「输入」');
});

test('the 「拍」 step names the directory four times: the summary, `shoot --out`, `sections screen --out`, `sections cover --out`', () => {
  assert.equal((shootStep.match(/<中间物目录>\/shots/g) ?? []).length, 4);
  assert.match(shootStep, /图都拍到 `<中间物目录>\/shots\/` 下/);
  assert.match(shootStep, /`shoot` 的 `--out` 用 `<中间物目录>\/shots\/<状态 id>`/);
  assert.match(shootStep, /sections screen <项目目录> <状态 id> --out <中间物目录>\/shots/);
  assert.match(shootStep, /sections cover <项目目录> <状态 id> --out <中间物目录>\/shots/);
});
