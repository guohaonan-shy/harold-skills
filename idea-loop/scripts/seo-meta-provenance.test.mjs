/**
 * seo-meta-provenance: a key page's new title / description that a merged PR introduced between the two
 * audits is a deliberate change, not a regression. The history is a real temporary git repo; dates are
 * pinned with GIT_AUTHOR_DATE / GIT_COMMITTER_DATE (same trick as retro-pool-reopened.test.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { regressions } from './seo-baseline.mjs';
import { parseSeoMd } from './seo-md.mjs';
import { judge } from './seo-meta-provenance.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'seo-meta-provenance.mjs');

const PREV_AT = '2026-11-01T10:00:00Z';
const CUR_AT = '2026-11-08T10:00:00Z';
const URL_A = 'https://cookbook.example/pricing';
const URL_B = 'https://cookbook.example/about';

/** A repo whose main branch has: base commit (Oct 20), then the merges the test asks for. */
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'seo-meta-prov-'));
  const run = (when, ...args) =>
    execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when },
    });
  run('2026-10-20T09:00:00Z', 'init', '-q', '-b', 'main');
  run('2026-10-20T09:00:00Z', 'config', 'user.email', 't@example.com');
  run('2026-10-20T09:00:00Z', 'config', 'user.name', 't');
  const write = (file, text) => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  };
  const commitAll = (when, msg) => {
    run(when, 'add', '-A');
    run(when, 'commit', '-q', '-m', msg);
  };
  write('pricing.md', 'title: Old pricing\ndescription: Old plans\n');
  write('about.md', 'title: About us\ndescription: Who we are\n');
  commitAll('2026-10-20T09:00:00Z', 'base');
  /** Land `file` content on a feature branch (commit at `commitAt`), then merge it as PR #n at `mergeAt`. */
  const mergePr = (n, file, text, commitAt, mergeAt) => {
    run(commitAt, 'checkout', '-q', '-b', `pr-${n}`);
    write(file, text);
    commitAll(commitAt, `edit ${file}`);
    run(mergeAt, 'checkout', '-q', 'main');
    run(mergeAt, 'merge', '--no-ff', '-q', '-m', `Merge pull request #${n} from user/pr-${n}`, `pr-${n}`);
  };
  return { dir, write, commitAll, mergePr, run };
}

const page = (url, over = {}) => ({ url, statusCode: 200, title: 'Pricing', metaDescription: 'Plans', isIndexable: true, inSitemap: true, ...over });
const SEO = parseSeoMd(`## 重点页面\n- \`${URL_A}\`\n- \`${URL_B}\`\n`);

function metaFinding(prev, cur) {
  const out = regressions(SEO, prev, cur);
  return out.find((f) => f.kind === 'key-page-meta-changed');
}
const audits = (prevPages, curPages) => [
  { auditId: 'old', completedAt: PREV_AT, pages: prevPages },
  { auditId: 'new', completedAt: CUR_AT, pages: curPages },
];
const judgeIt = (repo, prev, cur, findings, extra = {}) =>
  judge({ repo: repo.dir, previous: prev, current: cur, findings, since: PREV_AT, until: CUR_AT, branch: 'main', ...extra });

test('a new title that a PR merged between the two audits introduced is deliberate: no finding, the PR is named', () => {
  const repo = makeRepo();
  repo.mergePr(42, 'pricing.md', 'title: Pricing that fits any kitchen\ndescription: Old plans\n', '2026-11-03T09:00:00Z', '2026-11-04T09:00:00Z');
  const [prev, cur] = audits(
    [page(URL_A, { title: 'Old pricing', metaDescription: 'Old plans' }), page(URL_B, { title: 'About us', metaDescription: 'Who we are' })],
    [page(URL_A, { title: 'Pricing that fits any kitchen', metaDescription: 'Old plans' }), page(URL_B, { title: 'About us', metaDescription: 'Who we are' })],
  );
  const finding = metaFinding(prev, cur);
  assert.deepEqual(finding.targets, [URL_A]);
  const out = judgeIt(repo, prev, cur, [finding]);
  assert.deepEqual(out.findings, []);
  assert.equal(out.intentional.length, 1);
  assert.equal(out.intentional[0].url, URL_A);
  assert.deepEqual(out.intentional[0].prs, [42]);
  assert.equal(out.log, `有意改动：${URL_A} → #42`);
});

