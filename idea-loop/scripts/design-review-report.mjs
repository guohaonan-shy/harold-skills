#!/usr/bin/env node
/**
 * The design review report: one round of design convergence, laid out as a single HTML page.
 *
 * Each round the human gets this page instead of a long text list: what changed without being
 * declared, what the critic (the judge) said with the researcher's user path and reference pictures,
 * how the critic assessed the human's own reasoning, and the score. The human reads it and answers
 * in the conversation by number. The structure is the same every round and the pictures have to be
 * inlined, which is why a script builds it and the session does not write it by hand.
 *
 * Everything is decided here, on plain data, so it is unit-tested without a browser:
 *
 *   judge        the critic's JSON (`critic-score.mjs` shape): { findings, reasoning, score, note }.
 *                A finding's number is its 1-based place in `findings` — the same number the
 *                researcher's `covers` / `uncovered` use.
 *   research     the researcher's light-use file (`research-light.json`, see uiux-research's
 *                `references/light-return.md`), with its image paths resolved by the caller.
 *   diff         `ui-measure.mjs` in `canvas-diff` mode, run with `--json` and a change set
 *                (`classified: true`): `undeclared` lists the anchors that changed without being declared,
 *                each with the two area screenshots.
 *   canvas       { current, previous? }: the address of this version's canvas page (and the previous one).
 *                A canvas link can locate a version and a state, nothing finer: `<page>?state=<name>`.
 *   thoughts     [{ id, quote }]: what the human wrote down this round, one entry per thought, with their own
 *                words (`round-<N>/thoughts.md`, read by `parseThoughts`). Every thought the critic assessed
 *                (`judge.reasoning[].id`) must have its words here, or the report is refused and the missing
 *                ones are listed; thoughts nobody assessed (kept after discussion) are simply not shown.
 *   selfCheck    optional. [{ state, anchor, what, why }]: what the designer changed in its own pre-delivery
 *                self-check, one entry per place, as the designer wrote it in its handback (the session copies
 *                it into `self-check.json`). Self-check changes are not in the change set, so the comparison lists
 *                them as undeclared; an undeclared change that matches an entry by `state` + `anchor` shows the
 *                designer's reason beside it, one that matches nothing says the designer gave no reason. When the
 *                input is left out, the page says nothing about reasons at all.
 *                An entry that matches no undeclared change but sits on the same `state` + `anchor` as a
 *                declared change (`diff.declared`: the comparison counts the whole block as declared, so the
 *                designer's own edit hides inside the decision's) is listed in the same first section, with the
 *                block's before / after pictures, the designer's reason and the decisions that also changed this
 *                block, and asks keep or undo. Only an entry that matches neither is left off the page.
 *   dissatisfied [{ opinion, quote }]: the session's mark that the human, in this refine, already said
 *                they are not satisfied with the block a `direction` opinion is about, with their own
 *                words. Whether they were is the session's call; this file only renders the mark.
 *
 * Order of the page: undeclared changes (only when there are some) → the critic's opinions →
 * the assessment of the human's reasoning → score and the critic's note. Every entry in the first
 * three sections has a number, unique across the page and consecutive from 1.
 *
 * Pure but for `readImage`, which the caller passes in: path → Buffer.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';

/** Sentence the page shows where reference pictures would be, when the researcher could not reach Mobbin. */
export const NO_REFERENCE_MESSAGE = '这一轮没有参考图：Mobbin 没连上';

export const RECOMMEND_KEEP = '保留';
export const RECOMMEND_REOPEN = '回 imagine 重开这一块';

const KIND_LABEL = { direction: '方向性意见', pattern: '模式', craft: '做工' };
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Read `thoughts.md`: one thought per line, `<id> | <the human's words>`; a line that does not start with
 * `<id> | ` continues the previous thought (the human wrote more than one line). Blank lines are skipped.
 * @returns {{ id: string, quote: string }[]}
 * @throws  Error naming the line when text comes before the first thought, or an id appears twice
 */
