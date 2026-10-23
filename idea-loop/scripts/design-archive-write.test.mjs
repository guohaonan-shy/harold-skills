import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, SPEC_SLUG, compliantFiles, writeRepo } from './design-archive-fixture.mjs';
import { check } from './design-archive-check.mjs';
import { archiveSpec, ignoresTmp, lfsCovers, renderIndex, rewriteLinks, setUsedBy } from './design-archive-write.mjs';
import { loadArchive, walk } from './design-archive.mjs';

const CLI = fileURLToPath(new URL('./design-archive-write.mjs', import.meta.url));
const TMP = `docs/design/tmp/${SPEC_SLUG}`;
const D = (rel) => `${TMP}/delta/${rel}`;
const P = (rel) => `${BASE}/${rel}`;
const SPEC = `docs/spec/${SPEC_SLUG}/${SPEC_SLUG}.md`;
const RESULTS = P('pages/cookbook/cookbook--search-results.md');
const SAVED = P('pages/cookbook/cookbook--recipe-saved.md');
const OVERVIEW = P('pages/pantry/pantry--overview.md');

const LFS = ['png', 'gif', 'webm'].map((e) => `docs/design/prod/**/assets/**/*.${e} filter=lfs diff=lfs merge=lfs -text`).join('\n') + '\n';
const PNG = (n) => Buffer.from(`PNG-${n}`);

/**
 * The requirement under test: two new states (a share sheet, a share-done screen) reached from
 * recipe-saved, one edge changed (the keyboard save), one state removed (pantry--empty), a new
 * component, and the pantry overview now using SearchBox (so an existing component's usedBy grows).
 * The spec links three figures sitting in tmp/'s canvas.
 */
function requirement({ lfs = true, gitignore = true } = {}) {
  const base = compliantFiles();
  const state = (id, page, extra) =>
    `---\ntype: design-state\ntags: [${page}]\nsummary: ${id}\npage: "[[${page}]]"\n${extra}---\n\n## 这一屏\n\n画面。\n\n## 应看到什么\n\n- 看到画面\n`;
  const shareButton = `---\ntype: design-component\ntags: [component]\nsummary: 分享按钮\ncode: [src/components/ShareButton.tsx]\nusedBy: []\n---\n\n# ShareButton\n\n## 决定\n\n无\n\n## 设计法候选\n\n无\n`;
  const files = {
    ...base,
    // changed edge (keyboard save): the action text differs
    [D('pages/cookbook/cookbook--search-results.md')]: base[RESULTS].replace('action: 聚焦后按回车', 'action: 聚焦后按空格'),
    // recipe-saved gains the way into the two new states
    [D('pages/cookbook/cookbook--recipe-saved.md')]: base[SAVED].replace(
      'edges: []',
      'edges:\n  - id: share\n    to: "[[cookbook--share-sheet]]"\n    kind: user\n    component: "[[ShareButton]]"\n    locate: { role: button, name: 分享 }\n    action: click',
    ),
    [D('pages/cookbook/cookbook--share-sheet.md')]: state(
      'cookbook--share-sheet',
      'cookbook',
      'edges:\n  - id: send\n    to: "[[cookbook--share-done]]"\n    kind: user\n    component: "[[ShareButton]]"\n    locate: { role: button, name: 发送 }\n    action: click\n',
    ),
    [D('pages/cookbook/cookbook--share-done.md')]: state('cookbook--share-done', 'cookbook', 'edges: []\n'),
    [D('pages/cookbook/assets/cookbook--share-done.png')]: PNG('share-done'),
    [D('components/ShareButton/ShareButton.md')]: shareButton,
    [D('components/ShareButton/assets/hover.gif')]: PNG('hover'),
    // pantry--overview: no more edge to the removed state, and it now lists SearchBox
    [D('pages/pantry/pantry--overview.md')]: base[OVERVIEW]
      .replace(/  - id: empty-shelf[\s\S]*?删除全部食材记录\n/, '')
      .replace('components: ["[[RecipeCard]]"]', 'components: ["[[RecipeCard]]", "[[SearchBox]]"]'),
    [D('removed.md')]: '# 删除\n\n- [[pantry--empty]] —— 空状态并入 overview\n',
    // the canvas: figures, their sources, and things that are not figures
    [`${TMP}/canvas/assets/flows/flow-1-cookbook--share-sheet.png`]: PNG('flow-1'),
    [`${TMP}/canvas/assets/flows/flow-2-pantry--overview.png`]: PNG('flow-2'),
    [`${TMP}/canvas/assets/flows/flow-3-misc.png`]: PNG('flow-3'),
    [`${TMP}/canvas/assets/flows/src/flow-1.json`]: '{}',
    [`${TMP}/canvas/matrix/light-390.png`]: PNG('matrix'),
    [`${TMP}/canvas/${SPEC_SLUG}.html`]: '<html></html>',
    [`${TMP}/imagine/note.md`]: '# 方向说明\n',
  };
  files[SPEC] = `${base[SPEC]}
## 5.3 交互图

![分享](../../design/tmp/${SPEC_SLUG}/canvas/assets/flows/flow-1-cookbook--share-sheet.png)

![食材库](../../design/tmp/${SPEC_SLUG}/canvas/assets/flows/flow-2-pantry--overview.png "食材库")

![其他](<../../design/tmp/${SPEC_SLUG}/canvas/assets/flows/flow-3-misc.png>)

\`\`\`
![示例，围栏里的不改](../../design/tmp/${SPEC_SLUG}/canvas/assets/flows/flow-1-cookbook--share-sheet.png)
\`\`\`
`;
  if (lfs) files['.gitattributes'] = `* text=auto\n${LFS}`;
  if (gitignore) files['.gitignore'] = 'node_modules/\ndocs/design/tmp/\n';
  return files;
}

