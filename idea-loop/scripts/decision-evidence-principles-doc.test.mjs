/**
 * Tripwire — `evidence` says what evidence is and the overall style, leaves the choice of figure to the model and
 * where it goes to the caller; `pr-review`'s review standards give the basis as principles, not per-case answers.
 *
 * Spec decision-evidence-principles (issue #245) first; spec edge-case-known-limit (issue #280, ticket 02) moved
 * the evidence sections and the two figure references (ui-flow.md, gif.md) out of the old decision skill into the
 * `evidence` skill (word for word, only the paths changed), moved the basis rules (now four kinds, with 「目标」)
 * and the scope-question recommendation into pr-review's review standards, and deleted the old skill. These
 * checks pin: evidence's three sections, 「一道题」 not restated there, evidence free of placement paths,
 * placement in to-spec and pr, the basis section of the review standards without per-case dispositions, the old
 * name gone, and every cited section existing.
 *
 * Spec evidence-forms (issue #438, ticket 02) then split the figure part by form: the evidence body no longer
 * repeats home's 「证据」 section or the 「结论在前」 line that clashed with home's 「沟通」, 「配什么图」 is a six-row
 * form table, screenshot / chart / video each have a how-to file, and the two callers stopped listing the forms.
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

const evidenceBody = bodyOf(read('skills', 'productivity', 'evidence', 'SKILL.md'));
const evidenceDir = join(pluginRoot, 'skills', 'productivity', 'evidence');
const standards = read('skills', 'engineering', 'pr-review', 'references', 'review-standards.md');
/** the basis section of the review standards: from 「依据：只认四种」 to the next `## ` */
const basisSection = standards.split('## 依据：只认四种')[1]?.split('\n## ')[0] ?? '';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'evals'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(md|mjs|json)$/.test(name) && !/\.test\.mjs$/.test(name)) out.push(p);
  }
  return out;
}

test('the evidence skill is three sections: what evidence is, the overall style, which figure; its description only routes', () => {
  assert.deepEqual(headings(evidenceBody), ['证据是什么', '整体风格', '配什么图：你来判断']);
  const raw = read('skills', 'productivity', 'evidence', 'SKILL.md');
  assert.match(raw, /^---\nname: evidence\n/);
  assert.doesNotMatch(raw, /disable-model-invocation/, 'evidence 要能被别的 skill 和 agent 调到');
  const description = raw.match(/^description: (.+)$/m)[1];
  for (const word of ['证据', '截图', '流程图', '图表', '动图']) assert.ok(description.includes(word), `description 缺触发词：${word}`);
});

test('the review standards give the basis as four kinds, with 「目标」, the scope-question recommendation, and no per-case dispositions', () => {
  assert.ok(basisSection, 'review-standards 缺「依据：只认四种」一节');
  for (const kind of ['规则原文', '人的决定', '现有做法', '目标']) assert.match(basisSection, new RegExp(`\\*\\*${kind}\\*\\*`), `依据缺：${kind}`);
  for (const phrase of ['达成', '达成一部分', '没达成', '--spec', '推翻', '范围题', '影响这份 spec 的实现']) assert.match(basisSection, new RegExp(phrase), `依据一节缺：${phrase}`);
  for (const re of [/\*\*修\*\*/, /\*\*开 issue\*\*/, /\*\*沿用\*\*/, /\*\*恢复\*\*/, /本次同步改/, /接受并补记/, /代价相称/, /改动最小/, /自己定的四条/]) {
    assert.doesNotMatch(basisSection, re, `依据一节里还有逐情形的答案：${re}`);
  }
});

test('the 「边缘情形 → 要你决定」 line is gone from pr-review and pr', () => {
  const places = [standards, read('skills', 'engineering', 'pr-review', 'SKILL.md'), read('skills', 'engineering', 'pr', 'references', 'review-report.md')];
  for (const text of places) {
    assert.doesNotMatch(text, /只在兜底路径或罕见异常里出现|含被降级的边缘情形|边缘情形不放这里/);
  }
});

test('「要人定的写成一道题」 is not restated in the evidence skill', () => {
  assert.doesNotMatch(evidenceBody, /一道题/);
  assert.doesNotMatch(evidenceBody, /评判标准/);
});

