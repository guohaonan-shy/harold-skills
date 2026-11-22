/**
 * Tripwire — retro's section 3 first asks whether a correction can be judged mechanically.
 *
 * Spec skill-structure-checks, ticket 04. Before: the destination table in section 3 ended with a row
 * 「能机械判定 → 优先做成检查」, one destination among three, so a correction that a check could hold got
 * written as a prose rule. Now: the first step before the table asks 「能不能机械判定」; when it can, the
 * destination is a check, the 旧文 is the deleted text and the 验证 is the check's name seen red on the
 * historical error. The table keeps only the destinations for what a check cannot hold.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skill = readFileSync(join(pluginRoot, 'skills', 'productivity', 'retro', 'SKILL.md'), 'utf8');
const section = skill.split(/^## /m).find((s) => s.startsWith('3. 候选的形状'));

test('section 3 has a first step 「能不能机械判定」 before the destination table', () => {
  assert.ok(section, 'retro/SKILL.md has no section 3');
  const tableAt = section.search(/^\| 问题出在 \|/m);
  assert.ok(tableAt > 0, 'no destination table in section 3');
  const before = section.slice(0, tableAt);
  assert.match(before, /能不能机械判定/, '落点表之前没有「能不能机械判定」这一步');
});

test('the first step sends a mechanically judgeable correction to a check and deletes the old text', () => {
  const tableAt = section.search(/^\| 问题出在 \|/m);
  const step = section.slice(0, tableAt).split('\n').find((l) => /能不能机械判定/.test(l));
  assert.ok(step, 'no first-step line');
  assert.match(step, /落点是检查/, '第一步没写明能判的落点是检查');
  assert.match(step, /删掉/, '第一步没写明「旧文 / 新文」写成删掉原来那段文字');
  assert.match(step, /先在历史错误上看它红|验证/, '第一步没接上「验证」');
});

test('the destination table no longer has a 「能机械判定」 row', () => {
  const rows = section.split('\n').filter((l) => l.startsWith('|'));
  assert.ok(rows.length >= 3, 'destination table rows not found');
  for (const r of rows) assert.doesNotMatch(r, /能机械判定/, `落点表里还有这一行：${r}`);
});
