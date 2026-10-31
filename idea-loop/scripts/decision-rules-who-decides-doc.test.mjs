/**
 * Tripwire — decision-rules only says who decides; how to write what a human reads lives in evidence;
 * adding a rule starts with "is it a special case of an existing one".
 *
 * Spec decision-rules-who-decides, ticket 01 (issue #80). Before: decision-rules carried a section
 * 「交给人时」 and a reference (handing-to-human.md) about how to write a question for the human, and seven
 * places pointed at it; writing-for-agents and retro only ever appended. These checks pin: no text left
 * in the plugin that points at the old section or reference (dreaming's own step names excepted), the
 * reference gone, evidence opening with the reader model and covering the shared writing rules inside
 * 5000 characters, 「先归并」 in writing-for-agents, a 「归并」 field in retro's candidate format (and in
 * the places that repeat the format), the four pool candidates re-pointed, and the replay case driving
 * evidence.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(pluginRoot, '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const bodyOf = (raw) => raw.replace(/^---\n[\s\S]*?\n---\n/, '');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(md|mjs|json)$/.test(name) && !/\.test\.mjs$/.test(name)) out.push(p);
  }
  return out;
}

test('nothing in the plugin points at the old 「交给人时」 section or the handing-to-human reference', () => {
  const hits = [];
  for (const file of walk(pluginRoot)) {
    // dreaming's own step names (「交给人时出候选卡」「交给人时出维护卡」) are not that section
    const text = readFileSync(file, 'utf8').replace(/交给人时出(候选|维护)卡/g, '');
    if (/交给人时|handing-to-human/.test(text)) hits.push(relative(pluginRoot, file));
  }
  assert.deepEqual(hits, [], `还指着旧的「交给人时」/ handing-to-human：${hits.join(', ')}`);
});

test('decision-rules has no references directory and its description no longer routes on how to write a question', () => {
  const dir = join(pluginRoot, 'skills', 'productivity', 'decision-rules');
  assert.ok(!existsSync(join(dir, 'references')), 'decision-rules/references 还在');
  const raw = read('skills', 'productivity', 'decision-rules', 'SKILL.md');
  const description = raw.match(/^description: (.*)$/m)[1];
  assert.doesNotMatch(description, /功课/);
  assert.doesNotMatch(bodyOf(raw), /^## 交给人时/m);
});

test('evidence opens with the reader model and carries the six shared writing rules', () => {
  const raw = read('skills', 'productivity', 'evidence', 'SKILL.md');
  const body = bodyOf(raw);
  const description = raw.match(/^description: (.*)$/m)[1];
  assert.match(description, /写给人看|写给人/, 'description 要路由「写给人看的东西」');
  assert.match(description, /截图|配图/, 'description 还要路由「配图」');

  const firstBlock = body.trim().split(/\n##? /)[0];
  assert.match(firstBlock, /不清楚实现细节/, '正文开头要写读者模型');
  assert.match(firstBlock, /快速/, '读者模型要写读者要的是快速看懂、拿到证据、决定');

  for (const [name, re] of [
    ['结论在前', /结论在前/],
    ['最小一种视图', /最小/],
    ['现状带出处和规模数字', /出处[\s\S]*规模数字|规模数字[\s\S]*出处/],
    ['陌生叫法第一次出现说清', /第一次出现/],
    ['比对同条件', /同条件/],
    ['要人定的写成一道题（推荐、真实例子、评判标准）', /一道题[\s\S]*推荐|推荐[\s\S]*一道题/],
  ]) assert.match(body, re, `共用写法缺：${name}`);
  assert.match(body, /真实例子/);
  assert.match(body, /评判标准/);
  assert.match(body, /裸编号/);
  assert.match(body, /最新基准/);

  // the two kinds of figures and what both share are still there
  assert.match(body, /references\/spec-figures\.md/);
  assert.match(body, /references\/delivery\.md/);
  assert.match(body, /^## 两类共用的/m);
});

test('the evidence body is at most 5000 characters (UTF-8 characters, not bytes)', () => {
  const body = bodyOf(read('skills', 'productivity', 'evidence', 'SKILL.md'));
  assert.ok([...body].length <= 5000, `body is ${[...body].length} characters`);
});

test('writing-for-agents says to look for an existing principle before adding one', () => {
  const body = bodyOf(read('skills', 'productivity', 'writing-for-agents', 'SKILL.md'));
  assert.match(body, /先归并/);
  assert.match(body, /特例/);
  assert.match(body, /不加新条/);
});

test('retro\'s candidate format has a 归并 field, and so does everywhere that repeats the format', () => {
  const skill = read('skills', 'productivity', 'retro', 'SKILL.md');
  const block = skill.match(/```\n(### 候选[\s\S]*?)```/);
  assert.ok(block, 'retro/SKILL.md 里找不到候选格式的代码块');
  assert.match(block[1], /^- 归并：.*特例/m);
  assert.match(block[1], /没有写「无」/);
  // order: 新文 comes before 归并, 归并 before 同类
  assert.ok(block[1].indexOf('- 新文') < block[1].indexOf('- 归并') && block[1].indexOf('- 归并') < block[1].indexOf('- 同类'));

  for (const f of ['decision-record.md', 'candidate-pool.md']) {
    const text = read('skills', 'productivity', 'retro', 'references', f);
    assert.match(text, /^- 归并：/m, `${f} 的格式里没有「归并」一栏`);
  }
});

test('the four pool candidates that pointed at handing-to-human now point at evidence; other lines untouched', () => {
  for (const f of [
    '2026-10-26-examples-from-real-material.md',
    '2026-10-26-goal-figures-for-human.md',
    '2026-10-31-handing-to-human-name-references.md',
    'retro-candidate-95.md',
  ]) {
    const text = readFileSync(join(repoRoot, 'docs', 'records', 'retro-candidates', f), 'utf8');
    const landing = text.split('\n').find((l) => l.startsWith('- 落点：'));
    assert.ok(landing, `${f} 没有落点一行`);
    assert.match(landing, /evidence/, `${f} 的落点还没改到 evidence`);
    assert.doesNotMatch(landing, /handing-to-human|交给人时/, `${f} 的落点还指着旧位置`);
  }
});

test('the explain-mechanism replay case drives evidence and keeps its question', () => {
  const c = JSON.parse(read('evals', 'retro', 'cases', 'explain-mechanism', 'case.json'));
  assert.match(c.prompt, /\/idea-loop:evidence/);
  assert.doesNotMatch(c.prompt, /交给人时/);
  assert.match(c.prompt, /子代理/);
  assert.match(c.prompt, /claude -p/);
  assert.equal(c.commit, '96d66f2');
  assert.match(c.question, /子代理和 `claude -p` 各是什么/);
  assert.equal(c.quote, '我理解跟claude -p是一样的，二者的区别能跟我讲一下吗？');
});