test('the evidence sections say what evidence is, the style, and the figure kinds; they decide no placement', () => {
  for (const phrase of ['最新基准再核一次', '同条件', '复现', '用能说清要点的最小一种视图', '叠上去的东西要说明']) {
    assert.match(evidenceBody, new RegExp(phrase), `evidence 缺：${phrase}`);
  }
  assert.match(evidenceBody, /放在哪[^\n]*由调用你的 skill 定/);
  const all = [evidenceBody, ...readdirSync(join(evidenceDir, 'references')).map((f) => readFileSync(join(evidenceDir, 'references', f), 'utf8'))].join('\n');
  for (const re of [/docs\/raw/, /docs\/design\/tmp/, /\.tmp\//, /idea-loop-evidence-pr-/, /选哪种形态/]) {
    assert.doesNotMatch(all, re, `证据一节或它的参考里还写着放哪 / 按情形选图：${re}`);
  }
  assert.deepEqual(readdirSync(join(evidenceDir, 'references')).sort(), ['chart.md', 'gif.md', 'screenshot.md', 'ui-flow.md', 'video.md']);
});

test('evidence 正文不重复 home「证据」一节，也没有跟 home「沟通」冲突的「结论在前」（#438 工单 02）', () => {
  assert.doesNotMatch(evidenceBody, /结论在前/);
  assert.doesNotMatch(evidenceBody, /带出处和/, '「带出处和数字」是 home「证据」一节的第一条');
  assert.doesNotMatch(evidenceBody, /图文结合/);
  assert.doesNotMatch(evidenceBody, /图放在它支撑的那句话旁边/, '这一条 home「证据」一节已有');
  assert.match(evidenceBody.split('\n## ')[0], /home 固定文案「证据」一节是总纲/, '正文开头缺「home 是总纲」那句');
});

test('「配什么图」是一张六行的形态表，每行指向的做法文件都存在（#438 工单 02）', () => {
  const section = evidenceBody.split('## 配什么图：你来判断')[1] ?? '';
  const rows = section.split('\n').filter((l) => l.startsWith('|')).slice(2); // 去掉表头和分隔行
  assert.equal(rows.length, 6, `形态表应有六行，实际 ${rows.length}`);
  assert.deepEqual(rows.map((r) => r.split('|')[2].trim()), ['截图标注', 'UI 流程图', '图表', '动图', '录屏', '表或一行例子']);
  const pointed = rows.flatMap((r) => [...r.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/(skills\/productivity\/evidence\/references\/[\w.-]+\.md)/g)].map((m) => m[1]));
  assert.deepEqual(pointed.map((p) => p.split('/').pop()), ['screenshot.md', 'ui-flow.md', 'chart.md', 'gif.md', 'video.md']);
  for (const p of pointed) assert.ok(existsSync(join(pluginRoot, p)), `做法文件不存在：${p}`);
  assert.doesNotMatch(section, /mermaid/i);
});

test('截图标注、图表、录屏三份做法各自写全该写的，图表没有 mermaid 退路（#438 工单 02）', () => {
  const ref = (f) => readFileSync(join(evidenceDir, 'references', f), 'utf8');
  const shot = ref('screenshot.md');
  for (const phrase of ['只截那个组件', '浮层', '2 倍像素密度', '主语言', '390', 'flow compose', '第一格没有箭头', 'circles', 'caption', '不手画', '浏览器', '无头']) {
    assert.match(shot, new RegExp(phrase), `screenshot.md 缺：${phrase}`);
  }
  const chart = ref('chart.md');
  for (const entry of ['sequence', 'state-machine', 'flowchart', 'tree', 'comparison', 'chart', 'architecture']) {
    assert.match(chart, new RegExp(`excalidrawer:${entry}`), `chart.md 缺入口：${entry}`);
  }
  assert.match(chart, /停下/);
  assert.match(chart, /装上/);
  assert.doesNotMatch(chart, /mermaid/i, 'chart.md 不写 mermaid 退路');
  const video = ref('video.md');
  for (const phrase of ['多步流程', '10MB', '只讲一个动效', 'recordVideo', 'simctl', 'ffmpeg', 'H\\.264', 'faststart', '分段', '开头', '加速', '不带声音', '日志或接口响应', '<video', 'controls', '发文件给人']) {
    assert.match(video, new RegExp(phrase), `video.md 缺：${phrase}`);
  }
  assert.match(ref('gif.md'), /video\.md/, '动图做法缺「装不下改用录屏」那句');
});

test('the old decision skill is gone: no directory, no mention anywhere in the plugin (evals aside)', () => {
  assert.equal(existsSync(join(pluginRoot, 'skills', 'productivity', ['decision', 'rules'].join('-'))), false);
  const old = new RegExp(['decision', 'rules'].join('[-_]'));
  const hits = walk(pluginRoot).filter((f) => old.test(readFileSync(f, 'utf8'))).map((f) => relative(pluginRoot, f));
  assert.deepEqual(hits, [], `还提着旧名：${hits.join(', ')}`);
});

