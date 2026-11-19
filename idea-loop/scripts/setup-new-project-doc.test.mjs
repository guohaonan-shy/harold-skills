/**
 * Tripwire — setup builds a new project's files in the project directory of home (docs/spec/skills-read-home, ticket 08).
 *
 * - The preflight asks `project-map.mjs where` whether the project is connected and says what each outcome means;
 *   a 0.1.x project stops at 「迁移」 and nothing is written into the code repository.
 * - A new project's bootstrap files and docs/ are written into <项目目录> and committed to home with `commit`; the
 *   `## idea-loop` block of the code repository's AGENTS.md is no longer written, and its template is gone.
 * - ISSUE_TRACKER.md templates have no 「仓库」 section; 「分类 label」 holds the categories, and the script that reads
 *   them (`issues.mjs labels`) reads a file made from the template.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './issues.mjs';
import { NOT_CONNECTED, NOT_MOVED, IN_HOME } from './project-map.mjs';

const setupDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'engineering', 'setup');
const read = (...p) => readFileSync(join(setupDir, ...p), 'utf8');
const skill = read('SKILL.md');
const body = skill.split(/^---\s*$/m).slice(2).join('---');

function section(text, title) {
  const m = text.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'));
  return m ? m[1] : null;
}

test('the preflight asks `where` and says what each of its outcomes means', () => {
  const table = read('references', 'preflight-table.md');
  assert.match(table, /^\| 项目接上了吗 \| `dyna home where`/m);
  // the sentences are the ones `where` prints; a changed sentence must be changed here too
  for (const sentence of [NOT_MOVED, NOT_CONNECTED, IN_HOME]) {
    const lead = sentence.replace(/`[^`]*`/g, '').split('，')[0];
    assert.ok(table.includes(lead), `the table names the outcome 「${lead}」`);
  }
  assert.match(table, /要迁移/);
  assert.match(table, /全新项目/);
  assert.match(body, /references\/preflight-table\.md/);
  assert.match(section(body, '预检'), /项目接上了吗」看项目目录，不看代码仓库根/);
});

test('a 0.1.x project stops at 「迁移」: nothing is written, the where sentence and the found files go to the human', () => {
  const s = section(body, '迁移');
  assert.ok(s, 'SKILL.md has a 迁移 section');
  assert.match(s, /停下/);
  assert.match(s, /`where` 的那句话/);
  assert.match(s, /认出的文件清单/);
  assert.match(s, /不在代码仓库或项目目录里写任何文件/);
  assert.match(s, /不往下走/);
  // the entry sits before the home step and the write step
  assert.ok(body.indexOf('## 迁移') < body.indexOf('## home'));
  assert.ok(body.indexOf('## home') < body.indexOf('## 写'));
});

test('a new project gets its files and docs/ in the project directory, committed to home; the code repository gets nothing', () => {
  assert.match(body, /代码仓库里不留 idea-loop 的文件/);
  assert.match(body, /写进 home 里这个项目的\*\*项目目录\*\*/);
  const w = section(body, '写');
  assert.match(w, /引导文件（上表）按模板写进 `<项目目录>`/);
  assert.match(w, /`<docs>` 骨架：/);
  assert.match(w, /dyna home commit/);
  assert.match(w, /`dyna home where` 对这个项目成功/);
  assert.match(w, /代码仓库里没有新增的 idea-loop 文件/);
  // what goes into the code repository is only the local exclude of .tmp/
  assert.match(w, /\.tmp\/` 追加进代码仓库的 `\$\(git rev-parse --git-common-dir\)\/info\/exclude`/);
  assert.doesNotMatch(w, /仓库根目录|写进仓库/);
});

test('the `## idea-loop` block is not written any more and its template is gone', () => {
  assert.doesNotMatch(skill, /## idea-loop/);
  assert.ok(!existsSync(join(setupDir, 'references', 'agents-block.md')));
  assert.doesNotMatch(body, /agents-block/);
  assert.ok(!existsSync(join(setupDir, 'references', 'issue-types.md')), 'the category template moved into issue-tracker.md');
  assert.ok(!existsSync(join(setupDir, 'references', 'issue-category-format.md')));
});