export function parseThoughts(text) {
  const thoughts = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === '') return;
    const m = line.match(/^(\S+) \| (.*)$/);
    if (m) {
      if (thoughts.some((t) => t.id === m[1])) throw new Error(`thoughts line ${i + 1}: thought ${m[1]} appears twice`);
      thoughts.push({ id: m[1], quote: m[2].trim() });
    } else if (thoughts.length) {
      thoughts[thoughts.length - 1].quote += `\n${line.trim()}`;
    } else {
      throw new Error(`thoughts line ${i + 1}: expected "<id> | <the human's words>", got ${JSON.stringify(line)}`);
    }
  });
  return thoughts;
}

/** `<page>?state=<name>`: the same way `ui-measure.mjs` addresses a state of a canvas. */
export function canvasLink(url, state) {
  const u = new URL(url);
  u.searchParams.set('state', state);
  return u.toString();
}

/** `v3.html` → `v3`; an address without a file name falls back to its host and path. */
export function versionLabel(url) {
  const u = new URL(url);
  const last = u.pathname.split('/').filter(Boolean).pop();
  return last ? last.replace(/\.[^.]+$/, '') : u.host;
}

function validateInputs({ judge, research, diff, canvas, dissatisfied, thoughts, selfCheck }) {
  const errors = [];

  if (!isObject(judge)) errors.push('judge must be the critic\'s JSON object');
  else {
    if (!Array.isArray(judge.findings)) errors.push('judge.findings must be an array');
    else {
      judge.findings.forEach((f, i) => {
        const at = `judge.findings[${i}]`;
        if (!isObject(f)) return errors.push(`${at} must be an object`);
        if (!KIND_LABEL[f.kind]) errors.push(`${at}.kind must be one of ${Object.keys(KIND_LABEL).join(' / ')}`);
        for (const k of ['state', 'where', 'detail', 'why']) if (!isText(f[k])) errors.push(`${at}.${k} must be a non-empty string`);
      });
    }
    if (!Array.isArray(judge.reasoning)) errors.push('judge.reasoning must be an array');
    else {
      judge.reasoning.forEach((r, i) => {
        if (!isObject(r) || !isText(String(r.id ?? '')) || !isText(r.verdict) || !isText(r.why)) {
          errors.push(`judge.reasoning[${i}] needs id, verdict and why`);
        }
      });
    }
    if (!Number.isInteger(judge.score) || judge.score < 1 || judge.score > 10) errors.push('judge.score must be an integer 1–10');
  }

  if (!isObject(research) || research.mode !== 'light') errors.push('research must be the researcher\'s light-use file (mode "light")');
  else if (research.mobbin !== 'connected' && research.mobbin !== 'unavailable') errors.push('research.mobbin must be "connected" or "unavailable"');
  else if (!Array.isArray(research.items)) errors.push('research.items must be an array');

  if (!isObject(diff) || diff.mode !== 'canvas-diff') errors.push('diff must be the output of ui-measure.mjs in canvas-diff mode (--json)');
  else if (diff.classified !== true) {
    errors.push('diff was run without a change set (classified is not true): without one every change looks undeclared; run it with "changeSet" ([] in the first round)');
  } else if (!Array.isArray(diff.undeclared)) errors.push('diff.undeclared must be an array');
  else if (diff.declared !== undefined && !Array.isArray(diff.declared)) errors.push('diff.declared must be an array');

  if (!isObject(canvas) || !isText(canvas.current)) errors.push('canvas.current (the address of this version\'s canvas page) is required');
  else {
    for (const key of ['current', 'previous']) {
      if (canvas[key] === undefined) continue;
      try { new URL(canvas[key]); } catch { errors.push(`canvas.${key} is not an absolute address: ${JSON.stringify(canvas[key])}`); }
    }
  }

  if (!Array.isArray(thoughts) || !thoughts.every((t) => isObject(t) && isText(String(t.id ?? '')) && typeof t.quote === 'string')) {
    errors.push('thoughts must be an array of { id, quote } (the round\'s thoughts.md, read with parseThoughts)');
  } else if (Array.isArray(judge?.reasoning)) {
    const have = new Map(thoughts.map((t) => [String(t.id), t.quote]));
    const missing = judge.reasoning.map((r) => String(r?.id)).filter((id) => !isText(have.get(id) ?? ''));
    if (missing.length) errors.push(`thoughts has no words from the human for the thought${missing.length > 1 ? 's' : ''} the critic assessed: ${missing.join(', ')}`);
  }

  if (selfCheck !== undefined) {
    if (!Array.isArray(selfCheck)) errors.push('selfCheck must be an array of { state, anchor, what, why }');
    else {
      const seen = new Set();
      selfCheck.forEach((c, i) => {
        const at = `selfCheck[${i}]`;
        if (!isObject(c)) return errors.push(`${at} must be an object`);
        for (const k of ['state', 'anchor', 'what', 'why']) if (!isText(c[k])) errors.push(`${at}.${k} must be a non-empty string`);
        const id = JSON.stringify([c.state, c.anchor]);
        if (seen.has(id)) errors.push(`${at}: ${c.state} · ${c.anchor} is written twice`);
        seen.add(id);
      });
    }
  }

  const count = Array.isArray(judge?.findings) ? judge.findings.length : 0;
  if (!Array.isArray(dissatisfied)) errors.push('dissatisfied must be an array of { opinion, quote }');
  else {
    const seen = new Set();
    dissatisfied.forEach((d, i) => {
      const at = `dissatisfied[${i}]`;
      if (!isObject(d) || !Number.isInteger(d.opinion) || d.opinion < 1 || d.opinion > count) {
        return errors.push(`${at}.opinion must be one of the critic's opinion numbers 1–${count}`);
      }
      if (!isText(d.quote)) errors.push(`${at}.quote must be the human's own words, non-empty`);
      if (judge.findings[d.opinion - 1]?.kind !== 'direction') errors.push(`${at}: opinion ${d.opinion} is not a direction opinion; the mark only applies to those`);
      if (seen.has(d.opinion)) errors.push(`${at}: opinion ${d.opinion} is marked twice`);
      seen.add(d.opinion);
    });
  }
  return errors;
}

