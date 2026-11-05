import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDesignMd, renderErrors } from './design-md-hook.mjs';

const hook = join(dirname(fileURLToPath(import.meta.url)), 'design-md-hook.mjs');
const dir = mkdtempSync(join(tmpdir(), 'design-md-hook-'));
const designMd = join(dir, 'DESIGN.md');
writeFileSync(designMd, '---\nname: Demo\n---\n\n## Overview\nCalm.\n');

// A stand-in for the official CLI: prints whatever report FAKE_REPORT holds, so no test hits the network.
const fakeCli = join(dir, 'fake-cli.mjs');
writeFileSync(fakeCli, 'process.stdout.write(process.env.FAKE_REPORT || "");');

function runHook(filePath, report) {
  return spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_input: { file_path: filePath } }),
    encoding: 'utf8',
    env: { ...process.env, DESIGN_MD_CLI: fakeCli, FAKE_REPORT: report === undefined ? '' : JSON.stringify(report) },
  });
}

const errorReport = {
  findings: [
    { severity: 'error', path: 'components.button', message: 'Reference {colors.nope} does not resolve to any defined token.', rule: 'broken-ref' },
    { severity: 'warning', message: 'Section order', rule: 'section-order' },
  ],
  summary: { errors: 1, warnings: 1, infos: 0 },
};
const warningOnly = { findings: [{ severity: 'warning', message: 'Section order', rule: 'section-order' }], summary: { errors: 0, warnings: 1 } };

test('only a file named exactly DESIGN.md counts', () => {
  assert.equal(isDesignMd('/repo/DESIGN.md'), true);
  assert.equal(isDesignMd('/repo/apps/web/DESIGN.md'), true);
  assert.equal(isDesignMd('/repo/docs/design/x/x-design.md'), false);
  assert.equal(isDesignMd('/repo/design.md'), false);
  assert.equal(isDesignMd(undefined), false);
});

test('renders errors only, and nothing when there are none', () => {
  const msg = renderErrors(errorReport, 'DESIGN.md');
  assert.match(msg, /1 error\(s\)/);
  assert.match(msg, /\[broken-ref\] components\.button:/);
  assert.doesNotMatch(msg, /section-order/);
  assert.equal(renderErrors(warningOnly, 'DESIGN.md'), null);
});

test('a write to another file is silent', () => {
  const res = runHook(join(dir, 'README.md'), errorReport);
  assert.equal(res.status, 0);
  assert.equal(res.stderr, '');
});

test('lint errors on DESIGN.md block with exit 2', () => {
  const res = runHook(designMd, errorReport);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /broken-ref/);
});

test('warnings alone do not block', () => {
  const res = runHook(designMd, warningOnly);
  assert.equal(res.status, 0);
  assert.equal(res.stderr, '');
});

test('an unreachable CLI is reported but never blocks', () => {
  const res = runHook(designMd, undefined);
  assert.equal(res.status, 0);
  assert.match(res.stderr, /could not run/);
});
