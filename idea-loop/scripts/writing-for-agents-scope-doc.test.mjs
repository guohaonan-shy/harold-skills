/**
 * Tripwire — writing-for-agents' three scope rules are folded into the principles that already exist,
 * not added as new ones.
 *
 * Spec writing-for-agents-pruning-layers, ticket 03. Before: 「信息层级」 only said "inline what every
 * branch needs", without saying branches are cut by what the caller needs (so a data-model doc's entities
 * got pushed behind a pointer used only by writers); 「剪枝」 never named references behind a pointer in
 * the environment / sediment lines; relevance was not split by where the doc gets read, so a general doc
 * kept one project's page names. These checks pin the three rewrites inside the existing paragraphs, no
 * new heading, and no plugin- or project-specific name in this general document.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(pluginRoot, 'skills', 'productivity', 'writing-for-agents', 'SKILL.md'), 'utf8');
const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');

const section = (title) => {
  const m = body.match(new RegExp(`^## ${title}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  assert.ok(m, `找不到「${title}」一节`);
  return m[1];
};
const bullet = (text, key) => {
  const line = text.split('\n').find((l) => l.startsWith('- ') && l.includes(key));
  assert.ok(line, `「剪枝」里找不到含「${key}」的那一条`);
  return line;
};

test('信息层级: branches are cut by what the caller needs, and a data-model doc shares its entities across branches', () => {
  const s = section('信息层级');
  assert.match(s, /分支按调用方要的东西切，不按文档的操作切/);
  assert.match(s, /数据模型/);
  assert.match(s, /实体[^。]*关联[^。]*每个分支/);
  assert.match(s, /读写共用/);
});

test('剪枝: the environment line covers references behind a pointer, and sediment names references', () => {
  const s = section('剪枝');
  const env = bullet(s, '环境');
  assert.match(env, /挪到指针后面的参考同样算/);
  assert.match(env, /照做/);
  assert.match(env, /处理的输出/);
  assert.match(env, /靠看找不到的坑/);
  assert.match(env, /`--help`/);
  const rel = bullet(s, '相关性');
  assert.match(rel, /沉积/);
  assert.match(rel, /参考[^。]*最容易沉积/);
});

test('剪枝: relevance is counted by scope — general docs carry no project info, project docs may', () => {
  const rel = bullet(section('剪枝'), '相关性');
  assert.match(rel, /作用域|会在哪/);
  // 按读到它的范围定义：会在不止一个项目里被读到的 → 不带「任何」项目信息；只在一个项目里读的才带
  assert.match(rel, /不止一个项目里被读到的[^。；]*不带任何项目信息/);
  assert.match(rel, /例子[^。；]*(任何项目|通用)/);
  assert.match(rel, /只在一个项目里读的[^。；]*项目信息[^。；]*few-shot/);
  assert.match(rel, /AGENTS\.md/);
});

test('the three rewrites add no heading and no plugin- or project-specific name', () => {
  const headings = body.match(/^#{1,6} .*$/gm);
  assert.deepEqual(
    headings,
    ['## 上下文指针', '## 两种负担', '## 信息层级', '## 步骤与完成条件', '## 什么时候拆', '## 引导词', '## 剪枝'],
  );
  assert.doesNotMatch(body, /idea-loop|Toeflair|design-archive/);
});