/**
 * An opinion number as the researcher wrote it, 1 or "1", as the number it means. The return check
 * accepts both and compares them as text, so the report must too. Anything else (0, "01", "a") is no opinion number.
 */
function opinionNumber(n) {
  if (Number.isInteger(n)) return n;
  if (typeof n === 'string' && /^[1-9]\d*$/.test(n)) return Number(n);
  return null;
}

/** Which research item speaks for each opinion number, and which opinions it explicitly left uncovered. */
function indexResearch(research, count) {
  const itemOf = new Map();
  const uncovered = new Map();
  const errors = [];
  research.items.forEach((item, i) => {
    for (const raw of item.covers ?? []) {
      const n = opinionNumber(raw);
      if (n === null || n < 1 || n > count) errors.push(`research.items[${i}] covers opinion ${raw}, which the critic did not give`);
      else if (itemOf.has(n)) errors.push(`opinion ${n} is covered by two research items`);
      else itemOf.set(n, { item, index: i });
    }
  });
  for (const u of research.uncovered ?? []) {
    const n = opinionNumber(u?.opinion);
    if (n !== null) uncovered.set(n, u.why);
  }
  if (research.mobbin === 'connected') {
    for (let n = 1; n <= count; n++) {
      if (!itemOf.has(n) && !uncovered.has(n)) errors.push(`opinion ${n} has neither a research item nor an entry in research.uncovered`);
    }
  }
  return { itemOf, uncovered, errors };
}

/** What the page recommends for one opinion, and why. */
function recommend(finding, item, mark) {
  if (finding.kind === 'direction') {
    return mark
      ? { action: RECOMMEND_REOPEN, quote: mark.quote }
      : { action: RECOMMEND_KEEP };
  }
  return item ? { action: '照新的设计意图改', intent: item.intent } : { action: '收下评委的意见' };
}

/**
 * Build the report.
 *
 * @returns {{ html: string, summary: string, entries: [{ n, section, ... }], unmatchedSelfCheck: [{ state, anchor, what, why }] }}
 *          `unmatchedSelfCheck`: self-check entries that matched neither an undeclared change nor a declared one
 *          (nothing to show for them).
 *          `summary` is the short text for the conversation: the score and the items needing attention.
 *          The report's own link is added by the session after it publishes the page.
 * @throws  Error whose message lists every problem with the inputs
 */