test('placement moved to the callers: to-spec figures.md and pr delivery-evidence.md', () => {
  const figures = read('skills', 'engineering', 'to-spec', 'references', 'figures.md');
  for (const phrase of ['problem-', 'tree-user-stories-', 'sequence-', '只留 PNG', '待补图']) assert.match(figures, new RegExp(phrase));
  assert.match(read('skills', 'engineering', 'to-spec', 'SKILL.md'), /references\/figures\.md/);
  const delivery = read('skills', 'engineering', 'pr', 'references', 'delivery-evidence.md');
  for (const phrase of ['idea-loop-evidence-pr-', 'dyna pr evidence publish', 'cleanup', '看什么', '做素材本身就是一道验证']) assert.match(delivery, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(read('skills', 'engineering', 'pr', 'SKILL.md'), /references\/delivery-evidence\.md/);
});

test('to-spec 的 figures.md 和 pr 的 delivery-evidence.md 不再括号列形态，只指「配什么图」；交付证据补了录屏的分段和 <video>（#438 工单 02）', () => {
  const figures = read('skills', 'engineering', 'to-spec', 'references', 'figures.md');
  const delivery = read('skills', 'engineering', 'pr', 'references', 'delivery-evidence.md');
  for (const text of [figures, delivery]) {
    assert.match(text, /照 `idea-loop:evidence` 的「配什么图」/);
    assert.doesNotMatch(text, /图怎么做（/, '形态又被括号列出来了');
    assert.doesNotMatch(text, /UI 标注、UI flow/);
  }
  assert.match(delivery, /录屏[^。]*分段/);
  assert.match(delivery, /<video src="<地址>" controls><\/video>/);
});

test('every cited section of the evidence skill exists, and nothing points at the removed references', () => {
  const sections = {
    evidence: headings(evidenceBody),
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

test('issue-session 的「边界」把讨论中冒出的范围题指向 pr-review review 标准的范围题推荐法（#280 工单 02 的人的决定 D3）', () => {
  const boundary = bodyOf(read('skills', 'engineering', 'issue-session', 'SKILL.md')).split('## 边界')[1] ?? '';
  assert.match(boundary, /范围题（并进当前 PR 还是另开）/, '边界一节没提范围题');
  assert.match(boundary, /`idea-loop:pr-review` 的 review 标准/, '范围题没指向 pr-review 的 review 标准');
  assert.doesNotMatch(boundary, /影响这份 spec 的实现/, '范围题推荐法不在这里转述，只指过去');
  assert.match(standards, /\*\*范围题\*\*（冒出的改动并进当前 PR，还是另开）/, 'review 标准里的范围题推荐法没了');
});

const STANDARDS_PATH = '${CLAUDE_PLUGIN_ROOT}/skills/engineering/pr-review/references/review-standards.md';

test('issue 会话「边界」和 PR 汇报写法读 review 标准时写从插件根目录起的完整位置，照字面找得到（#280 工单 02，review 第 1 轮 C2）', () => {
  const boundary = bodyOf(read('skills', 'engineering', 'issue-session', 'SKILL.md')).split('## 边界')[1] ?? '';
  assert.ok(boundary.includes(STANDARDS_PATH), 'issue-session 的「边界」没写 review 标准的完整位置');
  const report = read('skills', 'engineering', 'pr', 'references', 'review-report.md');
  assert.ok(report.includes(STANDARDS_PATH), 'pr 的汇报写法没写 review 标准的完整位置');
  assert.ok(existsSync(join(pluginRoot, STANDARDS_PATH.replace('${CLAUDE_PLUGIN_ROOT}/', ''))), '写的位置不存在');
});

test('spec drafting decides what becomes a 待定 by the user rule 「思考与决策」「停下问我」, not by 「依据冲突或没有」 (#280 ticket 02, review round 1)', () => {
  const toSpec = bodyOf(read('skills', 'engineering', 'to-spec', 'SKILL.md'));
  const decisions = toSpec.split('## 实现决策')[1]?.split('\n## ')[0] ?? '';
  assert.match(decisions, /「思考与决策」/);
  assert.match(decisions, /「只由我做」/);
  assert.match(decisions, /「停下问我」/);
  assert.doesNotMatch(decisions, /依据冲突或没有/);
  const draft = read('skills', 'engineering', 'issue-session', 'references', 'draft-spec.md');
  const item = draft.split('\n').find((l) => /^6\. /.test(l)) ?? '';
  assert.match(item, /「只由我做」/);
  assert.match(item, /「停下问我」/);
  assert.doesNotMatch(item, /冲突或没有/);
});

test('implement 分拣表里标「spec 缺口」的 found，判要不要交给人时「只由我做」和「停下问我」都算（#280 工单 03，review 第 2 轮 S1 同类）', () => {
  const row = read('skills', 'engineering', 'implement', 'SKILL.md').split('\n').find((l) => l.startsWith('| 标「spec 缺口」的 `found`')) ?? '';
  assert.ok(row, '分拣表里没有标「spec 缺口」的 found 那一行');
  assert.match(row, /「只由我做」/);
  assert.match(row, /「停下问我」/);
});

test('to-ticket 切的过程中冒出的事，判要不要交给人时「只由我做」和「停下问我」都算（#280 工单 02，review 第 3 轮 S1 同类）', () => {
  const body = bodyOf(read('skills', 'engineering', 'to-ticket', 'SKILL.md'));
  const stop = body.split('## 切法直接落盘，不停下')[1]?.split('\n## ')[0] ?? '';
  assert.ok(stop, '没找到「切法直接落盘，不停下」一节');
  assert.match(stop, /「思考与决策」/);
  assert.match(stop, /「只由我做」/);
  assert.match(stop, /「停下问我」/);
  assert.doesNotMatch(stop, /「停下问我」之外的自己定/);
});