test('a title found nowhere in the history stays a finding, untouched', () => {
  const repo = makeRepo();
  repo.mergePr(42, 'pricing.md', 'title: Something else entirely\ndescription: Old plans\n', '2026-11-03T09:00:00Z', '2026-11-04T09:00:00Z');
  const [prev, cur] = audits(
    [page(URL_A, { title: 'Old pricing', metaDescription: 'Old plans' })],
    [page(URL_A, { title: 'A title nobody ever committed', metaDescription: 'Old plans' })],
  );
  const finding = metaFinding(prev, cur);
  const out = judgeIt(repo, prev, cur, [finding]);
  assert.deepEqual(out.findings, [finding]);
  assert.deepEqual(out.intentional, []);
  assert.equal(out.log, null);
});

test('a PR merged outside the two audits does not count (before the earlier audit, after the later one)', () => {
  const repo = makeRepo();
  repo.mergePr(10, 'pricing.md', 'title: Early title\ndescription: Old plans\n', '2026-10-25T09:00:00Z', '2026-10-26T09:00:00Z');
  repo.mergePr(11, 'about.md', 'title: Late title\ndescription: Who we are\n', '2026-11-09T09:00:00Z', '2026-11-10T09:00:00Z');
  const [prev, cur] = audits(
    [page(URL_A, { title: 'Old pricing' }), page(URL_B, { title: 'About us' })],
    [page(URL_A, { title: 'Early title' }), page(URL_B, { title: 'Late title' })],
  );
  const finding = metaFinding(prev, cur);
  const out = judgeIt(repo, prev, cur, [finding]);
  assert.deepEqual(out.findings, [finding]);
  assert.deepEqual(out.intentional, []);
});

test('a PR that merges inside the window counts even when its commit was authored before the earlier audit', () => {
  const repo = makeRepo();
  repo.mergePr(7, 'pricing.md', 'title: Long-lived branch title\ndescription: Old plans\n', '2026-10-28T09:00:00Z', '2026-11-05T09:00:00Z');
  const [prev, cur] = audits([page(URL_A, { title: 'Old pricing' })], [page(URL_A, { title: 'Long-lived branch title' })]);
  const out = judgeIt(repo, prev, cur, [metaFinding(prev, cur)]);
  assert.deepEqual(out.findings, []);
  assert.deepEqual(out.intentional[0].prs, [7]);
});

test('only the pages with a provenance drop out; the finding is rebuilt for the rest', () => {
  const repo = makeRepo();
  repo.mergePr(42, 'pricing.md', 'title: Pricing that fits any kitchen\ndescription: Old plans\n', '2026-11-03T09:00:00Z', '2026-11-04T09:00:00Z');
  const [prev, cur] = audits(
    [page(URL_A, { title: 'Old pricing' }), page(URL_B, { title: 'About us' })],
    [page(URL_A, { title: 'Pricing that fits any kitchen' }), page(URL_B, { title: 'Mystery new title' })],
  );
  const finding = metaFinding(prev, cur);
  assert.deepEqual(finding.targets, [URL_A, URL_B]);
  const out = judgeIt(repo, prev, cur, [finding]);
  assert.equal(out.findings.length, 1);
  const [left] = out.findings;
  assert.equal(left.kind, 'key-page-meta-changed');
  assert.deepEqual(left.targets, [URL_B]);
  assert.match(left.title, /^1 个重点页面/);
  assert.match(left.evidence.values, /Mystery new title/);
  assert.ok(!left.evidence.values.includes(URL_A));
  assert.deepEqual(left.acceptance, [`${URL_B} 的 title 和 description 是有意写下的版本`]);
  assert.deepEqual(out.intentional.map((i) => i.url), [URL_A]);
});

