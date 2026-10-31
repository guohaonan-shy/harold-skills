/**
 * Replay decisions, as pure functions. The runner (retro-replay.mjs) starts the `claude -p` sessions;
 * everything it has to decide from what those sessions produced is here, so it can be tested without them.
 */

const ANSWERS = { 是: 'yes', yes: 'yes', y: 'yes', 否: 'no', no: 'no', n: 'no' };
const normalizeAnswer = (a) => ANSWERS[String(a ?? '').trim().toLowerCase()];

/**
 * Pre-change answer "no" (the problem shows) and post-change answer "yes" (it is gone) is the only pass.
 * A pre-change "yes" means the case never showed the problem, so it proves nothing: that is checked first.
 */
export function decideOutcome({ before, after }) {
  const b = normalizeAnswer(before);
  const a = normalizeAnswer(after);
  if (!b || !a) return { outcome: 'inconclusive', reason: '判定会话没有对两份产物都给出「是」或「否」' };
  if (b === 'yes') return { outcome: 'case-missed', reason: '用例没抓住问题：改前的插件跑出来就已经答「是」，先修用例' };
  if (a === 'no') return { outcome: 'fail', reason: '不过：改后的插件跑出来仍然答「否」，规则改动没有让问题消失' };
  return { outcome: 'pass', reason: '过：改前答「否」（问题复现），改后答「是」' };
}

/**
 * The judging session answers with one JSON object keyed by the two anonymous products:
 * {"A": {"answer": "是|否", "cite": "出处"}, "B": {...}}. Takes the last such object in the text.
 */
export function parseVerdict(text) {
  const s = String(text ?? '');
  const candidates = [];
  for (let i = s.indexOf('{'); i >= 0; i = s.indexOf('{', i + 1)) {
    for (let j = s.lastIndexOf('}'); j > i; j = s.lastIndexOf('}', j - 1)) {
      try {
        candidates.push(JSON.parse(s.slice(i, j + 1)));
        break;
      } catch {
        /* try a shorter slice */
      }
    }
  }
  for (const obj of candidates.reverse()) {
    const out = {};
    for (const k of ['A', 'B']) {
      const answer = normalizeAnswer(obj?.[k]?.answer);
      if (!answer) break;
      out[k] = { answer, cite: String(obj[k].cite ?? '') };
    }
    if (out.A && out.B) return out;
  }
  return null;
}

/** The case as it should be written back after a "small" run started an agent or opened a browser. */
export function relabelLarge(c, escalation) {
  const what = escalation.kind === 'agent' ? '起了 agent' : '开了浏览器';
  const { name, ...rest } = c;
  return {
    ...rest,
    size: 'large',
    size_basis: `跑的时候从事件流里看到${what}（工具 ${escalation.tool}），按「碰到任何一样是大」改标成大；原依据：${c.size_basis}`,
  };
}

/** Appended to the human's words so an unattended run does not stop at a question nobody will answer, and stops where the case says. */
export function buildWorkerPrompt(c) {
  return `${c.prompt}\n\n（这是一次无人值守的回放，人不在场：不要向人提问，按你的判断直接做；做到「${c.stop_at}」就停下，不要继续往后；最后用一段话说明你交给人的是什么。）`;
}

/** The two products are anonymous (A, B): the judge is not told which one the changed plugin made. */
export function buildJudgePrompt(c, productA, productB) {
  return [
    '你是一个判定员。下面有同一件事跑出来的两份产物（A、B），请只回答一道是/否题。',
    '',
    '规则：只依据产物里写了的东西作答，不要脑补；答「是」要能指出产物里的原文作为出处，找不到出处就答「否」。不要使用任何工具。',
    '',
    `题：${c.question}`,
    `（这道题是从人当时的这句话写出来的：${c.quote}）`,
    '',
    '最后一行只输出一个 JSON 对象，形如：{"A":{"answer":"是或否","cite":"出处，引原文"},"B":{"answer":"是或否","cite":"出处，引原文"}}',
    '',
    '===== 产物 A =====',
    productA,
    '',
    '===== 产物 B =====',
    productB,
  ].join('\n');
}

/**
 * What a run left behind, as one text the judge can read: its closing words plus each file it wrote.
 * `perFile` caps one file, `total` caps the whole text.
 */
/** What the judge sees of a file the run left behind: its text, or a one-line note for a binary file (a NUL byte means binary; raw bytes in the judge prompt make spawn throw). */
export function fileBody(buf) {
  return buf.includes(0) ? `（二进制文件，${buf.length} 字节，内容略）` : buf.toString('utf8');
}

export function buildArtifact({ resultText, files }, { perFile = 12_000, total = 60_000 } = {}) {
  const parts = ['## 最后一段回复', '', resultText || '（没有最后回复）', '', '## 工作区里新增或改动的文件', ''];
  if (!files.length) parts.push('（没有新增或改动的文件）');
  for (const f of files) {
    const body = f.content.length > perFile ? `${f.content.slice(0, perFile)}\n…（已截断，原长 ${f.content.length} 字）` : f.content;
    parts.push(`### ${f.path}`, '', body, '');
  }
  const text = parts.join('\n');
  return text.length > total ? `${text.slice(0, total)}\n…（已截断）` : text;
}

/** Rough spend per case in dollars: two worker sessions plus one judge. Reference: an empty `claude -p` is about $0.3–0.5; one full skill run about $1.5. */
export function estimateCostUsd(nCases) {
  return { low: 3 * 0.35 * nCases, high: (2 * 1.5 + 0.5) * nCases };
}

/**
 * Human overrides live in the case's annotations.md, one line per side per run:
 *   - 推翻 <run-id> 改前=是|否 ｜ 理由
 * @returns {Record<string, {before?: 'yes'|'no', after?: 'yes'|'no'}>}
 */
export function parseOverrides(text) {
  const out = {};
  const re = /^\s*[-*]\s*推翻\s+(\S+)\s+(改前|改后)\s*[=：:]\s*(是|否)/;
  for (const line of String(text ?? '').split('\n')) {
    const m = re.exec(line);
    if (!m) continue;
    (out[m[1]] ??= {})[m[2] === '改前' ? 'before' : 'after'] = normalizeAnswer(m[3]);
  }
  return out;
}

/** The answers after the human's override for this run (and only this run) is applied. */
export function settleVerdicts(judged, overrides, runId) {
  return { ...judged, ...(overrides[runId] ?? {}) };
}