/** Every file under the repo → its bytes, so "nothing changed" is a deepEqual. */
function snapshot(root) {
  const out = {};
  for (const abs of walk(root, (_p, name) => name === '.git')) out[relative(root, abs)] = readFileSync(abs).toString('base64');
  return out;
}
const read = (root, rel) => readFileSync(join(root, rel), 'utf8');
const has = (root, rel) => existsSync(join(root, rel));
function cli(root, ...args) {
  return spawnSync('node', [CLI, root, ...args], { encoding: 'utf8' });
}
const archive = (files, opts) => {
  const root = writeRepo(files);
  return { root, result: archiveSpec(root, SPEC_SLUG, opts) };
};

// ---------- the archive ----------

test('archive: delta lands in prod, the removed state goes, usedBy and the index refresh, figures move, spec links follow, tmp is emptied', () => {
  const { root, result } = archive(requirement());
  assert.equal(result.ok, true, JSON.stringify(result.violations ?? result.errors));

  // two states added, an edge changed, one state removed
  assert.ok(has(root, P('pages/cookbook/cookbook--share-sheet.md')));
  assert.ok(has(root, P('pages/cookbook/cookbook--share-done.md')));
  assert.ok(has(root, P('components/ShareButton/ShareButton.md')));
  assert.match(read(root, RESULTS), /action: 聚焦后按空格/);
  assert.ok(!has(root, P('pages/pantry/pantry--empty.md')));
  assert.equal(readFileSync(join(root, P('pages/cookbook/assets/cookbook--share-done.png'))).toString(), 'PNG-share-done');
  assert.equal(readFileSync(join(root, P('components/ShareButton/assets/hover.gif'))).toString(), 'PNG-hover');

  // usedBy regenerated: a stale one in the delta, and an existing component outside the delta
  assert.match(read(root, P('components/ShareButton/ShareButton.md')), /^usedBy: \["\[\[cookbook\]\]"\]$/m);
  assert.match(read(root, P('components/SearchBox/SearchBox.md')), /^usedBy: \["\[\[cookbook\]\]", "\[\[pantry\]\]"\]$/m);

  // the index: tables from frontmatter, own settings kept, removed state gone
  const index = read(root, P('index.md'));
  assert.match(index, /^viewport: 1440x900$/m);
  assert.match(index, /^theme: light$/m);
  assert.match(index, /^locale: zh-CN$/m);
  assert.match(index, /\| \[\[cookbook\]\] \| .*\[\[cookbook--share-sheet\]\].* \|/);
  assert.match(index, /\| \[\[ShareButton\]\] \| \[\[cookbook\]\] \| 分享按钮 \|/);
  assert.match(index, /\| \[\[SearchBox\]\] \| \[\[cookbook\]\]、\[\[pantry\]\] \|/);
  assert.match(index, /\| \[\[glance-at-pantry\]\] \| 用户在菜谱页中途看一眼食材库，再回到菜谱页 \| \[\[cookbook\]\]、\[\[pantry\]\] \|/);
  assert.doesNotMatch(index, /pantry--empty/);

  // figures: by the state id in the name, else the first page the delta touches; sources and matrix stay out
  const flows = (page) => join(root, P(`pages/${page}/assets/flows`));
  assert.deepEqual(readdirSync(flows('cookbook')).sort(), ['flow-1-cookbook--share-sheet.png', 'flow-3-misc.png']);
  assert.deepEqual(readdirSync(flows('pantry')), ['flow-2-pantry--overview.png']);
  assert.equal(readFileSync(join(flows('pantry'), 'flow-2-pantry--overview.png')).toString(), 'PNG-flow-2');
  assert.deepEqual(result.summary.figures.map((f) => [basename(f.from), f.page]), [
    ['flow-1-cookbook--share-sheet.png', 'cookbook'],
    ['flow-2-pantry--overview.png', 'pantry'],
    ['flow-3-misc.png', 'cookbook'],
  ]);
  assert.match(result.summary.figures[2].reason, /第一个页面/);

  // the spec: links follow the figures, fenced code and everything else stay
  const spec = read(root, SPEC);
  assert.match(spec, /!\[分享\]\(\.\.\/\.\.\/design\/prod\/pages\/cookbook\/assets\/flows\/flow-1-cookbook--share-sheet\.png\)/);
  assert.match(spec, /!\[食材库\]\(\.\.\/\.\.\/design\/prod\/pages\/pantry\/assets\/flows\/flow-2-pantry--overview\.png "食材库"\)/);
  assert.match(spec, /!\[其他\]\(<\.\.\/\.\.\/design\/prod\/pages\/cookbook\/assets\/flows\/flow-3-misc\.png>\)/);
  assert.match(spec, /```\n!\[示例，围栏里的不改\]\(\.\.\/\.\.\/design\/tmp\//);
  assert.equal(result.summary.specLinks.length, 3);

  // tmp/<spec-slug>/ is emptied
  assert.ok(!has(root, TMP));

  // and the archive is clean in full, usedBy included
  const after = check(root);
  assert.deepEqual(after.violations, []);
  assert.deepEqual(result.summary.added, ['ShareButton', 'cookbook--share-done', 'cookbook--share-sheet']);
  assert.deepEqual(result.summary.changed, ['cookbook--recipe-saved', 'cookbook--search-results', 'pantry--overview']);
  assert.deepEqual(result.summary.removed, ['pantry--empty']);
  assert.deepEqual(result.hints, []);
});

const basename = (p) => p.slice(p.lastIndexOf('/') + 1);

test('archive: other specs\' folders under tmp/ are left alone', () => {
  const files = requirement();
  files['docs/design/tmp/other-spec/canvas/a.html'] = '<html></html>';
  const { root, result } = archive(files);
  assert.equal(result.ok, true);
  assert.ok(has(root, 'docs/design/tmp/other-spec/canvas/a.html'));
});

test('archive: a removed component takes its whole folder, a removed page with the last of its states too', () => {
  const files = requirement();
  files[D('removed.md')] = '- [[pantry--empty]]\n- [[pantry--overview]]\n- [[pantry]]\n- [[glance-at-pantry]]\n';
  delete files[D('pages/pantry/pantry--overview.md')];
  files[P('pages/pantry/assets/shot.png')] = PNG('shot');
  // cookbook--list links to the removed overview: edit it in the delta
  files[D('pages/cookbook/cookbook--list.md')] = compliantFiles()[P('pages/cookbook/cookbook--list.md')].replace(/  - id: open-pantry[\s\S]*?action: click\n/, '');
  // NavBar is also used by the removed page — usedBy must shrink; the page's folder must vanish
  files[`${TMP}/canvas/assets/flows/flow-2-pantry--overview.png`] = null;
  files[SPEC] = files[SPEC].replace(/!\[食材库\].*\n/, '');
  const { root, result } = archive(files);
  assert.equal(result.ok, true, JSON.stringify(result.violations ?? result.errors));
  assert.ok(!has(root, P('pages/pantry')));
  assert.match(read(root, P('components/NavBar/NavBar.md')), /^usedBy: \["\[\[cookbook\]\]"\]$/m);
  assert.deepEqual(check(root).violations, []);
});

// ---------- nothing is written when it would not pass ----------

test('refused: a delta that fails validation leaves prod, the spec and tmp byte for byte as they were', () => {
  const files = requirement();
  files[D('pages/cookbook/cookbook--share-sheet.md')] = files[D('pages/cookbook/cookbook--share-sheet.md')].replace(
    'page: "[[cookbook]]"',
    'page: "[[cookbook]]"\nasync:\n  loading: "[[cookbook--share-sheet]]"',
  );
  const root = writeRepo(files);
  const before = snapshot(root);
  const result = archiveSpec(root, SPEC_SLUG);
  assert.equal(result.ok, false);
  assert.equal(result.stage, '校验');
  assert.ok(result.violations.some((v) => v.rule === 2 && /async\.failure/.test(v.field)));
  assert.deepEqual(snapshot(root), before);
});

test('refused: an archive already broken before the delta is not made worse — nothing written', () => {
  const files = requirement();
  delete files[P('components/NavBar/NavBar.md')];
  const root = writeRepo(files);
  const before = snapshot(root);
  assert.equal(archiveSpec(root, SPEC_SLUG).ok, false);
  assert.deepEqual(snapshot(root), before);
});

test('refused: a figure that would overwrite a different file of the same name is a conflict, nothing written', () => {
  const files = requirement();
  files[P('pages/cookbook/assets/flows/flow-3-misc.png')] = PNG('older');
  const root = writeRepo(files);
  const before = snapshot(root);
  const result = archiveSpec(root, SPEC_SLUG);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /flow-3-misc\.png 已经存在且内容不同/);
  assert.deepEqual(snapshot(root), before);
});

test('an identical figure already in prod is fine (a re-run after a half-done merge)', () => {
  const files = requirement();
  files[P('pages/cookbook/assets/flows/flow-3-misc.png')] = PNG('flow-3');
  assert.equal(archive(files).result.ok, true);
});

test('refused: a figure that names no state and a delta with no page or state to put it in', () => {
  const files = { ...compliantFiles(), [`${TMP}/canvas/assets/flows/lonely.png`]: PNG('x') };
  const root = writeRepo(files);
  const before = snapshot(root);
  const result = archiveSpec(root, SPEC_SLUG);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /lonely\.png 对应不上任何页面/);
  assert.deepEqual(snapshot(root), before);
});

// ---------- dry-run ----------

test('dry-run: validates and reports the same summary, writes nothing', () => {
  const files = requirement();
  const root = writeRepo(files);
  const before = snapshot(root);
  const result = archiveSpec(root, SPEC_SLUG, { dryRun: true });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.deepEqual(result.summary.removed, ['pantry--empty']);
  assert.equal(result.summary.figures.length, 3);
  assert.deepEqual(snapshot(root), before);
  // and it matches what a real run then does
  const real = archiveSpec(root, SPEC_SLUG);
  assert.deepEqual(real.summary, result.summary);
});

test('dry-run on a delta that does not pass still refuses', () => {
  const files = requirement();
  delete files[D('components/ShareButton/ShareButton.md')];
  const root = writeRepo(files);
  const before = snapshot(root);
  const result = archiveSpec(root, SPEC_SLUG, { dryRun: true });
  assert.equal(result.ok, false);
  assert.deepEqual(snapshot(root), before);
});

// ---------- LFS and .gitignore ----------

test('hints: no LFS rules and no .gitignore line — one hint each, and neither file is created or touched', () => {
  const files = requirement({ lfs: false, gitignore: false });
  const root = writeRepo(files);
  const result = archiveSpec(root, SPEC_SLUG);
  assert.equal(result.ok, true);
  assert.deepEqual(result.hints.map((h) => h.kind), ['lfs', 'gitignore']);
  assert.match(result.hints[0].message, /docs\/design\/prod\/\*\*\/assets\/\*\*\/\*\.png filter=lfs/);
  assert.match(result.hints[0].message, /\*\.gif/);
  assert.match(result.hints[0].message, /\*\.webm/);
  assert.match(result.hints[1].message, /docs\/design\/tmp\//);
  assert.ok(!has(root, '.gitattributes'));
  assert.ok(!has(root, '.gitignore'));
});

test('hints: existing files are left byte for byte; only the missing extensions are named', () => {
  const files = requirement({ gitignore: false });
  files['.gitattributes'] = '* text=auto\ndocs/design/prod/**/assets/**/*.png filter=lfs diff=lfs merge=lfs -text\n';
  files['.gitignore'] = 'node_modules/\n';
  const root = writeRepo(files);
  const result = archiveSpec(root, SPEC_SLUG);
  assert.deepEqual(result.hints.map((h) => h.kind), ['lfs', 'gitignore']);
  assert.doesNotMatch(result.hints[0].message, /\*\.png/);
  assert.match(result.hints[0].message, /gif.*webm|\*\.gif[\s\S]*\*\.webm/);
  assert.equal(read(root, '.gitattributes'), files['.gitattributes']);
  assert.equal(read(root, '.gitignore'), files['.gitignore']);
});

test('hints: a missing main viewport / theme / locale in prod/index.md is said once', () => {
  const files = requirement();
  files[P('index.md')] = '---\ntype: design-index\ntags: [design]\nsummary: 索引\n---\n\n# 设计档案\n';
  const { result } = archive(files);
  assert.deepEqual(result.hints.map((h) => h.kind), ['index']);
});

test('hints: a spec link into tmp/ that is not archived is named (it would dangle)', () => {
  const files = requirement();
  files[SPEC] += `\n[画布](../../design/tmp/${SPEC_SLUG}/canvas/${SPEC_SLUG}.html)\n`;
  const { result } = archive(files);
  assert.equal(result.ok, true);
  assert.deepEqual(result.hints.map((h) => h.kind), ['dangling']);
});

test('lfsCovers: patterns the way git reads them', () => {
  const p = (ext) => `docs/design/prod/pages/x/assets/a.${ext}`;
  assert.equal(lfsCovers(LFS, p('png')), true);
  assert.equal(lfsCovers(LFS, p('webm')), true);
  assert.equal(lfsCovers(LFS, p('jpg')), false);
  assert.equal(lfsCovers('*.png filter=lfs diff=lfs merge=lfs -text\n', p('png')), true);
  assert.equal(lfsCovers('docs/design/prod/** filter=lfs\n', p('gif')), true);
  assert.equal(lfsCovers('docs/design/prod/**/assets/*.png filter=lfs\n', p('png')), true);
  assert.equal(lfsCovers('docs/design/prod/**/assets/*.png filter=lfs\n', 'docs/design/prod/pages/x/assets/flows/a.png'), false);
  assert.equal(lfsCovers('docs/design/prod/**/assets/**/*.png filter=lfs\n', 'docs/design/prod/pages/x/assets/flows/a.png'), true);
  assert.equal(lfsCovers('docs/other/**/*.png filter=lfs\n', p('png')), false);
  assert.equal(lfsCovers('*.png filter=lfs\n*.png -filter\n', p('png')), false);
  assert.equal(lfsCovers('# *.png filter=lfs\n', p('png')), false);
  assert.equal(lfsCovers('', p('png')), false);
});

test('ignoresTmp: the forms of the same rule', () => {
  for (const yes of ['docs/design/tmp/', 'docs/design/tmp', '/docs/design/tmp/', 'docs/design/tmp/*', 'docs/design/tmp/**']) {
    assert.equal(ignoresTmp(`node_modules/\n${yes}\n`), true, yes);
  }
  for (const no of ['', 'tmp/', 'docs/design/', '# docs/design/tmp/', '!docs/design/tmp/']) assert.equal(ignoresTmp(no), false, no);
});

// ---------- usage ----------

test('nothing to archive: a spec without a tmp/ folder is a usage error, not a no-op', () => {
  const root = writeRepo(compliantFiles());
  assert.throws(() => archiveSpec(root, SPEC_SLUG), /没有 docs\/design\/tmp\/demo-spec\//);
  assert.throws(() => archiveSpec(root, '../etc'), /不合法/);
});

test('a requirement with no delta/ still moves its figures and empties tmp', () => {
  const files = compliantFiles();
  files[`${TMP}/canvas/a.html`] = '<html></html>';
  files[`${TMP}/canvas/assets/flows/flow-1-cookbook--list.png`] = PNG('f');
  files[SPEC] += `\n![流程](../../design/tmp/${SPEC_SLUG}/canvas/assets/flows/flow-1-cookbook--list.png)\n`;
  const { root, result } = archive(files);
  assert.equal(result.ok, true);
  assert.ok(has(root, P('pages/cookbook/assets/flows/flow-1-cookbook--list.png')));
  assert.ok(!has(root, TMP));
  assert.deepEqual(check(root).violations, []);
});

// ---------- command line ----------

test('cli: 0 and a readable summary on success; the archive is really written', () => {
  const root = writeRepo(requirement());
  const r = cli(root, SPEC_SLUG);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /已归档 demo-spec/);
  assert.match(r.stdout, /新增：ShareButton、cookbook--share-done、cookbook--share-sheet/);
  assert.match(r.stdout, /删除：pantry--empty/);
  assert.match(r.stdout, /flow-1-cookbook--share-sheet\.png → docs\/design\/prod\/pages\/cookbook\/assets\/flows\//);
  assert.ok(!has(root, TMP));
});

test('cli: --dry-run says so and writes nothing; --json is machine readable', () => {
  const root = writeRepo(requirement());
  const before = snapshot(root);
  const r = cli(root, SPEC_SLUG, '--dry-run');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /dry-run/);
  assert.deepEqual(snapshot(root), before);
  const j = JSON.parse(cli(root, SPEC_SLUG, '--dry-run', '--json').stdout);
  assert.equal(j.ok, true);
  assert.equal(j.dryRun, true);
  assert.deepEqual(j.summary.removed, ['pantry--empty']);
  assert.deepEqual(snapshot(root), before);
});

test('cli: 1 and the violations when validation fails, nothing written', () => {
  const files = requirement();
  delete files[D('components/ShareButton/ShareButton.md')];
  const root = writeRepo(files);
  const before = snapshot(root);
  const r = cli(root, SPEC_SLUG);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /拒绝归档（校验）：什么都没写/);
  assert.match(r.stdout, /违规 \[规则 3 引用\].*ShareButton/);
  assert.deepEqual(snapshot(root), before);
});

test('cli: usage errors exit 2', () => {
  assert.equal(spawnSync('node', [CLI], { encoding: 'utf8' }).status, 2);
  const root = writeRepo(compliantFiles());
  assert.equal(cli(root, SPEC_SLUG).status, 2);
  assert.equal(cli(root, SPEC_SLUG, '--nope').status, 2);
  assert.equal(cli(writeRepo({ 'README.md': 'x' }), SPEC_SLUG).status, 2);
});

// ---------- pieces ----------

test('setUsedBy: replaces every YAML shape the field can take, appends when missing, touches nothing else', () => {
  const doc = (usedBy) => `---\ntype: design-component\nsummary: x\n${usedBy}code: [a.tsx]\n---\n\n# body\nusedBy: stays\n`;
  const want = 'usedBy: ["[[a]]", "[[b]]"]\n';
  for (const old of [
    'usedBy: []\n',
    'usedBy: ["[[z]]"]\n',
    'usedBy:\n  - "[[z]]"\n  - "[[y]]"\n',
    'usedBy:\n- "[[z]]"\n',
    'usedBy: [\n  "[[z]]",\n  "[[y]]",\n]\n',
    'usedBy: ["[[z]]"] # stale\n',
  ]) {
    assert.equal(setUsedBy(doc(old), ['a', 'b']), doc(want), old);
  }
  assert.equal(setUsedBy(doc(''), ['a', 'b']), '---\ntype: design-component\nsummary: x\ncode: [a.tsx]\nusedBy: ["[[a]]", "[[b]]"]\n---\n\n# body\nusedBy: stays\n');
  assert.equal(setUsedBy(doc('usedBy: []\n'), []), doc('usedBy: []\n'));
  assert.equal(setUsedBy('no frontmatter\n', ['a']), 'no frontmatter\n');
  assert.equal(setUsedBy(doc('usedBy: []\n').replace(/\n/g, '\r\n'), ['a']), doc('usedBy: ["[[a]]"]\n').replace(/\n/g, '\r\n'));
});

test('rewriteLinks: relative, root-relative and absolute styles keep their style; anchors and titles survive; foreign links stay', () => {
  const moved = new Map([['docs/design/tmp/s/canvas/assets/flows/a.png', 'docs/design/prod/pages/p/assets/flows/a.png']]);
  const text = [
    '![a](../../design/tmp/s/canvas/assets/flows/a.png)',
    '![b](docs/design/tmp/s/canvas/assets/flows/a.png "t")',
    '![c](/docs/design/tmp/s/canvas/assets/flows/a.png#x)',
    '![d](https://example.com/docs/design/tmp/s/canvas/assets/flows/a.png)',
    '[e](../../design/tmp/s/canvas/assets/flows/other.png)',
  ].join('\n');
  const { text: out, changes } = rewriteLinks(text, 'docs/spec/s', moved);
  assert.equal(
    out,
    [
      '![a](../../design/prod/pages/p/assets/flows/a.png)',
      '![b](docs/design/prod/pages/p/assets/flows/a.png "t")',
      '![c](/docs/design/prod/pages/p/assets/flows/a.png#x)',
      '![d](https://example.com/docs/design/tmp/s/canvas/assets/flows/a.png)',
      '[e](../../design/tmp/s/canvas/assets/flows/other.png)',
    ].join('\n'),
  );
  assert.equal(changes.length, 3);
});

test('renderIndex: four tables, empty ones say 无; a missing index gets a minimal frontmatter; pipes in text are escaped', () => {
  const root = writeRepo(compliantFiles());
  const a = loadArchive(root);
  const text = renderIndex(a, read(root, P('index.md')));
  for (const h of ['## 页面', '## 组件', '## 动效', '## 用户路径']) assert.ok(text.includes(h), h);
  assert.match(text, /^---\ntype: design-index\n[\s\S]*?viewport: 1440x900[\s\S]*?\n---\n/);
  assert.ok(text.indexOf('[[NavBar]]') < text.indexOf('[[RecipeCard]]'), 'rows are sorted by id');
  const bare = renderIndex(a, null);
  assert.match(bare, /^---\ntype: design-index\ntags: \[design\]\nsummary: 设计档案索引\n---\n/);
  a.objects.get('RecipeCard').fm.summary = '卡片 | 带竖线\n两行';
  assert.match(renderIndex(a, null), /卡片 \\\| 带竖线 两行/);
  a.objects.clear();
  a.edges.length = 0;
  assert.match(renderIndex(a, null), /## 页面\n\n无\n/);
});