export function buildReport({ judge, research, diff, canvas, thoughts, dissatisfied = [], selfCheck, readImage }) {
  const errors = validateInputs({ judge, research, diff, canvas, dissatisfied, thoughts, selfCheck });
  if (errors.length) throw new Error(errors.join('\n'));
  const { itemOf, uncovered, errors: researchErrors } = indexResearch(research, judge.findings.length);
  if (researchErrors.length) throw new Error(researchErrors.join('\n'));

  const imageUri = (path) => {
    let buffer;
    try {
      buffer = readImage(path);
    } catch (e) {
      throw new Error(`cannot read image ${path}: ${e.message}`);
    }
    const mime = MIME[extname(path).toLowerCase()];
    if (!mime) throw new Error(`image ${path} has an extension this report cannot inline (${Object.keys(MIME).join(' ')})`);
    return `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`;
  };
  const figure = (path, caption) => `<figure><img src="${imageUri(path)}" alt="${esc(caption)}"><figcaption>${esc(caption)}</figcaption></figure>`;

  const marks = new Map(dissatisfied.map((d) => [d.opinion, d]));
  const selfChecks = new Map((selfCheck ?? []).map((c) => [JSON.stringify([c.state, c.anchor]), c]));
  const usedSelfChecks = new Set();
  let n = 0;
  const entries = [];
  const sections = [];

  // 1. changes nobody declared, then the designer's self-check edits hidden inside a declared block
  const undeclaredKeys = new Set(diff.undeclared.map((c) => JSON.stringify([c.state, c.anchor])));
  const hidden = [];
  for (const c of diff.declared ?? []) {
    const key = JSON.stringify([c.state, c.anchor]);
    if (undeclaredKeys.has(key) || !selfChecks.has(key)) continue;
    hidden.push(c);
  }
  const listed = [...diff.undeclared.map((c) => ({ c, decisions: null })), ...hidden.map((c) => ({ c, decisions: c.decisions ?? [] }))];
  if (listed.length) {
    const cards = listed.map(({ c, decisions }) => {
      const number = ++n;
      const links = [`<a href="${esc(canvasLink(canvas.current, c.state))}">打开 ${esc(versionLabel(canvas.current))} 的「${esc(c.state)}」</a>`];
      if (canvas.previous) links.push(`<a href="${esc(canvasLink(canvas.previous, c.state))}">打开 ${esc(versionLabel(canvas.previous))} 的「${esc(c.state)}」</a>`);
      const what = c.kind === 'added' ? '这一版新增了这个锚点'
        : c.kind === 'removed' ? '这一版没有了这个锚点'
          : [...(c.changes ?? []).map((x) => `${x.property}：${x.before} → ${x.after}`),
            ...(c.pixelPercent != null && c.pixelPercent > 0 ? [`区域像素差 ${c.pixelPercent.toFixed(2)}%`] : [])].join('；');
      const shots = c.shots
        ? `<div class="pair">${figure(c.shots.before, '改前')}${figure(c.shots.after, '改后')}</div>`
        : '<p class="muted">没有区域截图：这个区域在两版里都没有面积（两边都隐藏）。</p>';
      const selfKey = JSON.stringify([c.state, c.anchor]);
      const said = selfChecks.get(selfKey);
      if (said) usedSelfChecks.add(selfKey);
      let reason = '';
      if (said) reason = `<p class="selfcheck" data-reason="given"><strong>designer 自检：</strong>${esc(said.why)}<span class="muted">（designer 写的改动：${esc(said.what)}）</span></p>`;
      else if (selfCheck) reason = '<p class="selfcheck none" data-reason="none"><strong>designer 没说明为什么改。</strong></p>';
      const decisionLabel = decisions ? decisions.map((d) => `决策 ${esc(d)}`).join('、') : '';
      const overlapNote = decisions
        ? `<p class="overlap" data-overlap="true"><strong>这一块这一轮也按${decisionLabel}改过</strong>，比对把整块算成已声明，所以 designer 自检改的这一处没被单独挑出来。下面的改前改后是整块的，两处改动混在一起；自检那处是：${esc(said.what)}</p>`
        : '';
      entries.push({
        n: number, section: 'undeclared', state: c.state, anchor: c.anchor,
        ...(selfCheck ? { selfCheck: said ? said.why : null } : {}),
        ...(decisions ? { alsoDeclaredBy: [...decisions] } : {}),
      });
      return `<article id="r${number}" data-n="${number}" data-kind="undeclared">
<h3><span class="num">#${number}</span> ${esc(c.state)} · ${esc(c.anchor)}</h3>
${decisions ? `<p class="muted">整块的比对差异：${esc(what)}</p>` : `<p>${esc(what)}</p>`}
${overlapNote}
${reason}
${shots}
<p class="ask">${decisions ? 'designer 自检改的这一处没有出现在改动集里。' : '这处改动没有出现在改动集里。'}<strong>留，还是撤？</strong>（这一条要你定）</p>
<p class="links">${links.join(' · ')}</p>
</article>`;
    });
    sections.push(`<section data-section="undeclared"><h2>没声明却变了的地方</h2>
<p class="muted">设计师这一版动了下面这些地方，但改动集里没写（设计师交付前自检改的地方也在这里，包括落在这一轮按决策改过的同一块里的）。每一条回「留」或「撤」；撤的会写进 ledger，下一轮照撤。</p>
${cards.join('\n')}</section>`);
  }

  // 2. the critic's opinions, one by one
  const firstOfItem = new Map(); // research item index → report number of the first opinion it speaks for
  const opinionCards = judge.findings.map((f, i) => {
    const opinion = i + 1;
    const number = ++n;
    const hit = itemOf.get(opinion);
    const item = hit?.item;
    const mark = marks.get(opinion);
    const rec = recommend(f, item, mark);
    const isFirst = item && !firstOfItem.has(hit.index);
    if (isFirst) firstOfItem.set(hit.index, number);

    let reference;
    if (research.mobbin === 'unavailable') {
      reference = `<div class="ref none"><p>${esc(NO_REFERENCE_MESSAGE)}</p></div>`;
    } else if (uncovered.has(opinion)) {
      reference = `<div class="ref none"><p>没有找到能呈现这一点的参考：${esc(uncovered.get(opinion))}</p></div>`;
    } else if (!isFirst) {
      reference = `<div class="ref"><p class="muted">跟 #${firstOfItem.get(hit.index)} 是同一件事：用户路径和设计意图见 #${firstOfItem.get(hit.index)}。</p></div>`;
    } else {
      const steps = item.path.map((s, k) => `<li>
<p><strong>${esc(s.source)}</strong>　看到：${esc(s.saw)}　做了：${esc(s.did)}　接着看到：${esc(s.then)}</p>
<div class="pair">${(s.images ?? []).map((p, j) => figure(p, `${s.source} 第 ${k + 1} 步图 ${j + 1}`)).join('')}</div>
<p class="muted">${esc(s.reading)}</p></li>`).join('\n');
      const overturns = (item.overturns ?? []).map((o) => `<p class="overturn">推翻 ledger ${esc(o.ledger)}（报告 #${number}）：${esc(o.why)}</p>`).join('\n');
      reference = `<div class="ref"><h4>用户路径</h4><ol>${steps}</ol>${overturns}</div>`;
    }
    const intent = item && isFirst && item.intent ? `<p class="intent"><strong>新的设计意图：</strong>${esc(item.intent)}</p>` : '';
    const recLine = rec.quote
      ? `<p class="rec" data-action="${esc(rec.action)}"><strong>推荐：${esc(rec.action)}。</strong>你这次说过：「${esc(rec.quote)}」</p>`
      : `<p class="rec" data-action="${esc(rec.action)}"><strong>推荐：${esc(rec.action)}。</strong></p>`;

    entries.push({
      n: number, section: 'opinions', opinion, kind: f.kind, state: f.state, recommend: rec.action,
      overturns: isFirst ? (item.overturns ?? []).map((o) => ({ ledger: o.ledger, why: o.why })) : [],
    });
    return `<article id="r${number}" data-n="${number}" data-kind="${esc(f.kind)}">
<h3><span class="num">#${number}</span> <span class="tag">${esc(KIND_LABEL[f.kind])}</span> ${esc(f.state)} · ${esc(f.where)}</h3>
<blockquote><p>${esc(f.detail)}</p><p class="muted">${esc(f.why)}</p></blockquote>
${f.reference ? `<p class="muted">评委想要的参考画面：${esc(f.reference)}</p>` : ''}
${reference}
${intent}
${recLine}
<p class="links"><a href="${esc(canvasLink(canvas.current, f.state))}">打开 ${esc(versionLabel(canvas.current))} 的「${esc(f.state)}」</a></p>
</article>`;
  });
  sections.push(`<section data-section="opinions"><h2>评委的意见</h2>
<p class="muted">评委是顾问，意见不会自动改画布。每一条都请回应，没回的会话会接着问。</p>
${opinionCards.length ? opinionCards.join('\n') : '<p class="muted">评委这一轮没有提意见。</p>'}</section>`);

  // 3. the assessment of the human's own reasoning
  const said = new Map(thoughts.map((t) => [String(t.id), t.quote]));
  const reasoningCards = judge.reasoning.map((r) => {
    const number = ++n;
    const quote = said.get(String(r.id));
    entries.push({ n: number, section: 'reasoning', id: String(r.id), verdict: r.verdict, quote });
    return `<article id="r${number}" data-n="${number}" data-kind="reasoning">
<h3><span class="num">#${number}</span> 你的思路 ${esc(r.id)}</h3>
<blockquote class="said"><p>你说：「${esc(quote).replace(/\n/g, '<br>')}」</p></blockquote>
<p>→ 评委：<span class="tag">${esc(r.verdict)}</span>，理由：${esc(r.why)}</p>
</article>`;
  });
  sections.push(`<section data-section="reasoning"><h2>评委对你这一轮思路的评估</h2>
${reasoningCards.length ? reasoningCards.join('\n') : '<p class="muted">这一轮没有要评估的思路。</p>'}</section>`);

  // 4. score and the critic's own summary
  sections.push(`<section data-section="score"><h2>分数与评委的总评</h2>
<p class="score"><strong>${judge.score}</strong> / 10</p>
<p class="muted">分数只是评委的参考，不决定停不停；停由你定。</p>
${judge.note ? `<p>${esc(judge.note)}</p>` : '<p class="muted">评委没有写总评。</p>'}</section>`);

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>设计评审报告</title>
<style>
:root { --bg:#fff; --fg:#1d1d1f; --muted:#6b6b72; --line:#e2e2e6; --card:#f7f7f9; --accent:#0a5bd8; --warn-bg:#fff1d6; --warn-fg:#7a4a00; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#141416; --fg:#ececf0; --muted:#9a9aa3; --line:#2c2c31; --card:#1c1c20; --accent:#6aa3ff; --warn-bg:#3a2c0e; --warn-fg:#ffd58a; } }
:root[data-theme="dark"] { --bg:#141416; --fg:#ececf0; --muted:#9a9aa3; --line:#2c2c31; --card:#1c1c20; --accent:#6aa3ff; --warn-bg:#3a2c0e; --warn-fg:#ffd58a; }
body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.6 system-ui, sans-serif; }
main { max-width:860px; margin:0 auto; padding:24px 16px 64px; }
h1 { font-size:24px; } h2 { font-size:20px; margin-top:40px; border-bottom:1px solid var(--line); padding-bottom:6px; } h3 { font-size:17px; margin:0 0 8px; } h4 { margin:12px 0 4px; }
article { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:14px 16px; margin:14px 0; }
.num { color:var(--accent); font-variant-numeric:tabular-nums; } .tag { font-size:13px; border:1px solid var(--line); border-radius:4px; padding:0 6px; }
.muted { color:var(--muted); } blockquote { margin:8px 0; padding-left:12px; border-left:3px solid var(--line); }
.pair { display:flex; flex-wrap:wrap; gap:12px; } figure { margin:0; } figure img { max-width:100%; max-height:520px; width:auto; height:auto; border:1px solid var(--line); border-radius:4px; background:#fff; } figcaption { font-size:13px; color:var(--muted); }
.overturn { background:var(--warn-bg); color:var(--warn-fg); border-radius:6px; padding:8px 12px; font-weight:600; }
.ask, .rec, .selfcheck { margin:10px 0 4px; } .selfcheck.none { color:var(--warn-fg); } .score { font-size:32px; margin:8px 0 0; } a { color:var(--accent); } ol { padding-left:20px; }
</style>
</head>
<body>
<main>
<h1>设计评审报告</h1>
<p class="muted">每条有编号，在对话里按编号回你的决定。</p>
${sections.join('\n')}
</main>
</body>
</html>
`;
  const unmatchedSelfCheck = (selfCheck ?? []).filter((c) => !usedSelfChecks.has(JSON.stringify([c.state, c.anchor])));
  return { html, summary: renderSummary({ judge, entries, undeclaredCount: entries.filter((e) => e.section === 'undeclared').length }), entries, unmatchedSelfCheck };
}

/**
 * The short text for the conversation: the score and the items that need special attention —
 * undeclared changes, overturn proposals against the ledger, direction opinions. Nothing else.
 */
export function renderSummary({ judge, entries, undeclaredCount }) {
  const lines = [`设计评审报告：评委打了 ${judge.score} 分（只是参考）`];
  const attention = [];
  const undeclared = entries.filter((e) => e.section === 'undeclared');
  if (undeclaredCount) attention.push(`没声明却变了的地方 ${undeclaredCount} 处：${undeclared.map((e) => `#${e.n}`).join('、')}，每处要你定留还是撤`);
  for (const e of entries) {
    for (const o of e.overturns ?? []) attention.push(`#${e.n} 提议推翻 ledger ${o.ledger}：${o.why}`);
  }
  for (const e of entries.filter((x) => x.kind === 'direction')) {
    attention.push(`#${e.n} 方向性意见（${e.state}），推荐${e.recommend}`);
  }
  if (attention.length) lines.push('要特别注意：', ...attention.map((a) => `- ${a}`));
  else lines.push('没有要特别注意的项。');
  return lines.join('\n');
}

// CLI: node design-review-report.mjs --judge <critic.json> --research <research-light.json> --diff <canvas-diff.json>
//        --thoughts <thoughts.md> --canvas <this version's page address> [--previous <previous version's page address>]
//        [--dissatisfied <marks.json>] [--self-check <self-check.json>] --out <report.html>
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const at = args.indexOf(`--${name}`);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const need = ['judge', 'research', 'diff', 'thoughts', 'canvas', 'out'].filter((k) => !flag(k));
  if (need.length) {
    console.error(`usage: design-review-report.mjs --judge <critic.json> --research <research-light.json> --diff <canvas-diff.json> --thoughts <thoughts.md> --canvas <address> [--previous <address>] [--dissatisfied <marks.json>] [--self-check <self-check.json>] --out <report.html>\n  missing: ${need.map((k) => `--${k}`).join(' ')}`);
    process.exit(1);
  }
  const read = (path) => {
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      console.error(`design-review-report: cannot read ${path}: ${e.message}`);
      process.exit(1);
    }
  };
  const readText = (path) => {
    try {
      return readFileSync(path, 'utf8');
    } catch (e) {
      console.error(`design-review-report: cannot read ${path}: ${e.message}`);
      process.exit(1);
    }
  };
  const researchFile = resolve(flag('research'));
  const researchDir = dirname(researchFile);
  const research = read(researchFile);
  // The researcher writes image paths relative to its own file; the area shots from ui-measure are absolute.
  const resolveImage = (p) => (isAbsolute(p) ? p : join(researchDir, p));
  for (const item of research.items ?? []) for (const s of item.path ?? []) s.images = (s.images ?? []).map(resolveImage);
  try {
    const { html, summary, unmatchedSelfCheck } = buildReport({
      judge: read(flag('judge')),
      research,
      diff: read(flag('diff')),
      thoughts: parseThoughts(readText(flag('thoughts'))),
      canvas: { current: flag('canvas'), ...(flag('previous') ? { previous: flag('previous') } : {}) },
      dissatisfied: flag('dissatisfied') ? read(flag('dissatisfied')) : [],
      selfCheck: flag('self-check') ? read(flag('self-check')) : undefined,
      readImage: (p) => {
        if (!existsSync(p)) throw new Error('file does not exist');
        return readFileSync(p);
      },
    });
    writeFileSync(flag('out'), html);
    for (const c of unmatchedSelfCheck) console.error(`design-review-report: self-check entry ${c.state} · ${c.anchor} matches neither an undeclared nor a declared change, so it is not on the page`);
    console.log(summary);
  } catch (e) {
    console.error(`design-review-report: ${e.message}`);
    process.exit(2);
  }
}
