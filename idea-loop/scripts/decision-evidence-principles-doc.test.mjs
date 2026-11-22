/**
 * Tripwire — decision-rules gives principles, not per-case answers; its last three sections say what evidence is
 * and the overall style, leave the choice of figure to the model and where it goes to the caller.
 * Since spec skill-rewrite (ticket 02) the old `evidence` skill is merged into decision-rules: its three sections
 * follow the six about who decides, and its two references (ui-flow.md, gif.md) sit under decision-rules/references.
 *
 * Spec decision-evidence-principles (issue #245). Before: decision-rules' 「自己定的四条」 listed per-case
 * dispositions (修 / 本次同步改 / 沿用 / 接受并补记 / 恢复 / 开 issue) plus 「代价相称」 and 「改动最小」;
 * evidence carried a 「一道题」 rule, a table of which figure goes where, and two references
 * (spec-figures.md, delivery.md) mixing how a figure is made with where each caller files it. These checks
 * pin: decision-rules' six sections and no per-case dispositions, 「一道题」 only in decision-rules, evidence
 * free of placement paths, placement in to-spec and pr, and every cited section of either skill existing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const bodyOf = (raw) => raw.replace(/^---\n[\s\S]*?\n---\n/, '');
const headings = (body) => [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());

const decisionBody = bodyOf(read('skills', 'productivity', 'decision-rules', 'SKILL.md'));
const ruleDir = join(pluginRoot, 'skills', 'productivity', 'decision-rules');
/** the three evidence sections of decision-rules: from 「证据是什么」 to the end */
const evidenceBody = decisionBody.slice(decisionBody.indexOf('## 证据是什么'));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'evals'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(md|mjs|json)$/.test(name) && !/\.test\.mjs$/.test(name)) out.push(p);
  }
  return out;
}

test('decision-rules is the core, three kinds of basis, follow when clear, stop on conflict, guardrails, one question, then the evidence sections', () => {
  assert.deepEqual(headings(decisionBody), [
    '核心',
    '依据只认三种',
    '依据明确、没冲突：照标准做',
    '依据冲突或没有：停下问人',
    '护栏',
    '要人定的写成一道题',
    '证据是什么',
    '整体风格',
    '配什么图：你来判断',
  ]);
  assert.match(decisionBody, /按 spec 的方案解决 spec 提出的问题/);
  assert.match(decisionBody, /已按规则处理/);
  assert.match(decisionBody, /推翻/);
  const guard = decisionBody.split('## 护栏')[1].split('\n## ')[0];
  for (const item of ['术语', '动生产数据', '真实支付', '对外发布', '合并改了代码的 PR']) assert.match(guard, new RegExp(item), `护栏缺：${item}`);
});

test('decision-rules gives no per-case dispositions', () => {
  for (const re of [/\*\*修\*\*/, /\*\*开 issue\*\*/, /\*\*沿用\*\*/, /\*\*恢复\*\*/, /本次同步改/, /接受并补记/, /代价相称/, /改动最小/, /自己定的四条/]) {
    assert.doesNotMatch(decisionBody, re, `decision-rules 里还有逐情形的答案：${re}`);
  }
});

test('「要人定的写成一道题」 is its own section, and the evidence sections after it do not restate it', () => {
  const q = decisionBody.split('## 要人定的写成一道题')[1].split('\n## ')[0];
  for (const phrase of ['真实例子', '推荐', '评判标准']) assert.match(q, new RegExp(phrase));
  assert.doesNotMatch(evidenceBody, /一道题/);
  assert.doesNotMatch(evidenceBody, /评判标准/);
});

test('the evidence sections say what evidence is, the style, and the figure kinds; they decide no placement', () => {
  for (const phrase of ['出处', '同条件', '复现', '结论在前', '图文结合', '旁边', 'flow compose', 'excalidrawer', 'mermaid', '动图']) {
    assert.match(evidenceBody, new RegExp(phrase), `evidence 缺：${phrase}`);
  }
  assert.match(evidenceBody, /放在哪[^\n]*由调用你的 skill 定/);
  const all = [evidenceBody, ...readdirSync(join(ruleDir, 'references')).map((f) => readFileSync(join(ruleDir, 'references', f), 'utf8'))].join('\n');
  for (const re of [/docs\/raw/, /docs\/design\/tmp/, /\.tmp\//, /idea-loop-evidence-pr-/, /选哪种形态/]) {
    assert.doesNotMatch(all, re, `证据一节或它的参考里还写着放哪 / 按情形选图：${re}`);
  }
  assert.deepEqual(readdirSync(join(ruleDir, 'references')).sort(), ['gif.md', 'ui-flow.md']);
  // the figure references are reached by the full path under the plugin root (the injected body has no base directory)
  for (const f of ['ui-flow.md', 'gif.md']) assert.ok(decisionBody.includes(`\${CLAUDE_PLUGIN_ROOT}/skills/productivity/decision-rules/references/${f}`), `${f} 没用插件根下的完整路径`);
});

test('the old evidence skill is gone, and nothing in the plugin calls it', () => {
  assert.equal(existsSync(join(pluginRoot, 'skills', 'productivity', 'evidence')), false);
  const hits = walk(pluginRoot).filter((f) => /idea-loop:evidence|skills\/productivity\/evidence/.test(readFileSync(f, 'utf8'))).map((f) => relative(pluginRoot, f));
  assert.deepEqual(hits, [], `还指着 evidence：${hits.join(', ')}`);
});

test('placement moved to the callers: to-spec figures.md and pr delivery-evidence.md', () => {
  const figures = read('skills', 'engineering', 'to-spec', 'references', 'figures.md');
  for (const phrase of ['problem-', 'tree-user-stories-', 'sequence-', '只留 PNG', '待补图']) assert.match(figures, new RegExp(phrase));
  assert.match(read('skills', 'engineering', 'to-spec', 'SKILL.md'), /references\/figures\.md/);
  const delivery = read('skills', 'engineering', 'pr', 'references', 'delivery-evidence.md');
  for (const phrase of ['idea-loop-evidence-pr-', 'dyna pr evidence publish', 'cleanup', '看什么', '做素材本身就是一道验证']) assert.match(delivery, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(read('skills', 'engineering', 'pr', 'SKILL.md'), /references\/delivery-evidence\.md/);
});

test('every cited section of decision-rules exists, and nothing points at the removed references', () => {
  const sections = {
    'decision-rules': headings(decisionBody),
  };
  const problems = [];
  for (const file of walk(pluginRoot)) {
    const text = readFileSync(file, 'utf8');
    const where = relative(pluginRoot, file);
    if (/spec-figures\.md|evidence\/references\/delivery\.md|references\/delivery\.md/.test(text)) problems.push(`${where}：指着已删的参考`);
    for (const [skill, names] of Object.entries(sections)) {
      // `idea-loop:<skill>` 的「<节>」 / `<skill>`「<节>」 / `idea-loop:<skill>`，看它的「<节>」
      const re = new RegExp(`\`(?:idea-loop:)?${skill}\`(?: 的|，看它的|，照它的)?「([^」]+)」`, 'g');
      for (const m of text.matchAll(re)) {
        const cited = m[1];
        if (!names.some((n) => n === cited || n.startsWith(cited))) problems.push(`${where}：${skill} 没有「${cited}」这一节`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