test('the home step comes before the files are written, and its registration is committed with `commit`', () => {
  const home = read('references', 'home.md');
  const step2 = section(home, '2\\. 登记当前项目');
  assert.match(step2, /dyna home commit "chore: 登记 <名字>"/);
  assert.doesNotMatch(step2, /代码仓库的 `docs\/`/);
  assert.doesNotMatch(home, /人说提交才提交/);
});

test('the setup skill body stays under 5000 characters and every reference it links exists', () => {
  assert.ok([...body].length < 5000, `body is ${[...body].length} characters`);
  for (const [, link] of skill.matchAll(/\]\((references\/[^)#]+)\)/g)) assert.ok(existsSync(join(setupDir, link)), link);
});

test('neither tracker template has a 仓库 section; 分类 label holds the categories and the PR line', () => {
  for (const f of ['issue-tracker.md', 'issue-tracker-linear.md']) {
    const md = read('references', f);
    assert.doesNotMatch(md, /^## 仓库$/m, `${f} has no 仓库 section`);
    assert.match(md, /^## 分类 label$/m, `${f} has the 分类 label section`);
    assert.match(md, /^## PR$/m, `${f} says how a PR attaches`);
    assert.doesNotMatch(md, /AGENTS\.md/, `${f} no longer sends the categories to AGENTS.md`);
  }
  assert.match(read('references', 'issue-tracker.md'), /Refs <owner>\/<repo>#<号>/);
  assert.match(read('references', 'issue-tracker-linear.md'), /Linear: <号>/);
});

test('`issues.mjs labels` reads the categories of a file made from the GitHub template', () => {
  let n = 0;
  const names = ['engineering', 'spec', 'design'];
  // fill the placeholders the way a human's answers would: parents engineering (child spec) and design, keeping `docs`
  const filled = read('references', 'issue-tracker.md')
    .replace(/`<父类>`：<什么样的 issue 归它>/g, () => `\`${names[n++ === 0 ? 0 : 2]}\`：一类 issue`)
    .replace(/`<子类>`：<什么样的 issue 归它>/, '`spec`：写 spec 的 issue')
    .replace(/保留的 label：`<label>`、`<label>`/, '保留的 label：`docs`、`question`');
  assert.doesNotMatch(filled, /`<父类>`|`<子类>`|`<label>`|<什么样的 issue 归它>/);

  const root = realpathSync(mkdtempSync(join(tmpdir(), 'setup-new-')));
  const home = join(root, 'home');
  const projectDir = join(home, 'projects', 'example-app');
  const docs = join(projectDir, 'docs');
  mkdirSync(docs, { recursive: true });
  writeFileSync(join(home, 'AGENTS.md'), '# 设备\n\n## 项目\n\nexample-app（一个例子）: ~/code/example-app. Clone from https://github.com/acme/example-app if missing.\n');
  writeFileSync(join(projectDir, 'ISSUE_TRACKER.md'), filled);

  const calls = [];
  const gh = (given) => {
    const args = given.filter((a, k) => a !== '-R' && given[k - 1] !== '-R'); // the script names the project's repository with -R
    calls.push(args);
    if (args.includes('list') && args.includes('label')) return JSON.stringify([{ name: 'docs' }, { name: 'stale' }]);
    if (args.includes('api')) return '[]';
    return '';
  };
  const out = [];
  run(['labels', docs], { gh, git: () => '', log: (l) => out.push(l), env: { IDEA_LOOP_HOME: home, HOME: root } });
  const created = calls.filter((a) => a.includes('create')).map((a) => a[a.indexOf('create') + 1]);
  for (const l of ['type:engineering', 'type:engineering/spec', 'type:design']) assert.ok(created.includes(l), `${l} created: ${created}`);
  const text = out.join('\n');
  assert.match(text, /stale/, 'a label outside the categories and the keep-list is reported as surplus');
  assert.doesNotMatch(text, /\bdocs（/, 'a label in 保留的 label is kept');
});
