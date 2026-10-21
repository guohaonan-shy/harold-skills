import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { BUILTIN, render, templatePath } from './codex-prompt.mjs';

const fill = (axis, extra) => render(readFileSync(templatePath(axis), 'utf8'), { ...BUILTIN, worktree: '/w', base: 'abc123', wontfix: '无', ...extra });

test('both templates fill completely from the per-run references', () => {
  const spec = fill('spec', { spec: 'docs/spec/a/a.md', tickets: 'docs/spec/a/tickets/' });
  assert.match(spec, /git diff abc123\.\.\.HEAD/);
  assert.match(spec, /docs\/spec\/a\/a\.md/);
  assert.doesNotMatch(spec, /\{\{/);
  const standards = fill('standards', { rules: '`CODING_STANDARDS.md`、`REVIEW.md`', checks: '.tmp/pr-review/7/round-1/checks.md' });
  assert.match(standards, /CODING_STANDARDS\.md/);
  assert.doesNotMatch(standards, /\{\{/);
});

test('the built-in paths point at files that exist', () => {
  for (const p of Object.values(BUILTIN)) assert.ok(existsSync(p), p);
  assert.ok(existsSync(templatePath('spec')) && existsSync(templatePath('standards')));
});

test('a placeholder left empty or a key the template does not use is refused', () => {
  assert.throws(() => fill('spec', { tickets: 'x' }), /没给：spec/);
  assert.throws(() => fill('spec', { spec: 'x', tickets: 'x', rules: 'y' }), /模板里没有：rules/);
});
