/**
 * Tripwire — spec refine-judge-advisor, ticket 06: a refine round ends at a report the human answers by
 * number, not at a score; the human's signature freezes.
 *
 * The behaviour is skill and agent text, so this reads the text. It catches the old machinery coming back
 * (the 9-point pass, the bottleneck, the stop table, the 「人保留」 pins, the conflict table, the
 * subtraction round, the AI-tells round) and the new pieces going missing (the six steps, the ledger, the
 * undeclared-change check, the direction-opinion recommendation, the designer's change set / stuck /
 * self-check, the judge as advisor in design-change-sync). It cannot see whether an executor follows them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const refineDir = join(pluginRoot, 'skills', 'design', 'uiux-refine');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const bodyOf = (text) => text.split(/^---$/m).slice(2).join('---');

const skill = read('skills', 'design', 'uiux-refine', 'SKILL.md');
const body = bodyOf(skill);
const designer = read('agents', 'designer.md');
const sync = read('skills', 'design', 'design-change-sync', 'SKILL.md');

function markdownUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? markdownUnder(p) : name.endsWith('.md') ? [p] : [];
  });
}

test('the skill body stays under 5000 characters', () => {
  assert.ok([...body].length < 5000, `body is ${[...body].length} characters`);
});

test('the round is the six steps, ending at a report the human answers by number', () => {
  const steps = [...body.matchAll(/^(\d)\. \*\*([^*]+)\*\*/gm)].map((m) => m[2]);
  for (const name of ['人回决策', '交给 designer', '请评委', '比对两版', '配参考', '拼报告、发出去']) {
    assert.ok(steps.includes(name), `no step 「${name}」`);
  }
  assert.match(body, /每一条都要人回应过才往下/);
  assert.match(body, /人没提到的你接着问，不替人照推荐或设计意图定/);
  assert.doesNotMatch(body, /算收下/);
  assert.match(body, /跟旧决策矛盾的，先摆给人/);
  assert.match(body, /人确认后，你把决策写进 ledger/);
});

test('the signature freezes, and the unresolved direction opinions are listed before it', () => {
  assert.match(body, /没有「通过」「瓶颈」/);
  assert.match(body, /人仍签才冻结/);
  assert.match(body, /评委判过 `direction`、ledger 里没有对应决策/);
});

test('no 9-point pass, bottleneck, stop table, pins, conflict table, subtraction round or AI-tells round in the refine skill', () => {
  for (const file of markdownUnder(refineDir).filter((f) => !f.includes('/references/design/'))) {
    const text = readFileSync(file, 'utf8').replace(/没有「通过」「瓶颈」/g, '');
    const where = relative(pluginRoot, file);
    assert.doesNotMatch(text, /9 分|瓶颈|停止判定/, `${where}: the score decides a stop`);
    // the migration note in the ledger reference is the one place that still names the old pins
    if (!where.endsWith('ledger-and-report.md')) assert.doesNotMatch(text, /人保留/, `${where}: the pin mechanism is back`);
    assert.doesNotMatch(text, /碰到人选定项|冲突项/, `${where}: the conflict table is back`);
    assert.doesNotMatch(text, /\*\*减法\*\*|任务「清 AI tells」/, `${where}: the subtraction or AI-tells round is back`);
  }
});

test('the pins reference is gone and nothing in the plugin points at it', () => {
  assert.ok(!existsSync(join(refineDir, 'references', 'pinned-findings.md')));
  const hits = [];
  for (const top of ['skills', 'agents']) {
    for (const f of markdownUnder(join(pluginRoot, top))) {
      const text = readFileSync(f, 'utf8');
      const migrationNote = f.endsWith('uiux-refine/references/ledger-and-report.md');
      if (/pinned-findings/.test(text) || (!migrationNote && /人保留/.test(text))) hits.push(relative(pluginRoot, f));
    }
  }
  assert.deepEqual(hits, []);
});

