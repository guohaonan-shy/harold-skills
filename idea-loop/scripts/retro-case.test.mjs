/**
 * Replay cases (idea-loop/evals/retro/cases/<case>/): the format check.
 *
 * A replay case records one decision point of a past session so a rule change can be replayed against it.
 * The check makes sure no case silently loses a part the runner needs. Nothing here judges whether a
 * case is a good one: that is the runner's job (a case the pre-change plugin already passes is
 * reported as "did not catch the problem").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCase, checkCasesDir, loadCases } from '../evals/retro/cases.mjs';

const good = () => ({
  source: '虚构的 issue 会话，第 3 轮',
  commit: 'a1b2c3d',
  prompt: '/idea-loop:some-skill 把这件事摆给我',
  stop_at: '摆出决定题、等人回答的那一刻',
  question: '摆出的题里，有没有用一句话讲清其中一个机制？',
  quote: '二者的区别能跟我讲一下吗？',
  size: 'small',
  size_basis: '只驱动 some-skill 一个 skill，不起插件 agent、不开浏览器、不调付费外部服务',
});

const fields = (c) => validateCase(c).map((p) => p.field);

test('a complete case has no problems', () => {
  assert.deepEqual(validateCase(good()), []);
});

test('a missing part is reported by name: commit, prompt, stop_at, question, size, size_basis', () => {
  for (const f of ['commit', 'prompt', 'stop_at', 'question', 'size', 'size_basis']) {
    const c = good();
    delete c[f];
    assert.deepEqual(fields(c), [f], `without ${f}`);
  }
});

test('a blank part counts as missing', () => {
  for (const f of ['commit', 'prompt', 'stop_at', 'question', 'size_basis', 'quote']) {
    assert.deepEqual(fields({ ...good(), [f]: '   ' }), [f], `blank ${f}`);
  }
});

test('the question carries the human original words it was written from', () => {
  const c = good();
  delete c.quote;
  assert.deepEqual(fields(c), ['quote']);
});

test('the commit must look like a commit id', () => {
  assert.deepEqual(fields({ ...good(), commit: 'main' }), ['commit']);
  assert.deepEqual(fields({ ...good(), commit: 'xyz1234' }), ['commit']);
  assert.deepEqual(validateCase({ ...good(), commit: '96d66f2a7c9d3b1e4f5a6b7c8d9e0f1a2b3c4d5e' }), []);
});

test('the question must be a yes/no question, written as a question', () => {
  assert.deepEqual(fields({ ...good(), question: '摆出的题里讲清机制了' }), ['question']);
  assert.deepEqual(validateCase({ ...good(), question: 'Did the report explain the mechanism?' }), []);
});

test('size is small or large, nothing else', () => {
  assert.deepEqual(fields({ ...good(), size: 'medium' }), ['size']);
  assert.deepEqual(validateCase({ ...good(), size: 'large' }), []);
});

test('every problem says what is wrong in words, not only a field name', () => {
  const [p] = validateCase({ ...good(), commit: undefined });
  assert.equal(p.field, 'commit');
  assert.match(p.message, /提交号/);
});

test('a case that is not an object is one problem', () => {
  assert.equal(validateCase(null).length, 1);
  assert.equal(validateCase('x').length, 1);
});

test('checkCasesDir reports a case folder without case.json, without annotations.md, or with a bad name', () => {
  const root = mkdtempSync(join(tmpdir(), 'retro-cases-'));
  const mk = (name, withJson, withAnn, body = good()) => {
    const d = join(root, 'cases', name);
    mkdirSync(d, { recursive: true });
    if (withJson) writeFileSync(join(d, 'case.json'), JSON.stringify(body));
    if (withAnn) writeFileSync(join(d, 'annotations.md'), '# x\n');
  };
  mk('fine-case', true, true);
  mk('no-json', false, true);
  mk('no-notes', true, false);
  mk('Bad_Name', true, true);
  mk('half-written', true, true, { ...good(), prompt: '' });
  const problems = checkCasesDir(root).map((p) => `${p.case}:${p.field}`).sort();
  assert.deepEqual(problems, ['Bad_Name:name', 'half-written:prompt', 'no-json:case.json', 'no-notes:annotations.md']);
});

test('loadCases returns the cases sorted by name, each with its name', () => {
  const root = mkdtempSync(join(tmpdir(), 'retro-cases-'));
  for (const n of ['b-case', 'a-case']) {
    mkdirSync(join(root, 'cases', n), { recursive: true });
    writeFileSync(join(root, 'cases', n, 'case.json'), JSON.stringify(good()));
  }
  assert.deepEqual(loadCases(root).map((c) => c.name), ['a-case', 'b-case']);
});

test('the cases that ship with the plugin are all well-formed', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'evals', 'retro');
  assert.deepEqual(checkCasesDir(root), []);
});
