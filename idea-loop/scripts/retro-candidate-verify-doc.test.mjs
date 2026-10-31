/**
 * Tripwire — a retro candidate says how its change will be shown to have fixed the original problem.
 *
 * Spec writing-for-agents-pruning-layers, ticket 05. Before: the candidate format had seven fields
 * (信号 … 归并, 同类) and nothing that said, at the moment the human approves, how the change would be
 * verified; the replay case was only written at implementation time. These checks pin: a 「验证」 field in
 * retro's candidate format (between 归并 and 同类) with its three ways of writing, the 做完的条件 counting
 * nine items and checking that field, the same field in the places that repeat the format (the pool file in
 * candidate-pool.md, the candidate block in decision-record.md, the shape in docs/records/index.md), and the
 * pool scripts still accepting files that have no 验证 line (the existing pool files are not backfilled).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(pluginRoot, '..');
const retroDir = join(pluginRoot, 'skills', 'productivity', 'retro');
const skill = readFileSync(join(retroDir, 'SKILL.md'), 'utf8');
const pool = readFileSync(join(retroDir, 'references', 'candidate-pool.md'), 'utf8');
const record = readFileSync(join(retroDir, 'references', 'decision-record.md'), 'utf8');
const recordsIndex = readFileSync(join(repoRoot, 'docs', 'records', 'index.md'), 'utf8');

const block = skill.match(/```\n(### 候选[\s\S]*?)```/);

test('retro\'s candidate block has a 验证 field between 归并 and 同类', () => {
  assert.ok(block, 'retro/SKILL.md 里找不到候选格式的代码块');
  const b = block[1];
  assert.match(b, /^- 验证：/m, '候选格式里没有「验证」一栏');
  assert.ok(
    b.indexOf('- 归并') < b.indexOf('- 验证') && b.indexOf('- 验证') < b.indexOf('- 同类'),
    '「验证」应在「归并」之后、「同类」之前',
  );
});

test('the 验证 field names its three ways of writing: replay case (commit, prompt, yes/no question), a check, 判不了 with a reason', () => {
  assert.ok(block, 'no candidate block');
  const line = block[1].split('\n').find((l) => l.startsWith('- 验证：'));
  assert.ok(line, 'no 验证 line');
  assert.match(line, /回放用例/);
  assert.match(line, /提交/);
  assert.match(line, /prompt/);
  assert.match(line, /是\/否题/);
  assert.match(line, /检查/);
  assert.match(line, /先在历史错误上看它红/);
  assert.match(line, /判不了/);
  assert.match(line, /原因/);
});

test('the 做完的条件 of the candidate section counts nine items and checks the 验证 field', () => {
  const section = skill.split(/^## /m).find((s) => s.startsWith('3. 候选的形状'));
  assert.ok(section, 'no section 3');
  const done = section.split('\n').find((l) => l.startsWith('做完的条件'));
  assert.ok(done, 'section 3 has no 做完的条件');
  assert.match(done, /九项/);
  assert.doesNotMatch(done, /八项/);
  assert.match(done, /验证/);
  assert.match(done, /提交[^；]*存在/, '要核对「验证」里写的提交在仓库里存在');
  assert.match(done, /是\/否题[^；]*原话/, '要核对是/否题能从「原话」推出');
  assert.doesNotMatch(skill, /候选的八项|七栏/);
});

test('the places that repeat the candidate format carry the 验证 field too', () => {
  assert.match(pool, /^- 验证：/m, 'candidate-pool.md 的池文件格式里没有「验证」');
  assert.match(record, /^- 验证：/m, 'decision-record.md 的候选块里没有「验证」');
  assert.match(recordsIndex, /验证/, 'docs/records/index.md 的池形状里没有「验证」');
  // order inside the pool file shape: 归并 then 验证 then 例子
  const shape = pool.match(/```markdown\n([\s\S]*?)```/)[1];
  assert.ok(shape.indexOf('- 归并') < shape.indexOf('- 验证') && shape.indexOf('- 验证') < shape.indexOf('- 例子'));
});

test('the pool reader still accepts the existing pool files, which have no 验证 line', () => {
  const dir = join(repoRoot, 'docs', 'records', 'retro-candidates');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert.ok(files.length > 0);
  const r = spawnSync(process.execPath, [join(pluginRoot, 'scripts', 'retro-pool-count.mjs'), dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).problems, []);
});