test('the reference writes down the ledger format, how the report goes out, how the human answers, and the move of old pins', () => {
  const ref = read('skills', 'design', 'uiux-refine', 'references', 'ledger-and-report.md');
  assert.match(ref, /## ledger/);
  assert.match(ref, /讨论后坚持/);
  assert.match(ref, /<轮次>\.<序号>/);
  assert.match(ref, /## 报告怎么发/);
  assert.match(ref, /发布审阅页/);
  assert.match(ref, /## 人怎么回/);
  assert.match(ref, /每一条都要人回应过，才把这一轮的决策交给 designer/);
  assert.match(ref, /人没提到的编号，你接着问，不替人照推荐或设计意图定/);
  assert.doesNotMatch(ref, /没提到的编号算收下/);
  assert.match(ref, /第 0 轮/);
  assert.match(ref, /design-review-report\.mjs/);
});

test('what goes in the chat when the report goes out: link, score, the items to watch (with a reason), a "how to reply" line; the rest stays on the page', () => {
  const step6 = body.slice(body.indexOf('6. **拼报告、发出去**'), body.indexOf('designer 和评委的上下文里不放参考图'));
  const ref = read('skills', 'design', 'uiux-refine', 'references', 'ledger-and-report.md');
  const section = ref.slice(ref.indexOf('## 报告怎么发'), ref.indexOf('## 迁移'));
  for (const [where, text] of [['skill step 6', step6], ['reference 「报告怎么发」', section]]) {
    assert.doesNotMatch(text, /只放/, `${where} still says the chat holds only the three things`);
    assert.match(text, /推荐理由/, `${where} does not allow a reason with each item`);
    assert.match(text, /怎么回/, `${where} does not allow the closing 「怎么回」 line`);
    assert.match(text, /其余留在(报告)?页/, `${where} does not keep the rest on the page`);
  }
});

test('a direction opinion about a block the human already disliked is reported as "reopen in imagine" (#230)', () => {
  const section = body.slice(body.indexOf('## 方向性意见与人的不满'), body.indexOf('## 人说的其它话'));
  assert.match(section, /不满意（会话记录或 ledger 里有人的原话）/);
  assert.match(section, /推荐「回 imagine 重开这一块」，不再推荐保留/);
  assert.match(section, /附上这条意见的原文/);
});

test('the designer: change set tied to decision numbers, "stuck", and the self-check; no subtraction or AI-tells task', () => {
  assert.match(designer, /改动集逐条对上决策编号/);
  assert.match(designer, /交「卡住」/);
  assert.match(designer, /不自行取舍/);
  assert.match(designer, /## 交付前自检/);
  assert.match(designer, /哪里可以没有/);
  assert.match(designer, /AI tells/);
  assert.match(designer, /只照决策和 ledger 做/);
  assert.doesNotMatch(designer, /\*\*清 AI tells\*\*|\*\*减法\*\*/);
  assert.doesNotMatch(designer.split('---')[1], /清 AI tells|减法/, 'the task list in the first paragraph still names them');
  assert.doesNotMatch(designer, /不看图/);
});

test('self-check changes stay out of the change set: the designer writes them in a self-check note, the session saves it and hands it to the report script (review round 1, S3)', () => {
  assert.match(designer, /自检改的地方不进改动集/);
  assert.match(designer, /自检说明：/);
  assert.match(designer, /为什么改/);
  assert.doesNotMatch(designer, /单列一条写明「自检」|挂在最接近的决策编号下/);
  assert.match(body, /自检说明/);
  assert.match(body, /round-<N>\/self-check\.json/);
  const ref = read('skills', 'design', 'uiux-refine', 'references', 'ledger-and-report.md');
  assert.match(ref, /`self-check\.json`/);
  assert.match(ref, /--self-check <self-check\.json>/);
  assert.match(ref, /没有自检改动就传 `\[\]`/);
});

test('design-change-sync: the judge gives opinions, the human decides; no stop table', () => {
  assert.match(sync, /评委给意见，人定/);
  assert.doesNotMatch(sync, /停止判定|瓶颈|`通过`/);
  assert.match(sync, /--context/);
});