test('a page whose title and description both changed is deliberate only if both strings have a provenance', () => {
  const repo = makeRepo();
  repo.mergePr(42, 'pricing.md', 'title: New title here\ndescription: Old plans\n', '2026-11-03T09:00:00Z', '2026-11-04T09:00:00Z');
  const [prev, cur] = audits(
    [page(URL_A, { title: 'Old pricing', metaDescription: 'Old plans' })],
    [page(URL_A, { title: 'New title here', metaDescription: 'A description nobody committed' })],
  );
  const finding = metaFinding(prev, cur);
  const out = judgeIt(repo, prev, cur, [finding]);
  assert.equal(out.findings.length, 1);
  assert.deepEqual(out.intentional, []);

  repo.mergePr(43, 'pricing.md', 'title: New title here\ndescription: Brand new plans copy\n', '2026-11-05T09:00:00Z', '2026-11-06T09:00:00Z');
  const cur2 = { ...cur, pages: [page(URL_A, { title: 'New title here', metaDescription: 'Brand new plans copy' })] };
  const out2 = judgeIt(repo, prev, cur2, [metaFinding(prev, cur2)]);
  assert.deepEqual(out2.findings, []);
  assert.deepEqual(out2.intentional[0].prs, [42, 43]);
  assert.equal(out2.log, `有意改动：${URL_A} → #42、#43`);
});

test('a squash-merged commit on main whose subject ends in (#N) names that PR', () => {
  const repo = makeRepo();
  repo.write('pricing.md', 'title: Squashed title\ndescription: Old plans\n');
  repo.commitAll('2026-11-04T09:00:00Z', 'Rewrite pricing title (#51)');
  const [prev, cur] = audits([page(URL_A, { title: 'Old pricing' })], [page(URL_A, { title: 'Squashed title' })]);
  const out = judgeIt(repo, prev, cur, [metaFinding(prev, cur)]);
  assert.deepEqual(out.findings, []);
  assert.deepEqual(out.intentional[0].prs, [51]);
});

test('a direct commit to main with no PR number is not a provenance', () => {
  const repo = makeRepo();
  repo.write('pricing.md', 'title: Pushed straight\ndescription: Old plans\n');
  repo.commitAll('2026-11-04T09:00:00Z', 'tweak pricing title');
  const [prev, cur] = audits([page(URL_A, { title: 'Old pricing' })], [page(URL_A, { title: 'Pushed straight' })]);
  const finding = metaFinding(prev, cur);
  assert.deepEqual(judgeIt(repo, prev, cur, [finding]).findings, [finding]);
});

test('a title that was later removed from the repo is looked up by the commit that added it, and other findings pass through', () => {
  const repo = makeRepo();
  repo.mergePr(42, 'pricing.md', 'title: Pricing that fits any kitchen\ndescription: Old plans\n', '2026-11-03T09:00:00Z', '2026-11-04T09:00:00Z');
  const [prev, cur] = audits([page(URL_A, { title: 'Old pricing' })], [page(URL_A, { title: 'Pricing that fits any kitchen' })]);
  const other = { direction: 'technical', kind: 'key-page-regression', title: 'x', targets: [URL_B] };
  const out = judgeIt(repo, prev, cur, [other, metaFinding(prev, cur)]);
  assert.deepEqual(out.findings, [other]);
});

test('CLI: prints the verdict as JSON; unreadable input exits 1 with the reason on stderr', () => {
  const repo = makeRepo();
  repo.mergePr(42, 'pricing.md', 'title: Pricing that fits any kitchen\ndescription: Old plans\n', '2026-11-03T09:00:00Z', '2026-11-04T09:00:00Z');
  const [prev, cur] = audits([page(URL_A, { title: 'Old pricing' })], [page(URL_A, { title: 'Pricing that fits any kitchen' })]);
  const files = mkdtempSync(join(tmpdir(), 'seo-meta-prov-files-'));
  const w = (name, v) => {
    writeFileSync(join(files, name), JSON.stringify(v));
    return join(files, name);
  };
  const args = [SCRIPT, repo.dir, w('prev.json', prev), w('cur.json', cur), w('findings.json', [metaFinding(prev, cur)]), PREV_AT, CUR_AT, '--branch=main'];
  const ok = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const json = JSON.parse(ok.stdout);
  assert.deepEqual(json.findings, []);
  assert.equal(json.log, `有意改动：${URL_A} → #42`);

  const bad = spawnSync(process.execPath, [...args.slice(0, 2), join(files, 'nope.json'), ...args.slice(3)], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.ok(bad.stderr.length > 0);

  const notRepo = spawnSync(process.execPath, [SCRIPT, files, ...args.slice(2)], { encoding: 'utf8' });
  assert.equal(notRepo.status, 1);
});
