/**
 * Guard for the reporting rules (报数口径) wiring.
 *
 * `references/reporting-rules.md` is the single place that says how a number is reported: the
 * threshold against the live baseline, pass¹ / pass³, platform errors rerun before counting, and
 * intervals. eval-run, eval-baseline and eval-setup must point at it at the step where they use it,
 * and must not restate its rules, because a second copy drifts. This test checks both halves on the
 * text of the files, so a skill edit that drops the pointer or pastes a rule back in turns it red.
 *
 * The skill texts are the thing under test; there is no code behind them. It was written before the
 * skill edits and failed on the unedited skills (no reference, no pointer, no rerun step), which is
 * the evidence that it can tell the wrong wording from the right one.
 *
 * 跑：`node --test ai-eval/scripts/reporting-rules.test.mjs`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = 'reporting-rules.md';
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const skill = (name) => read(`skills/${name}/SKILL.md`);

/** Body of the section whose heading line matches `heading`, up to the next heading of the same or higher level. */
function section(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^#{1,6} /.test(l) && heading.test(l));
  assert.notEqual(start, -1, `no section matching ${heading}`);
  const level = lines[start].match(/^#+/)[0].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => {
    const m = l.match(/^(#+) /);
    return m && m[1].length <= level;
  });
  return rest.slice(0, end === -1 ? undefined : end).join('\n');
}

// One sentence per rule that only the reference may carry.
const RULE_SENTENCES = {
  threshold: '门槛写成「候选不比基线差」',
  pass1: 'pass¹ 是单次运行的通过率，等于过了的次数除以总次数。',
  pass1Unjudged: '回放里判不出来的那几次不进 pass¹ 的分母。',
  pass3: 'pass³ 是同一个 case 跑三次全过的 case 占的比例。',
  platformError: '最多重跑 3 轮',
  interval: '重抽 2,000 次',
};

test('the reference exists and carries each rule once, with both definitions verbatim', () => {
  assert.ok(existsSync(join(root, 'references', REF)), `references/${REF} is missing`);
  const ref = read(`references/${REF}`);
  for (const [rule, sentence] of Object.entries(RULE_SENTENCES)) {
    assert.equal(ref.split(sentence).length - 1, 1, `${rule}: "${sentence}" should appear exactly once in the reference`);
  }
  assert.match(ref, /只跑 1 次的不报 pass³/);
  assert.match(ref, /只管模型的失败/);
});

test('no skill restates a rule the reference owns', () => {
  for (const name of ['eval-run', 'eval-baseline', 'eval-setup', 'eval-judge', 'eval-samples', 'eval-metrics-review', 'eval-replay']) {
    const text = skill(name);
    for (const [rule, sentence] of Object.entries(RULE_SENTENCES)) {
      assert.ok(!text.includes(sentence), `${name} restates the ${rule} rule; point at ${REF} instead`);
    }
  }
});

test('eval-run reruns platform errors to zero before each comparison, pointing at the reference', () => {
  const text = skill('eval-run');
  for (const heading of [/### 7\. 第一段/, /### 8\. 第二段/]) {
    const body = section(text, heading);
    assert.match(body, /平台报错/, `${heading} has no platform-error rerun`);
    assert.ok(body.includes(REF), `${heading} does not point at ${REF}`);
    assert.ok(body.indexOf('平台报错') < body.indexOf('compare --stage'), `${heading}: the rerun must come before compare`);
  }
});

test('eval-run report step writes pass¹ / pass³ with definitions, or says the report did not give them', () => {
  const body = section(skill('eval-run'), /### 9\. 写报告的分析/);
  assert.match(body, /pass¹/);
  assert.match(body, /pass³/);
  assert.ok(body.includes(REF), 'report step does not point at the reference for the definitions');
  assert.match(body, /报告没给/);
  assert.match(body, /待确认/);
});

test('eval-run sends a one-step-of-a-conversation change to eval-replay', () => {
  const body = section(skill('eval-run'), /### 2\. 评估样本与指标/);
  assert.match(body, /ai-eval:eval-replay/);
});

test('eval-replay points at the reference where it reports numbers, and leaves the interval to the script', () => {
  const text = skill('eval-replay');
  assert.ok(text.includes(REF), 'eval-replay does not point at the reference');
  assert.match(text, /replay-stats\.mjs/);
});

test('the reference puts the unjudged-runs sentence right after the pass¹ definition, and eval-replay asks for it and for the count without restating it', () => {
  const ref = read(`references/${REF}`);
  const def = RULE_SENTENCES.pass1;
  const gap = ref.slice(ref.indexOf(def) + def.length, ref.indexOf(RULE_SENTENCES.pass1Unjudged));
  assert.ok(ref.indexOf(RULE_SENTENCES.pass1Unjudged) > ref.indexOf(def), 'the unjudged sentence must follow the pass¹ definition');
  assert.ok(!gap.includes('pass³ 是'), 'the unjudged sentence must come before the pass³ definition');
  const body = section(skill('eval-replay'), /### 5\. 算数，写结论/);
  assert.match(body, /判不出来/, 'the report step does not mention the unjudged runs');
  assert.match(body, /rows/, 'the report step does not say where the unjudged count comes from');
});

test('eval-baseline reruns platform errors to zero before it compares', () => {
  const body = section(skill('eval-baseline'), /### 3\. 重跑/);
  assert.match(body, /平台报错/);
  assert.ok(body.includes(REF), 'rerun step does not point at the reference');
});

test('eval-setup template asks for the platform-error rerun command in both sections, and can name it when missing', () => {
  const text = skill('eval-setup');
  for (const heading of [/### 跑基线/, /### 两段式实验/]) {
    assert.match(section(text, heading), /平台报错怎么重跑/, `${heading} lacks the rerun item`);
  }
  assert.match(section(text, /### 准出标准/), /只管模型的失败/);
  assert.match(section(text, /### 1\. 判新建还是更新/), /平台报错怎么重跑/, 'the update step should name the missing items');
});
